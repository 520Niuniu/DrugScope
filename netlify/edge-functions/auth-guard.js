const COOKIE_NAME = 'drugscope_session';

function readCookie(header, name) {
  const prefix = `${name}=`;
  return String(header || '')
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(prefix))
    ?.slice(prefix.length) || '';
}

function decodeBase64Url(value) {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export function isAllowedUser(email) {
  try {
    let configured = JSON.parse(Netlify.env.get('DRUGSCOPE_USERS_JSON') || '[]');
    if (typeof configured === 'string') configured = JSON.parse(configured);

    if (Array.isArray(configured)) {
      return configured.some(user => String(user?.email || '').trim().toLowerCase() === email);
    }
    if (configured && typeof configured === 'object' && ('email' in configured || 'passwordHash' in configured)) {
      return String(configured.email || '').trim().toLowerCase() === email;
    }
    return Object.keys(configured || {}).some(candidate => candidate.trim().toLowerCase() === email);
  } catch {
    return false;
  }
}

async function hasValidSession(request) {
  const secret = Netlify.env.get('DRUGSCOPE_SESSION_SECRET');
  if (!secret) return false;

  const token = readCookie(request.headers.get('cookie'), COOKIE_NAME);
  const [encodedPayload, encodedSignature] = token.split('.');
  if (!encodedPayload || !encodedSignature) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encodedPayload)));
  const actual = decodeBase64Url(encodedSignature);
  if (!constantTimeEqual(expected, actual)) return false;

  try {
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedPayload)));
    const email = String(payload.sub || '').trim().toLowerCase();
    return Boolean(email) && Number(payload.exp) > Math.floor(Date.now() / 1000) && isAllowedUser(email);
  } catch {
    return false;
  }
}

export default async (request, context) => {
  const requestUrl = new URL(request.url);
  if (requestUrl.pathname === '/login.html' || requestUrl.pathname === '/login' || requestUrl.pathname.startsWith('/.netlify/functions/')) {
    return context.next();
  }
  if (await hasValidSession(request)) return context.next();

  const next = `${requestUrl.pathname}${requestUrl.search}`;
  const loginUrl = new URL('/login.html', request.url);
  loginUrl.searchParams.set('next', next);
  return Response.redirect(loginUrl, 302);
};
