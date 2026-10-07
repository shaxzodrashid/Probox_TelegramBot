export const TELEGRAM_AUTH_PREFIX = 'auth_';
export const TELEGRAM_AUTH_TTL_MS = 10 * 60 * 1000;

export interface TelegramAuthIdentity {
  telegram_id: number;
  phone_number: string;
}

export type TelegramAuthState = TelegramAuthIdentity &
  (
    | { status: 'pending'; started_at: number; expires_at: number }
    | { status: 'verified'; verified_at: number; expires_at: number }
  );

/** Compare full international numbers; never infer a country or compare suffixes. */
export function normalizeAuthPhone(phone: string): string | null {
  const trimmed = phone.trim();
  if (!/^\+?[\d\s()-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/[\s()-]/g, '').replace(/^\+/, '');
  return /^[1-9]\d{6,14}$/.test(digits) ? `+${digits}` : null;
}

export function parseAuthStart(text?: string): { phone_number: string | null } | null {
  const match = text?.trim().match(/^\/start(?:@\w+)?\s+(auth_.*)$/i);
  if (!match) return null;
  const digits = match[1].slice(TELEGRAM_AUTH_PREFIX.length);
  return { phone_number: /^[1-9]\d{6,14}$/.test(digits) ? `+${digits}` : null };
}

export function buildTelegramAuthDeepLink(botUsername: string, phone: string): string {
  const username = botUsername.replace(/^@/, '');
  const normalizedPhone = normalizeAuthPhone(phone);
  if (!/^[a-zA-Z0-9_]+$/.test(username) || !normalizedPhone) {
    throw new Error('Invalid bot username or international phone number');
  }
  return `https://t.me/${username}?start=${TELEGRAM_AUTH_PREFIX}${normalizedPhone.slice(1)}`;
}
