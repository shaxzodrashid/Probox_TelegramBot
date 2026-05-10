import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCurrency } from './formatter.util';

test('formatCurrency formats basic number with default currency', () => {
  assert.equal(formatCurrency(100), '100 UZS');
});

test('formatCurrency formats number with thousands separator', () => {
  // Russian locale uses non-breaking space (u00A0) for thousands separator
  assert.equal(formatCurrency(1000), '1\u00A0000 UZS');
  assert.equal(formatCurrency(1000000), '1\u00A0000\u00A0000 UZS');
});

test('formatCurrency formats string numbers', () => {
  assert.equal(formatCurrency('2500'), '2\u00A0500 UZS');
  assert.equal(formatCurrency('100.5'), '100,5 UZS');
});

test('formatCurrency handles decimal formatting', () => {
  // Russian locale uses comma for decimal separator
  assert.equal(formatCurrency(10.5), '10,5 UZS');
  assert.equal(formatCurrency(10.55), '10,55 UZS');
  // Maximum 2 fraction digits
  assert.equal(formatCurrency(10.555), '10,56 UZS');
});

test('formatCurrency uses custom currency', () => {
  assert.equal(formatCurrency(500, 'USD'), '500 USD');
  assert.equal(formatCurrency(1500, 'EUR'), '1\u00A0500 EUR');
});

test('formatCurrency handles invalid input by returning 0 with currency', () => {
  assert.equal(formatCurrency('invalid'), '0 UZS');
  assert.equal(formatCurrency('invalid', 'USD'), '0 USD');
  assert.equal(formatCurrency(NaN), '0 UZS');
});
