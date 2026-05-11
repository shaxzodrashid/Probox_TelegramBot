import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getTashkentTimeZone,
  getTashkentHour,
  isHappyHourInTashkent,
  getTashkentDateKey,
  getTashkentWeekDay,
  getTashkentTimeKey,
  formatDateForLocale,
  formatDateTimeForLocale,
} from './tashkent-time.util';

test('getTashkentTimeZone returns Asia/Tashkent', () => {
  assert.strictEqual(getTashkentTimeZone(), 'Asia/Tashkent');
});

test('getTashkentHour returns correct hour', () => {
  // 10:00 UTC is 15:00 in Tashkent (UTC+5)
  assert.strictEqual(getTashkentHour(new Date('2023-01-01T10:00:00Z')), 15);
  // 00:00 UTC is 05:00 in Tashkent
  assert.strictEqual(getTashkentHour(new Date('2023-01-01T00:00:00Z')), 5);
  // 20:00 UTC is 01:00 in Tashkent the next day
  assert.strictEqual(getTashkentHour(new Date('2023-01-01T20:00:00Z')), 1);
});

test('isHappyHourInTashkent correctly identifies happy hours (10:00 - 13:59)', () => {
  // 04:59 UTC = 09:59 Tashkent (Not happy hour)
  assert.strictEqual(isHappyHourInTashkent(new Date('2023-01-01T04:59:00Z')), false);
  // 05:00 UTC = 10:00 Tashkent (Happy hour)
  assert.strictEqual(isHappyHourInTashkent(new Date('2023-01-01T05:00:00Z')), true);
  // 07:30 UTC = 12:30 Tashkent (Happy hour)
  assert.strictEqual(isHappyHourInTashkent(new Date('2023-01-01T07:30:00Z')), true);
  // 08:59 UTC = 13:59 Tashkent (Happy hour)
  assert.strictEqual(isHappyHourInTashkent(new Date('2023-01-01T08:59:00Z')), true);
  // 09:00 UTC = 14:00 Tashkent (Not happy hour)
  assert.strictEqual(isHappyHourInTashkent(new Date('2023-01-01T09:00:00Z')), false);
});

test('getTashkentDateKey returns formatted date string YYYY-MM-DD', () => {
  // 20:00 UTC on Jan 1 is Jan 2 in Tashkent
  assert.strictEqual(getTashkentDateKey(new Date('2023-01-01T20:00:00Z')), '2023-01-02');
  assert.strictEqual(getTashkentDateKey(new Date('2023-05-15T12:00:00Z')), '2023-05-15');
});

test('getTashkentWeekDay returns correct weekday index', () => {
  // 2023-01-01 is a Sunday (index 0)
  assert.strictEqual(getTashkentWeekDay(new Date('2023-01-01T12:00:00Z')), 0);
  // 2023-01-02 is a Monday (index 1)
  assert.strictEqual(getTashkentWeekDay(new Date('2023-01-02T12:00:00Z')), 1);
  // 2023-01-07 is a Saturday (index 6)
  assert.strictEqual(getTashkentWeekDay(new Date('2023-01-07T12:00:00Z')), 6);
  // 20:00 UTC on Sunday is Monday in Tashkent
  assert.strictEqual(getTashkentWeekDay(new Date('2023-01-01T20:00:00Z')), 1);
});

test('getTashkentTimeKey returns formatted time string HH:MM', () => {
  assert.strictEqual(getTashkentTimeKey(new Date('2023-01-01T10:05:00Z')), '15:05');
  assert.strictEqual(getTashkentTimeKey(new Date('2023-01-01T20:30:00Z')), '01:30');
});

test('formatDateForLocale handles Date objects', () => {
  const date = new Date('2023-01-05T05:00:00Z'); // 10:00 in Tashkent
  assert.strictEqual(formatDateForLocale(date, 'ru'), '05.01.2023');
  assert.strictEqual(formatDateForLocale(date, 'uz'), '05/01/2023');
});

test('formatDateForLocale handles string dates', () => {
  assert.strictEqual(formatDateForLocale('2023-01-05T05:00:00Z', 'ru'), '05.01.2023');
  assert.strictEqual(formatDateForLocale('2023-01-05T05:00:00Z', 'uz'), '05/01/2023');
});

test('formatDateForLocale handles invalid dates', () => {
  assert.strictEqual(formatDateForLocale('invalid-date', 'ru'), 'invalid-date');
});

test('formatDateTimeForLocale handles Date objects', () => {
  const date = new Date('2023-01-05T05:05:00Z'); // 10:05 in Tashkent
  // Node 18/20 format slightly differs in separators, sometimes uses commas
  const ruFormatted = formatDateTimeForLocale(date, 'ru');
  const uzFormatted = formatDateTimeForLocale(date, 'uz');
  assert.ok(ruFormatted.includes('05.01.2023') && ruFormatted.includes('10:05'));
  assert.ok(uzFormatted.includes('05/01/2023') && uzFormatted.includes('10:05'));
});

test('formatDateTimeForLocale handles falsy values', () => {
  assert.strictEqual(formatDateTimeForLocale(null, 'ru'), '-');
  assert.strictEqual(formatDateTimeForLocale(undefined, 'uz'), '-');
  assert.strictEqual(formatDateTimeForLocale('', 'ru'), '-');
});

test('formatDateTimeForLocale handles invalid dates', () => {
  assert.strictEqual(formatDateTimeForLocale('invalid-date', 'ru'), 'invalid-date');
});
