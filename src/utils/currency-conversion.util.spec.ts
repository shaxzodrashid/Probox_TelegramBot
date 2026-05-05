import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getDocumentTotalByCurrency,
  getInstallmentDisplayCurrency,
  parseNumericAmount,
} from './currency-conversion.util';

test('parseNumericAmount keeps valid numeric amounts', () => {
  assert.equal(parseNumericAmount(100), 100);
  assert.equal(parseNumericAmount('150000.5'), 150000.5);
});

test('parseNumericAmount returns zero for missing or invalid amounts', () => {
  assert.equal(parseNumericAmount(null), 0);
  assert.equal(parseNumericAmount(undefined), 0);
  assert.equal(parseNumericAmount('not-a-number'), 0);
});

test('parseNumericAmount safely handles invalid and empty values', () => {
  assert.equal(parseNumericAmount(0), 0);
  assert.equal(parseNumericAmount('12.5'), 12.5);
  assert.equal(parseNumericAmount('oops'), 0);
  assert.equal(parseNumericAmount(undefined), 0);
});

test('getInstallmentDisplayCurrency preserves document currency for document-scale amounts', () => {
  assert.equal(getInstallmentDisplayCurrency('USD'), 'USD');
  assert.equal(getInstallmentDisplayCurrency(' usd ', 130, 1560), 'USD');
  assert.equal(getInstallmentDisplayCurrency('UZS'), 'UZS');
});

test('getInstallmentDisplayCurrency falls back to UZS for local-scale USD installment amounts', () => {
  assert.equal(getInstallmentDisplayCurrency('USD', 1_250_000, 100), 'UZS');
});

test('getDocumentTotalByCurrency uses DocTotalFC for UZS documents', () => {
  assert.equal(getDocumentTotalByCurrency('UZS', 12_500_000, 1_000, 12_500_000), 1_000);
});

test('getDocumentTotalByCurrency uses DocTotal for USD documents', () => {
  assert.equal(getDocumentTotalByCurrency('USD', 1_000, 12_500_000, 12_500_000), 1_000);
});
