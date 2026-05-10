import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isHappyHourInTashkent } from './tashkent-time.util';

// Tashkent is UTC+5.
// Happy hour is 10:00 to 13:59 (inclusive in Tashkent time).
// UTC times for these corresponding Tashkent times:
// Tashkent 09:59 -> UTC 04:59
// Tashkent 10:00 -> UTC 05:00
// Tashkent 12:00 -> UTC 07:00
// Tashkent 13:59 -> UTC 08:59
// Tashkent 14:00 -> UTC 09:00

test('isHappyHourInTashkent returns false before 10:00', () => {
  // 09:59 Tashkent time
  const date = new Date(Date.UTC(2024, 0, 1, 4, 59));
  assert.strictEqual(isHappyHourInTashkent(date), false);
});

test('isHappyHourInTashkent returns true at 10:00 (start boundary)', () => {
  // 10:00 Tashkent time
  const date = new Date(Date.UTC(2024, 0, 1, 5, 0));
  assert.strictEqual(isHappyHourInTashkent(date), true);
});

test('isHappyHourInTashkent returns true at 12:00 (inside)', () => {
  // 12:00 Tashkent time
  const date = new Date(Date.UTC(2024, 0, 1, 7, 0));
  assert.strictEqual(isHappyHourInTashkent(date), true);
});

test('isHappyHourInTashkent returns true at 13:59 (end boundary)', () => {
  // 13:59 Tashkent time
  const date = new Date(Date.UTC(2024, 0, 1, 8, 59));
  assert.strictEqual(isHappyHourInTashkent(date), true);
});

test('isHappyHourInTashkent returns false at 14:00 (after boundary)', () => {
  // 14:00 Tashkent time
  const date = new Date(Date.UTC(2024, 0, 1, 9, 0));
  assert.strictEqual(isHappyHourInTashkent(date), false);
});
