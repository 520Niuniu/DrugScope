import assert from 'node:assert/strict';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import test from 'node:test';
import { isAllowedUser } from '../netlify/edge-functions/auth-guard.js';
import { authenticate } from '../netlify/functions/lib/auth.mjs';

const scrypt = promisify(scryptCallback);
const email = 'user@example.com';
const password = 'correct horse battery staple';
const salt = randomBytes(16).toString('base64url');
const derived = await scrypt(password, salt, 64);
const passwordHash = `scrypt$${salt}$${derived.toString('base64url')}`;
const user = { email, name: 'Test User', passwordHash };

for (const [label, value] of [
  ['user array', [user]],
  ['single user object', user],
  ['email mapping', { [email]: passwordHash }],
  ['quoted JSON', JSON.stringify([user])]
]) {
  test(`authenticates a ${label}`, async () => {
    process.env.DRUGSCOPE_USERS_JSON = JSON.stringify(value);
    assert.deepEqual(await authenticate(email, password), { email, name: label === 'email mapping' ? email : 'Test User' });
    assert.equal(await authenticate(email, `${password}!`), null);
  });
}

test('rejects a malformed password hash as a configuration error', async () => {
  process.env.DRUGSCOPE_USERS_JSON = JSON.stringify([{ email, passwordHash: 'not-a-scrypt-hash' }]);
  await assert.rejects(authenticate(email, password), /invalid passwordHash/);
});

for (const [label, value] of [
  ['user array', [user]],
  ['single user object', user],
  ['email mapping', { [email]: passwordHash }],
  ['quoted JSON', JSON.stringify([user])]
]) {
  test(`edge guard authorizes a ${label}`, () => {
    globalThis.Netlify = { env: { get: () => JSON.stringify(value) } };
    assert.equal(isAllowedUser(email), true);
    assert.equal(isAllowedUser('other@example.com'), false);
  });
}
