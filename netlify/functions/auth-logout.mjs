import { clearSessionCookie, json } from './lib/auth.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' }, { allow: 'POST' });
  return json(200, { ok: true }, { 'set-cookie': clearSessionCookie() });
}
