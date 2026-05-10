import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractDigits, normalizeUzPhone, normalizeUzPhoneOrNull, strictNormalizeUzPhone } from './uz-phone.util';

test('extractDigits strips non-digit characters', () => {
  assert.strictEqual(extractDigits('+998 (90) 123-45-67'), '998901234567');
  assert.strictEqual(extractDigits('90-123-45-67'), '901234567');
  assert.strictEqual(extractDigits('abc 123 def'), '123');
});

test('extractDigits handles empty strings and strings with no digits', () => {
  assert.strictEqual(extractDigits(''), '');
  assert.strictEqual(extractDigits('abc-()!'), '');
});

test('normalizeUzPhone extracts valid 9-digit number components', () => {
  const result = normalizeUzPhone('+998 (90) 123-45-67');
  assert.deepEqual(result, {
    raw: '+998 (90) 123-45-67',
    digits: '998901234567',
    last9: '901234567',
    full: '998901234567'
  });

  const result9 = normalizeUzPhone('901234567');
  assert.deepEqual(result9, {
    raw: '901234567',
    digits: '901234567',
    last9: '901234567',
    full: '998901234567'
  });
});

test('normalizeUzPhone throws error if digits length is less than 9', () => {
  assert.throws(() => normalizeUzPhone('12345678'), /Invalid phone number/);
  assert.throws(() => normalizeUzPhone(''), /Invalid phone number/);
});

test('normalizeUzPhoneOrNull returns null for falsy inputs and short strings', () => {
  assert.strictEqual(normalizeUzPhoneOrNull(null), null);
  assert.strictEqual(normalizeUzPhoneOrNull(undefined), null);
  assert.strictEqual(normalizeUzPhoneOrNull(''), null);
  assert.strictEqual(normalizeUzPhoneOrNull('12345678'), null);
});

test('normalizeUzPhoneOrNull returns normalized string for valid inputs', () => {
  assert.strictEqual(normalizeUzPhoneOrNull('+998 (90) 123-45-67'), '+998901234567');
  assert.strictEqual(normalizeUzPhoneOrNull('901234567'), '+998901234567');
});

test('strictNormalizeUzPhone handles 9 digit numbers', () => {
  assert.strictEqual(strictNormalizeUzPhone('901234567'), '+998901234567');
  assert.strictEqual(strictNormalizeUzPhone('991234567'), '+998991234567');
});

test('strictNormalizeUzPhone handles 12 digit numbers starting with 998', () => {
  assert.strictEqual(strictNormalizeUzPhone('998901234567'), '+998901234567');
  assert.strictEqual(strictNormalizeUzPhone('+998901234567'), '+998901234567');
});

test('strictNormalizeUzPhone handles formatted numbers', () => {
  assert.strictEqual(strictNormalizeUzPhone('+998 (90) 123-45-67'), '+998901234567');
  assert.strictEqual(strictNormalizeUzPhone('90-123-45-67'), '+998901234567');
});

test('strictNormalizeUzPhone throws on invalid numbers', () => {
  assert.throws(() => strictNormalizeUzPhone('1234567'), /Invalid Uzbekistan phone number/);
  assert.throws(() => strictNormalizeUzPhone('1234567890'), /Invalid Uzbekistan phone number/);
  assert.throws(() => strictNormalizeUzPhone('778901234567'), /Invalid Uzbekistan phone number/); // Not 998 prefix
});
