import { authenticate, createSession, json, sessionCookie } from './lib/auth.mjs';

export const config = {
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip'] }
};

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' }, { allow: 'POST' });
  if (Buffer.byteLength(event.body || '', 'utf8') > 8192) return json(413, { error: '请求过大' });

  try {
    const { email, password } = JSON.parse(event.body || '{}');
    if (!email || !password) return json(400, { error: '请输入邮箱和密码' });
    const user = await authenticate(email, password);
    if (!user) return json(401, { error: '账号或密码不正确' });
    const token = createSession(user);
    return json(200, { user }, { 'set-cookie': sessionCookie(token) });
  } catch (error) {
    console.error('Login failed:', error.message);
    return json(500, { error: '登录服务尚未正确配置' });
  }
}
