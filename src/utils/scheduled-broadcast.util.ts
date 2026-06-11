import {
  ScheduledBroadcast,
  ScheduledBroadcastScheduleType,
  ScheduledBroadcastWeekDay,
  UpdateScheduledBroadcastScheduleParams,
} from '../types/support.types';
import {
  getTashkentDateKey,
  getTashkentTimeKey,
  getTashkentWeekDay,
} from './time/tashkent-time.util';
import { i18n } from '../i18n';

export const SCHEDULE_TYPES: ScheduledBroadcastScheduleType[] = [
  'once',
  'daily',
  'weekdays',
  'weekly',
  'twice_weekly',
  'biweekly',
  'monthly',
  'twice_monthly',
  'monthly_weekday',
];

export const getOccurrenceLabel = (locale: string, occurrence: number): string => {
  if (occurrence === -1) {
    return i18n.t(locale, 'occurrence_last');
  }
  return i18n.t(locale, `occurrence_${occurrence}`);
};

export const getOccurrencesLabel = (locale: string, occurrences: number[]): string => {
  const sorted = [...occurrences].sort((a, b) => {
    const valA = a === -1 ? 99 : a;
    const valB = b === -1 ? 99 : b;
    return valA - valB;
  });
  const labels = sorted.map((occ) => getOccurrenceLabel(locale, occ));
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  const lastLabel = labels.pop();
  const connector = locale === 'uz' ? ' va ' : ' и ';
  return labels.join(', ') + connector + lastLabel;
};

const parseDateKey = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
};

export const isValidScheduleDate = (value: string): boolean => Boolean(parseDateKey(value.trim()));

export const parseMonthDay = (value: string): number | null => {
  const day = Number(value.trim());
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
};

export const normalizeNumberArray = (value: unknown): number[] => {
  if (Array.isArray(value)) {
    return value.map(Number).filter(Number.isFinite);
  }

  if (typeof value === 'string') {
    try {
      return normalizeNumberArray(JSON.parse(value));
    } catch {
      return [];
    }
  }

  return [];
};

const getDaysBetween = (from: string, to: string): number | null => {
  const fromDate = parseDateKey(from);
  const toDate = parseDateKey(to);
  if (!fromDate || !toDate) return null;
  return Math.floor((toDate.getTime() - fromDate.getTime()) / 86_400_000);
};

export const isScheduledBroadcastDue = (
  scheduledBroadcast: ScheduledBroadcast,
  now: Date = new Date(),
): boolean => {
  if (!scheduledBroadcast.is_active || scheduledBroadcast.scheduled_time !== getTashkentTimeKey(now)) {
    return false;
  }

  const today = getTashkentDateKey(now);
  if (scheduledBroadcast.last_run_date === today) {
    return false;
  }

  const weekDay = getTashkentWeekDay(now);
  const monthDay = Number(today.slice(8, 10));
  const weekDays = normalizeNumberArray(
    scheduledBroadcast.week_days ?? (
      scheduledBroadcast.week_day === null || scheduledBroadcast.week_day === undefined
        ? []
        : [scheduledBroadcast.week_day]
    ),
  );
  const monthDays = normalizeNumberArray(scheduledBroadcast.month_days);

  switch (scheduledBroadcast.schedule_type || 'weekly') {
    case 'once':
      return scheduledBroadcast.scheduled_date === today;
    case 'daily':
      return true;
    case 'weekdays':
      return weekDay >= 1 && weekDay <= 5;
    case 'weekly':
    case 'twice_weekly':
      return weekDays.includes(weekDay);
    case 'biweekly': {
      if (!scheduledBroadcast.start_date || !weekDays.includes(weekDay)) return false;
      const elapsedDays = getDaysBetween(scheduledBroadcast.start_date, today);
      return elapsedDays !== null && elapsedDays >= 0 && elapsedDays % 14 === 0;
    }
    case 'monthly':
    case 'twice_monthly':
      return monthDays.includes(monthDay);
    case 'monthly_weekday': {
      if (!weekDays.includes(weekDay)) return false;
      const [year, month] = today.split('-').map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();
      const occurrence = Math.ceil(monthDay / 7);
      const isLast = monthDay + 7 > daysInMonth;
      return monthDays.includes(occurrence) || (isLast && monthDays.includes(-1));
    }
    default:
      return false;
  }
};

export const getScheduleStorageValues = (
  schedule: UpdateScheduledBroadcastScheduleParams,
): {
  schedule_type: ScheduledBroadcastScheduleType;
  week_day: ScheduledBroadcastWeekDay | null;
  week_days: string | null;
  month_days: string | null;
  scheduled_date: string | null;
  start_date: string | null;
  scheduled_time: string;
} => {
  const weekDays = schedule.weekDays?.length ? [...new Set(schedule.weekDays)].sort() : null;
  const monthDays = schedule.monthDays?.length ? [...new Set(schedule.monthDays)].sort((a, b) => a - b) : null;

  return {
    schedule_type: schedule.scheduleType,
    week_day: weekDays?.[0] ?? null,
    week_days: weekDays ? JSON.stringify(weekDays) : null,
    month_days: monthDays ? JSON.stringify(monthDays) : null,
    scheduled_date: schedule.scheduledDate || null,
    start_date: schedule.startDate || null,
    scheduled_time: schedule.scheduledTime,
  };
};
