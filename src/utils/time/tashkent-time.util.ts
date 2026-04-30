const TASHKENT_TIME_ZONE = 'Asia/Tashkent';

const getFormatterParts = (date: Date) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TASHKENT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  return formatter.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});
};

export const getTashkentTimeZone = (): string => TASHKENT_TIME_ZONE;

export const getTashkentHour = (date: Date = new Date()): number => {
  const parts = getFormatterParts(date);
  return Number(parts.hour || 0);
};

export const isHappyHourInTashkent = (date: Date = new Date()): boolean => {
  const hour = getTashkentHour(date);
  return hour >= 10 && hour < 14;
};

export const getTashkentDateKey = (date: Date = new Date()): string => {
  const parts = getFormatterParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export const getTashkentWeekDay = (date: Date = new Date()): number => {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: TASHKENT_TIME_ZONE,
    weekday: 'short',
  }).format(date);

  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
};

export const getTashkentTimeKey = (date: Date = new Date()): string => {
  const parts = getFormatterParts(date);
  return `${parts.hour}:${parts.minute}`;
};

export const formatDateForLocale = (date: Date | string, locale: string): string => {
  const target = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(target.getTime())) {
    return String(date);
  }

  return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'uz-UZ', {
    timeZone: TASHKENT_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(target);
};

export const formatDateTimeForLocale = (date: Date | string | null | undefined, locale: string): string => {
  if (!date) {
    return '-';
  }

  const target = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(target.getTime())) {
    return String(date);
  }

  return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'uz-UZ', {
    timeZone: TASHKENT_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(target);
};
