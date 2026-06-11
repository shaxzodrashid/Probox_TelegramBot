import assert from 'node:assert/strict';
import test from 'node:test';
import { ScheduledBroadcast } from '../types/support.types';
import {
  isScheduledBroadcastDue,
  isValidScheduleDate,
  parseMonthDay,
} from './scheduled-broadcast.util';

const baseSchedule = (overrides: Partial<ScheduledBroadcast>): ScheduledBroadcast => ({
  id: 1,
  admin_telegram_id: 10,
  message_text: 'Test',
  target_type: 'all',
  schedule_type: 'weekly',
  week_day: 1,
  week_days: [1],
  scheduled_time: '09:30',
  is_active: true,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

const mondayAt0930Tashkent = new Date('2026-06-15T04:30:00.000Z');

test('weekly and twice-weekly schedules match configured weekdays', () => {
  assert.equal(isScheduledBroadcastDue(baseSchedule({}), mondayAt0930Tashkent), true);
  assert.equal(
    isScheduledBroadcastDue(
      baseSchedule({ schedule_type: 'twice_weekly', week_days: [1, 4] }),
      new Date('2026-06-18T04:30:00.000Z'),
    ),
    true,
  );
});

test('daily and weekday schedules use Tashkent calendar days', () => {
  assert.equal(
    isScheduledBroadcastDue(baseSchedule({ schedule_type: 'daily', week_days: null }), mondayAt0930Tashkent),
    true,
  );
  assert.equal(
    isScheduledBroadcastDue(
      baseSchedule({ schedule_type: 'weekdays', week_days: null }),
      new Date('2026-06-20T04:30:00.000Z'),
    ),
    false,
  );
});

test('monthly and twice-monthly schedules match calendar days', () => {
  assert.equal(
    isScheduledBroadcastDue(
      baseSchedule({ schedule_type: 'monthly', week_days: null, month_days: [15] }),
      mondayAt0930Tashkent,
    ),
    true,
  );
  assert.equal(
    isScheduledBroadcastDue(
      baseSchedule({ schedule_type: 'twice_monthly', week_days: null, month_days: [1, 15] }),
      mondayAt0930Tashkent,
    ),
    true,
  );
});

test('one-time and biweekly schedules honor their dates', () => {
  assert.equal(
    isScheduledBroadcastDue(
      baseSchedule({
        schedule_type: 'once',
        week_days: null,
        scheduled_date: '2026-06-15',
      }),
      mondayAt0930Tashkent,
    ),
    true,
  );
  assert.equal(
    isScheduledBroadcastDue(
      baseSchedule({
        schedule_type: 'biweekly',
        week_days: [1],
        start_date: '2026-06-01',
      }),
      mondayAt0930Tashkent,
    ),
    true,
  );
});

test('inactive, already-run, and wrong-time schedules are not due', () => {
  assert.equal(isScheduledBroadcastDue(baseSchedule({ is_active: false }), mondayAt0930Tashkent), false);
  assert.equal(
    isScheduledBroadcastDue(baseSchedule({ last_run_date: '2026-06-15' }), mondayAt0930Tashkent),
    false,
  );
  assert.equal(
    isScheduledBroadcastDue(baseSchedule({ scheduled_time: '09:31' }), mondayAt0930Tashkent),
    false,
  );
});

test('schedule input validators reject impossible values', () => {
  assert.equal(isValidScheduleDate('2026-02-29'), false);
  assert.equal(isValidScheduleDate('2028-02-29'), true);
  assert.equal(parseMonthDay('31'), 31);
  assert.equal(parseMonthDay('0'), null);
});
