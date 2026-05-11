import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strictNormalizeUzPhone, normalizeUzPhone } from './uz-phone.util';

test('normalizeUzPhone handles 9 digit numbers', () => {
  const result = normalizeUzPhone('901234567');
  assert.deepStrictEqual(result, {
    raw: '901234567',
    digits: '901234567',
    last9: '901234567',
    full: '998901234567',
  });
});

test('normalizeUzPhone handles 12 digit numbers starting with 998', () => {
  const result1 = normalizeUzPhone('998901234567');
  assert.deepStrictEqual(result1, {
    raw: '998901234567',
    digits: '998901234567',
    last9: '901234567',
    full: '998901234567',
  });

  const result2 = normalizeUzPhone('+998901234567');
  assert.deepStrictEqual(result2, {
    raw: '+998901234567',
    digits: '998901234567',
    last9: '901234567',
    full: '998901234567',
  });
});

test('normalizeUzPhone handles formatted numbers', () => {
  const result1 = normalizeUzPhone('+998 (90) 123-45-67');
  assert.deepStrictEqual(result1, {
    raw: '+998 (90) 123-45-67',
    digits: '998901234567',
    last9: '901234567',
    full: '998901234567',
  });

  const result2 = normalizeUzPhone('90-123-45-67');
  assert.deepStrictEqual(result2, {
    raw: '90-123-45-67',
    digits: '901234567',
    last9: '901234567',
    full: '998901234567',
  });
});

test('normalizeUzPhone throws on invalid numbers (less than 9 digits)', () => {
  assert.throws(() => normalizeUzPhone('12345678'), /Invalid phone number/);
  assert.throws(() => normalizeUzPhone('123-456'), /Invalid phone number/);
  assert.throws(() => normalizeUzPhone(''), /Invalid phone number/);
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
