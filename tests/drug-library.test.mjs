import assert from 'node:assert/strict';
import test from 'node:test';
import { handler } from '../netlify/functions/drug-library.mjs';

test('drug library endpoint only accepts GET', async () => {
  const response = await handler({ httpMethod: 'POST', headers: {} });
  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.allow, 'GET');
});

test('drug library endpoint requires a valid DrugScope session', async () => {
  const response = await handler({ httpMethod: 'GET', headers: {} });
  assert.equal(response.statusCode, 401);
  assert.equal(response.headers['cache-control'], 'private, no-store');
});
