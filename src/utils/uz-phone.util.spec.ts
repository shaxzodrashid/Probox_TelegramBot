import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strictNormalizeUzPhone } from './uz-phone.util';

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
