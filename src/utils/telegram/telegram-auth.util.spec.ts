import assert from 'node:assert/strict';
import test from 'node:test';
import { isTelegramLoginId, parseAuthStart } from './telegram-auth.util';

const loginId = '3f6c0a3b9d2e4f718a5b6c7d8e9f0a1b';
test('parses opaque login IDs and bot-addressed starts', () => {
  assert.deepEqual(parseAuthStart(`/start@example_bot auth_${loginId}`), { login_id: loginId });
  for (const value of ['/start', '/start aksiya_01', `auth_${loginId}`]) {
    assert.equal(parseAuthStart(value), null);
  }
});
test('rejects phone-only, uppercase and malformed auth links', () => {
  for (const id of [
    '998901234567',
    '',
    loginId.toUpperCase(),
    loginId.slice(1),
    `${loginId}0`,
    `${loginId} extra`,
    `${loginId}\nextra`,
  ]) {
    assert.deepEqual(parseAuthStart(`/start auth_${id}`), { login_id: null });
    assert.equal(isTelegramLoginId(id), false);
  }
  assert.equal(isTelegramLoginId(loginId), true);
});
