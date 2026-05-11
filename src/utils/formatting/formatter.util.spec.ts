import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { formatDate, formatCurrency } from './formatter.util';

describe('formatter.util', () => {
  describe('formatDate', () => {
    test('returns empty string for empty input', () => {
      assert.equal(formatDate(''), '');
    });

    test('returns original string for invalid date strings', () => {
      assert.equal(formatDate('not-a-date'), 'not-a-date');
      assert.equal(formatDate('invalid'), 'invalid');
    });

    test('formats valid YYYY-MM-DD date correctly taking timezone into account', () => {
      // Create a specific Date object in the local timezone and compare against its formatting
      // Since formatDate uses new Date() and local getters (.getDate(), .getMonth(), .getFullYear())
      // we must expect the formatted local day/month/year for that date string.
      const d1 = new Date('2023-12-25');
      const expectedDay1 = String(d1.getDate()).padStart(2, '0');
      const expectedMonth1 = String(d1.getMonth() + 1).padStart(2, '0');
      const expectedYear1 = d1.getFullYear();
      assert.equal(formatDate('2023-12-25'), `${expectedDay1}.${expectedMonth1}.${expectedYear1}`);

      const d2 = new Date('2024-01-05');
      const expectedDay2 = String(d2.getDate()).padStart(2, '0');
      const expectedMonth2 = String(d2.getMonth() + 1).padStart(2, '0');
      const expectedYear2 = d2.getFullYear();
      assert.equal(formatDate('2024-01-05'), `${expectedDay2}.${expectedMonth2}.${expectedYear2}`);
    });

    test('formats valid date with time correctly taking timezone into account', () => {
      const d = new Date('2023-10-15T14:30:00Z');
      const expectedDay = String(d.getDate()).padStart(2, '0');
      const expectedMonth = String(d.getMonth() + 1).padStart(2, '0');
      const expectedYear = d.getFullYear();
      assert.equal(formatDate('2023-10-15T14:30:00Z'), `${expectedDay}.${expectedMonth}.${expectedYear}`);
    });
  });

  describe('formatCurrency', () => {
    test('formats valid number amount with default currency', () => {
      const formatted = formatCurrency(1000);
      assert.equal(formatted.replace(/\s/g, ' '), '1 000 UZS');
    });

    test('formats valid string amount with default currency', () => {
      const formatted = formatCurrency('5000000');
      assert.equal(formatted.replace(/\s/g, ' '), '5 000 000 UZS');
    });

    test('formats valid string amount with decimal points', () => {
      const formatted = formatCurrency('1500.50');
      assert.equal(formatted.replace(/\s/g, ' '), '1 500,5 UZS');
    });

    test('formats amount with specific currency', () => {
      const formatted = formatCurrency(150, 'USD');
      assert.equal(formatted.replace(/\s/g, ' '), '150 USD');
    });

    test('returns 0 for invalid string amount', () => {
      assert.equal(formatCurrency('abc', 'UZS'), '0 UZS');
      assert.equal(formatCurrency('invalid', 'USD'), '0 USD');
    });
  });
});
