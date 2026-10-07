import { Keyboard, MiddlewareFn } from 'grammy';
import type { BotContext } from '../types/context';
import {
  isTelegramLoginId,
  parseAuthStart,
  TelegramAuthState,
} from '../utils/telegram/telegram-auth.util';
import { escapeHtml } from '../utils/telegram/telegram-rich-text.util';
import { ProboxLoginApi, ProboxLoginError } from '../services/probox-login.service';

const START_COMMAND = /^\/start(?:@\w+)?(?:\s|$)/i;
const CANCEL_COMMAND = /^\/cancel(?:@\w+)?$/i;
type PendingAuth = Extract<TelegramAuthState, { status: 'pending' }>;

/** Install before createConversation so another flow cannot consume auth contacts. */
export function createTelegramAuthMiddleware(
  clearInterruptedFlow: (telegramId: number) => Promise<unknown>,
  login: ProboxLoginApi,
): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    const authStart = parseAuthStart(ctx.message?.text);
    if (ctx.chat?.type !== 'private' || !ctx.from) {
      if (authStart) {
        await ctx.reply(ctx.t('telegram_auth_private_only'));
        return;
      }
      return next();
    }

    const telegramId = ctx.from.id;
    if (authStart) {
      ctx.session.telegramAuth = undefined;
      ctx.session.deepLinkSlug = undefined;
      ctx.session.pendingAction = undefined;
      await ctx.conversation.exitAll();
      await clearInterruptedFlow(telegramId);
      if (!authStart.login_id) {
        await replyFinal(ctx, 'telegram_auth_invalid_link');
        return;
      }
      let pending: PendingAuth;
      try {
        const info = await login.open(authStart.login_id, telegramId);
        const expiresAt = Date.parse(info.expires_at);
        if (expiresAt <= Date.now()) {
          await replyFinal(ctx, 'telegram_auth_expired');
          return;
        }
        pending = {
          status: 'pending',
          login_id: info.login_id,
          telegram_id: telegramId,
          // Telegram message dates have second precision.
          started_at: Math.floor(Date.now() / 1000) * 1000,
          expires_at: expiresAt,
          details: {
            phone_masked: info.phone_masked,
            client: info.client,
            location: info.location,
          },
        };
      } catch (error) {
        await replyFinal(ctx, errorTextKey(error, 'telegram_auth_open_retry'));
        return;
      }
      ctx.session.telegramAuth = pending;
      await ctx.reply(contactRequest(ctx, pending), {
        parse_mode: 'HTML',
        reply_markup: contactKeyboard(ctx),
      });
      return;
    }

    const auth = ctx.session.telegramAuth;
    if (!auth) return next();
    if (START_COMMAND.test(ctx.message?.text || '') || ctx.callbackQuery?.data === 'start') {
      ctx.session.telegramAuth = undefined;
      if (auth.status === 'pending') await replyFinal(ctx, 'telegram_auth_cancelled');
      return next();
    }
    // Discard phone-only sessions left by a previous bot version.
    if (!isTelegramLoginId(auth.login_id)) {
      ctx.session.telegramAuth = undefined;
      await replyFinal(ctx, 'telegram_auth_invalid_link');
      return;
    }
    if (auth.status === 'verified') {
      if (Date.now() >= auth.expires_at) ctx.session.telegramAuth = undefined;
      return next();
    }

    if (ctx.callbackQuery) await ctx.answerCallbackQuery();
    if (Date.now() >= auth.expires_at || auth.telegram_id !== telegramId) {
      ctx.session.telegramAuth = undefined;
      await replyFinal(ctx, 'telegram_auth_expired');
      return;
    }

    const text = ctx.message?.text || '';
    const declineReason =
      auth.decline_reason ??
      (CANCEL_COMMAND.test(text)
        ? 'cancelled'
        : text === ctx.t('telegram_auth_not_me')
          ? 'not_me'
          : undefined);
    if (declineReason) {
      // Preserve refusal after an uncertain delivery; a later contact must not approve it.
      auth.decline_reason = declineReason;
      try {
        await login.decline(auth.login_id, telegramId, declineReason);
      } catch (error) {
        await handleActionError(ctx, error, 'telegram_auth_decline_retry');
        return;
      }
      ctx.session.telegramAuth = undefined;
      await replyFinal(
        ctx,
        declineReason === 'not_me' ? 'telegram_auth_declined' : 'telegram_auth_cancelled',
      );
      return;
    }

    const contact = ctx.message?.contact;
    if (
      !contact ||
      ctx.message?.forward_origin ||
      contact.user_id !== telegramId ||
      (ctx.message?.date ?? 0) * 1000 < auth.started_at
    ) {
      await ctx.reply(
        contact ? ctx.t('telegram_auth_own_contact_only') : contactRequest(ctx, auth),
        {
          parse_mode: 'HTML',
          reply_markup: contactKeyboard(ctx),
        },
      );
      return;
    }

    try {
      await login.confirm({
        login_id: auth.login_id,
        telegram_user_id: telegramId,
        phone_number: contact.phone_number,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name,
        username: ctx.from.username,
        language_code: ctx.from.language_code,
      });
    } catch (error) {
      await handleActionError(ctx, error, 'telegram_auth_retry');
      return;
    }
    ctx.session.telegramAuth = {
      status: 'verified',
      login_id: auth.login_id,
      telegram_id: telegramId,
      verified_at: Date.now(),
      expires_at: auth.expires_at,
    };
    await replyFinal(ctx, 'telegram_auth_verified');
  };
}

function contactKeyboard(ctx: BotContext): Keyboard {
  return new Keyboard()
    .requestContact(ctx.t('telegram_auth_share_phone'))
    .row()
    .text(ctx.t('telegram_auth_not_me'))
    .resized()
    .oneTime();
}

function contactRequest(ctx: BotContext, auth: PendingAuth): string {
  const { phone_masked, client, location } = auth.details;
  const device = [client.browser, client.os, client.device_type].filter(Boolean).join(' · ');
  const place = [location.city, location.country].filter(Boolean).join(', ');
  const lines = [
    ctx.t('telegram_auth_heading'),
    ctx.t('telegram_auth_phone', { phone: escapeHtml(phone_masked) }),
  ];
  if (device) lines.push(ctx.t('telegram_auth_device', { device: escapeHtml(device) }));
  if (place) lines.push(ctx.t('telegram_auth_location', { place: escapeHtml(place) }));
  lines.push('', ctx.t('telegram_auth_request_contact'));
  return lines.join('\n');
}

function errorTextKey(error: unknown, retryKey: string): string {
  if (!(error instanceof ProboxLoginError)) return retryKey;
  switch (error.location) {
    case 'TG_LOGIN_NOT_FOUND':
      return 'telegram_auth_invalid_link';
    case 'TG_LOGIN_EXPIRED':
      return 'telegram_auth_expired';
    case 'TG_LOGIN_OTHER_ACCOUNT':
      return 'telegram_auth_other_account';
    case 'TG_LOGIN_PHONE_MISMATCH':
      return 'telegram_auth_phone_mismatch';
    case 'TG_LOGIN_ALREADY_CONFIRMED':
      return 'telegram_auth_already_confirmed';
    case 'TG_LOGIN_DECLINED':
      return 'telegram_auth_declined';
    default:
      return error.retryable ? retryKey : 'telegram_auth_error';
  }
}

async function handleActionError(ctx: BotContext, error: unknown, retryKey: string): Promise<void> {
  if (error instanceof ProboxLoginError && !error.retryable) {
    ctx.session.telegramAuth = undefined;
    await replyFinal(ctx, errorTextKey(error, retryKey));
  } else {
    await ctx.reply(ctx.t(errorTextKey(error, retryKey)), { reply_markup: contactKeyboard(ctx) });
  }
}

async function replyFinal(ctx: BotContext, key: string): Promise<void> {
  await ctx.reply(ctx.t(key), { reply_markup: { remove_keyboard: true } });
}
