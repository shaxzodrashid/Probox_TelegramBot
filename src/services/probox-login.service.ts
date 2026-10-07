import { createHmac } from 'node:crypto';

export interface ProboxLoginOpenResult {
  login_id: string;
  status: 'opened';
  phone_masked: string;
  language: 'uz' | 'ru' | 'en';
  client: { device_type: string | null; os: string | null; browser: string | null };
  location: { country_code: string | null; country: string | null; city: string | null };
  requested_at: string;
  expires_at: string;
  expires_in: number;
}

export interface ProboxLoginActionResult {
  login_id: string;
  status: 'confirmed' | 'completed' | 'declined';
}

export interface ProboxLoginConfirmInput {
  login_id: string;
  telegram_user_id: number;
  phone_number: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export type ProboxLoginDeclineReason = 'not_me' | 'cancelled';

export interface ProboxLoginApi {
  open(loginId: string, telegramUserId: number): Promise<ProboxLoginOpenResult>;
  confirm(input: ProboxLoginConfirmInput): Promise<ProboxLoginActionResult>;
  decline(
    loginId: string,
    telegramUserId: number,
    reason: ProboxLoginDeclineReason,
  ): Promise<ProboxLoginActionResult>;
}

export class ProboxLoginError extends Error {
  constructor(
    readonly status: number,
    readonly location: string,
  ) {
    // Do not retain remote messages, signed headers, requests, or transport errors.
    super('Store login request failed');
    this.name = 'ProboxLoginError';
  }
  get retryable(): boolean {
    return this.status === 0 || this.status >= 500;
  }
}

interface ClientOptions {
  baseUrl: string;
  secret: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const nullableStrings = (value: unknown, keys: string[]): boolean =>
  isRecord(value) && keys.every((key) => value[key] === null || typeof value[key] === 'string');

/** Sign the exact JSON bytes sent, with a fresh timestamp per retry. */
export class ProboxLoginClient implements ProboxLoginApi {
  constructor(private readonly options: ClientOptions) {}

  async open(loginId: string, telegramUserId: number): Promise<ProboxLoginOpenResult> {
    const result = await this.call('open', { login_id: loginId, telegram_user_id: telegramUserId });
    if (
      result.login_id !== loginId ||
      result.status !== 'opened' ||
      typeof result.phone_masked !== 'string' ||
      !['uz', 'ru', 'en'].includes(String(result.language)) ||
      !nullableStrings(result.client, ['device_type', 'os', 'browser']) ||
      !nullableStrings(result.location, ['country_code', 'country', 'city']) ||
      typeof result.expires_at !== 'string' ||
      !Number.isFinite(Date.parse(result.expires_at)) ||
      typeof result.requested_at !== 'string' ||
      !Number.isFinite(Date.parse(result.requested_at)) ||
      typeof result.expires_in !== 'number' ||
      !Number.isFinite(result.expires_in)
    )
      throw new ProboxLoginError(502, 'TG_BOT_INVALID_RESPONSE');
    return result as unknown as ProboxLoginOpenResult;
  }

  async confirm(input: ProboxLoginConfirmInput): Promise<ProboxLoginActionResult> {
    const result = await this.call('confirm', {
      login_id: input.login_id,
      telegram_user_id: input.telegram_user_id,
      phone_number: input.phone_number,
      first_name: input.first_name,
      last_name: input.last_name,
      username: input.username,
      language_code: input.language_code,
    });
    return this.actionResult(result, input.login_id, ['confirmed', 'completed']);
  }

  async decline(
    loginId: string,
    telegramUserId: number,
    reason: ProboxLoginDeclineReason,
  ): Promise<ProboxLoginActionResult> {
    const result = await this.call('decline', {
      login_id: loginId,
      telegram_user_id: telegramUserId,
      reason,
    });
    return this.actionResult(result, loginId, ['declined']);
  }

  private actionResult(
    result: Record<string, unknown>,
    loginId: string,
    statuses: string[],
  ): ProboxLoginActionResult {
    if (result.login_id !== loginId || !statuses.includes(String(result.status))) {
      throw new ProboxLoginError(502, 'TG_BOT_INVALID_RESPONSE');
    }
    return result as unknown as ProboxLoginActionResult;
  }

  private async call(
    path: 'open' | 'confirm' | 'decline',
    body: object,
  ): Promise<Record<string, unknown>> {
    let base: URL;
    try {
      base = new URL(this.options.baseUrl);
      if (
        base.protocol !== 'https:' ||
        base.username ||
        base.password ||
        base.search ||
        base.hash ||
        base.pathname !== '/'
      )
        throw new Error();
      if (!this.options.secret.trim()) throw new Error();
    } catch {
      throw new ProboxLoginError(0, 'TG_BOT_NOT_CONFIGURED');
    }
    const raw = JSON.stringify(body);
    const request = this.options.fetch ?? fetch;
    const sleep = this.options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    let lastError = new ProboxLoginError(0, 'TG_BOT_NETWORK_ERROR');
    for (let attempt = 0; attempt < 3; attempt++) {
      const ts = Math.floor((this.options.now?.() ?? Date.now()) / 1000);
      const signature = createHmac('sha256', this.options.secret)
        .update(`${ts}.${raw}`)
        .digest('hex');
      try {
        const response = await request(
          `${base.origin}/api/v1/webhooks/telegram-bot/login/${path}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Probox-Bot-Signature': `t=${ts},s=${signature}`,
            },
            body: raw,
            redirect: 'error',
            signal: AbortSignal.timeout(10_000),
          },
        );
        const json: unknown = await response.json().catch(() => null);
        if (response.status === 200 && isRecord(json)) return json;
        const error = new ProboxLoginError(
          response.ok ? 502 : response.status,
          isRecord(json) && typeof json.location === 'string'
            ? json.location
            : 'TG_BOT_INVALID_RESPONSE',
        );
        if (!error.retryable) throw error;
        lastError = error;
      } catch (error) {
        if (error instanceof ProboxLoginError) {
          if (!error.retryable) throw error;
          lastError = error;
        } else lastError = new ProboxLoginError(0, 'TG_BOT_NETWORK_ERROR');
      }
      if (attempt < 2) await sleep(500 * 2 ** attempt);
    }
    throw lastError;
  }
}
