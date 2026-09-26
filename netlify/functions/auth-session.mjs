import { json, readSession } from './lib/auth.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' }, { allow: 'GET' });
  const session = readSession(event);
  if (!session) return json(401, { error: '请先登录' });
  return json(200, { user: { email: session.sub, name: session.name } });
}
