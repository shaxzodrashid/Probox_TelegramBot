import { Keyboard, MiddlewareFn } from 'grammy';
import type { BotContext } from '../types/context';
import {
  normalizeAuthPhone,
  parseAuthStart,
  TELEGRAM_AUTH_TTL_MS,
} from '../utils/telegram/telegram-auth.util';

const START_COMMAND = /^\/start(?:@\w+)?(?:\s|$)/i;
const CANCEL_COMMAND = /^\/cancel(?:@\w+)?$/i;

/** Install before createConversation so another flow cannot consume auth contacts. */
export function createTelegramAuthMiddleware(
  clearInterruptedFlow: (telegramId: number) => Promise<unknown>,
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
    const now = Date.now();
    if (authStart) {
      // Supersede earlier attempts, including a previous successful verification.
      ctx.session.telegramAuth = undefined;
      ctx.session.deepLinkSlug = undefined;
      ctx.session.pendingAction = undefined;
      await ctx.conversation.exitAll();
      await clearInterruptedFlow(telegramId);
      if (!authStart.phone_number) {
        await ctx.reply(ctx.t('telegram_auth_invalid_link'), {
          reply_markup: { remove_keyboard: true },
        });
        return;
      }
      ctx.session.telegramAuth = {
        status: 'pending',
        telegram_id: telegramId,
        phone_number: authStart.phone_number,
        started_at: now,
        expires_at: now + TELEGRAM_AUTH_TTL_MS,
      };
      await ctx.reply(ctx.t('telegram_auth_request_contact'), {
        reply_markup: contactKeyboard(ctx),
      });
      return;
    }

    const auth = ctx.session.telegramAuth;
    if (!auth) return next();

    if (START_COMMAND.test(ctx.message?.text || '') || ctx.callbackQuery?.data === 'start') {
      ctx.session.telegramAuth = undefined;
      if (auth.status === 'pending') {
        await ctx.reply(ctx.t('telegram_auth_cancelled'), {
          reply_markup: { remove_keyboard: true },
        });
      }
      return next();
    }

    if (auth.status === 'verified') {
      if (now >= auth.expires_at) ctx.session.telegramAuth = undefined;
      // Completed verification must not intercept later registration/settings contacts.
      return next();
    }

    if (CANCEL_COMMAND.test(ctx.message?.text || '')) {
      ctx.session.telegramAuth = undefined;
      await ctx.reply(ctx.t('telegram_auth_cancelled'), {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    if (ctx.callbackQuery) await ctx.answerCallbackQuery();
    if (now >= auth.expires_at || auth.telegram_id !== telegramId) {
      ctx.session.telegramAuth = undefined;
      await ctx.reply(ctx.t('telegram_auth_expired'), {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    const contact = ctx.message?.contact;
    let errorKey: string | undefined;
    if (!contact) {
      errorKey = 'telegram_auth_request_contact';
    } else if (
      ctx.message?.forward_origin ||
      contact.user_id !== telegramId ||
      (ctx.message?.date ?? 0) < Math.floor(auth.started_at / 1000)
    ) {
      errorKey = 'telegram_auth_own_contact_only';
    } else if (normalizeAuthPhone(contact.phone_number) !== auth.phone_number) {
      errorKey = 'telegram_auth_phone_mismatch';
    }
    if (errorKey) {
      await ctx.reply(ctx.t(errorKey), { reply_markup: contactKeyboard(ctx) });
      return;
    }

    // Verification only: no external request, SAP sync, or bot-account login.
    ctx.session.telegramAuth = {
      status: 'verified',
      telegram_id: telegramId,
      phone_number: auth.phone_number,
      verified_at: now,
      expires_at: now + TELEGRAM_AUTH_TTL_MS,
    };
    await ctx.reply(ctx.t('telegram_auth_verified'), {
      reply_markup: { remove_keyboard: true },
    });
  };
}

function contactKeyboard(ctx: BotContext): Keyboard {
  return new Keyboard().requestContact(ctx.t('share_phone_button')).resized().oneTime();
}
