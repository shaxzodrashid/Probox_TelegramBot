import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTelegramAuthDeepLink,
  normalizeAuthPhone,
  parseAuthStart,
} from './telegram-auth.util';

test('generates a Telegram-safe phone link and parses bot-addressed starts', () => {
  assert.equal(
    buildTelegramAuthDeepLink('@example_bot', '+998 (90) 123-45-67'),
    'https://t.me/example_bot?start=auth_998901234567',
  );
  assert.deepEqual(parseAuthStart('/start@example_bot auth_998901234567'), {
    phone_number: '+998901234567',
  });
  assert.equal(parseAuthStart('/start aksiya_01'), null);
  assert.equal(parseAuthStart('/start'), null);
  assert.equal(parseAuthStart('auth_998901234567'), null);
});

test('rejects malformed auth payloads rather than treating them as ordinary starts', () => {
  for (const payload of [
    'auth_',
    'auth_+998901234567',
    'auth_998 901234567',
    'auth_123',
    'auth_01234567',
    'auth_1234567890123456',
    'auth_998901234567_extra',
  ]) {
    assert.deepEqual(parseAuthStart(`/start ${payload}`), { phone_number: null }, payload);
  }
});

test('normalizes formatting while preserving full country codes and rejecting garbage', () => {
  assert.equal(normalizeAuthPhone('+998 (90) 123-45-67'), '+998901234567');
  assert.equal(normalizeAuthPhone('998901234567'), '+998901234567');
  assert.equal(normalizeAuthPhone('+1901234567'), '+1901234567');
  assert.notEqual(normalizeAuthPhone('+1901234567'), normalizeAuthPhone('+998901234567'));
  for (const phone of [
    'phone998901234567',
    '++998901234567',
    '123',
    '01234567',
    '+1234567890123456',
  ]) {
    assert.equal(normalizeAuthPhone(phone), null, phone);
    assert.throws(() => buildTelegramAuthDeepLink('example_bot', phone));
  }
  assert.throws(() => buildTelegramAuthDeepLink('bad/bot', '+998901234567'));
});
