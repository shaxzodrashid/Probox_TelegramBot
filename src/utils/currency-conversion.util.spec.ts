import assert from 'node:assert/strict';
import test from 'node:test';
import { convertAmountForDisplay, parseNumericAmount } from './currency-conversion.util';

test('convertAmountForDisplay converts USD amounts to UZS using the latest rate', () => {
  const result = convertAmountForDisplay(100, 'USD', 12_500);

  assert.deepEqual(result, {
    amount: 1_250_000,
    currency: 'UZS',
    converted: true,
  });
});

test('convertAmountForDisplay leaves UZS amounts unchanged', () => {
  const result = convertAmountForDisplay(150_000, 'UZS', 12_500);

  assert.deepEqual(result, {
    amount: 150_000,
    currency: 'UZS',
    converted: false,
  });
});

test('convertAmountForDisplay keeps USD when the rate is missing', () => {
  const result = convertAmountForDisplay(100, 'USD', null);

  assert.deepEqual(result, {
    amount: 100,
    currency: 'USD',
    converted: false,
  });
});

test('parseNumericAmount safely handles invalid and empty values', () => {
  assert.equal(parseNumericAmount(0), 0);
  assert.equal(parseNumericAmount('12.5'), 12.5);
  assert.equal(parseNumericAmount('oops'), 0);
  assert.equal(parseNumericAmount(undefined), 0);
});
