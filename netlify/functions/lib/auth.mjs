import { createHmac, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

export const COOKIE_NAME = 'drugscope_session';
export const SESSION_SECONDS = 8 * 60 * 60;
const scrypt = promisify(scryptCallback);

function json(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      ...headers
    },
    body: JSON.stringify(body)
  };
}

function secret() {
  const value = process.env.DRUGSCOPE_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('DRUGSCOPE_SESSION_SECRET must contain at least 32 characters');
  return value;
}

function encode(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(encodedPayload) {
  return createHmac('sha256', secret()).update(encodedPayload).digest('base64url');
}

function parseCookies(header) {
  return Object.fromEntries(String(header || '').split(';').map(part => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    return [part.slice(0, index).trim(), part.slice(index + 1).trim()];
  }).filter(([name]) => name));
}

export function createSession(user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = encode(JSON.stringify({ sub: user.email, name: user.name || user.email, iat: now, exp: now + SESSION_SECONDS }));
  return `${payload}.${sign(payload)}`;
}

export function sessionCookie(token) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function readSession(event) {
  try {
    const token = parseCookies(event.headers?.cookie || event.headers?.Cookie)[COOKIE_NAME] || '';
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;
    const expected = Buffer.from(sign(payload));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!session.sub || Number(session.exp) <= Math.floor(Date.now() / 1000)) return null;
    if (!normalizedUsers().some(user => user.email === String(session.sub).toLowerCase())) return null;
    return session;
  } catch {
    return null;
  }
}

export function requireSession(event) {
  const session = readSession(event);
  if (!session) return { response: json(401, { error: '请先登录' }) };
  return { session };
}

function normalizedUsers() {
  const raw = process.env.DRUGSCOPE_USERS_JSON;
  if (!raw) throw new Error('DRUGSCOPE_USERS_JSON is not configured');
  let parsed = JSON.parse(raw);

  // Secret values are sometimes pasted into provider dashboards as a quoted
  // JSON string. Decode that representation once so the documented payload
  // still works without weakening the accepted user schema.
  if (typeof parsed === 'string') parsed = JSON.parse(parsed);

  let rows;
  if (Array.isArray(parsed)) {
    rows = parsed;
  } else if (parsed && typeof parsed === 'object' && ('email' in parsed || 'passwordHash' in parsed)) {
    // Accept the single-user object emitted by scripts/hash-password.mjs.
    rows = [parsed];
  } else if (parsed && typeof parsed === 'object') {
    // Also accept an email-to-hash (or email-to-user) mapping.
    rows = Object.entries(parsed).map(([email, value]) => (
      typeof value === 'string' ? { email, passwordHash: value } : { email, ...value }
    ));
  } else {
    throw new Error('DRUGSCOPE_USERS_JSON must contain a user object, array, or email mapping');
  }

  const users = rows
    .map(user => ({ ...user, email: String(user?.email || '').trim().toLowerCase() }))
    .filter(user => user.email);

  if (users.length === 0) throw new Error('DRUGSCOPE_USERS_JSON does not contain any users');
  if (users.some(user => !/^scrypt\$[^$]+\$[^$]+$/.test(String(user.passwordHash || '')))) {
    throw new Error('DRUGSCOPE_USERS_JSON contains an invalid passwordHash');
  }
  return users;
}

async function passwordMatches(password, storedHash) {
  const [scheme, salt, expectedText] = String(storedHash || '').split('$');
  if (scheme !== 'scrypt' || !salt || !expectedText) return false;
  const expected = Buffer.from(expectedText, 'base64url');
  if (!expected.length) return false;
  const actual = await scrypt(String(password), salt, expected.length);
  return timingSafeEqual(expected, actual);
}

export async function authenticate(email, password) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const user = normalizedUsers().find(candidate => candidate.email === normalizedEmail);
  if (!user) {
    // Spend comparable work for unknown accounts to reduce email-enumeration timing signals.
    await scrypt(String(password), 'drugscope-invalid-account', 64);
    return null;
  }
  if (!await passwordMatches(password, user.passwordHash)) return null;
  return { email: user.email, name: String(user.name || user.email) };
}

export { json };
