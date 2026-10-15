import type {
  ProboxLoginOpenResult,
  ProboxLoginDeclineReason,
  LoginSource,
} from '../../services/probox-login.service';

export const TELEGRAM_AUTH_PREFIX = 'auth_';
export const isTelegramLoginId = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);

export type TelegramAuthState = {
  login_id: string;
  telegram_id: number;
  expires_at: number;
} & (
  | {
      status: 'pending';
      started_at: number;
      details: Pick<ProboxLoginOpenResult, 'phone_masked' | 'client' | 'location' | 'source'>;
      decline_reason?: ProboxLoginDeclineReason;
    }
  | { status: 'verified'; verified_at: number; source?: LoginSource }
);

/** The store API owns login IDs and phone matching; phone-only links are obsolete. */
export function parseAuthStart(text?: string): { login_id: string | null } | null {
  const match = text?.trim().match(/^\/start(?:@\w+)?\s+(auth_[\s\S]*)$/i);
  if (!match) return null;
  const loginId = match[1].slice(TELEGRAM_AUTH_PREFIX.length);
  return { login_id: isTelegramLoginId(loginId) ? loginId : null };
}
