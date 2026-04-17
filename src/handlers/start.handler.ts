import { InlineKeyboard, InputFile } from 'grammy';
import { BotContext } from '../types/context';
import { getMainKeyboard, getLanguageKeyboard, getPromoApplicationKeyboard } from '../keyboards';
import { getAdminMenuKeyboard } from '../keyboards/admin.keyboards';
import { logger } from '../utils/logger';
import { UserService } from '../services/user.service';
import { getDeepLinkConfig, DeepLinkConfig } from '../config/deep-links';
import { isCallbackQueryExpiredError, isMessageToDeleteNotFoundError } from '../utils/telegram/telegram-errors';
import { escapeHtml } from '../utils/telegram/telegram-rich-text.util';

const START_COMMAND_REGEX = /^\/start(?:@\w+)?(?:\s+(.+))?$/;

const sendPromoMedia = async (ctx: BotContext, config: DeepLinkConfig) => {
  if (!config.media) return;

  try {
    if (config.media.type === 'copy_message') {
      const chatId = ctx.chat?.id;
      if (!chatId) {
        logger.warn(`[WARN] Unable to copy promo media for slug ${config.slug}: target chat id is missing`);
        return;
      }

      await ctx.api.copyMessage(chatId, config.media.fromChatId, config.media.messageId);
      return;
    }

    await ctx.replyWithVideoNote(new InputFile(config.media.path));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn(`[WARN] Unable to send promo media for slug ${config.slug}: ${errorMessage}`);
  }
};

const extractStartPayload = (text?: string) => {
  if (!text) return null;

  const match = text.trim().match(START_COMMAND_REGEX);
  const payload = match?.[1]?.trim();
  if (!payload) return null;

  try {
    return decodeURIComponent(payload).trim().toLowerCase();
  } catch {
    return payload.toLowerCase();
  }
};

const showPromoMessage = async (ctx: BotContext, config: DeepLinkConfig) => {
  const name = escapeHtml(ctx.from?.first_name || (ctx.from?.username ? `@${ctx.from.username}` : 'Foydalanuvchi'));
  const locale = await ctx.i18n.getLocale();

  let keyboard;
  if (config.ctaAction === 'link' && config.url) {
    keyboard = new InlineKeyboard().url(ctx.t('promo_video_cta'), config.url);
  } else if (config.ctaAction === 'application') {
    keyboard = getPromoApplicationKeyboard(locale);
  } else if (config.ctaAction === 'none') {
    keyboard = undefined;
  } else {
    keyboard = getPromoApplicationKeyboard(locale);
  }

  ctx.session.deepLinkSlug = undefined;

  if (ctx.callbackQuery) {
    await ctx.deleteMessage().catch((err) => {
      if (!isMessageToDeleteNotFoundError(err)) throw err;
    });
    await ctx.answerCallbackQuery().catch((err) => {
      if (!isCallbackQueryExpiredError(err)) throw err;
    });
  }

  if (config.secondaryMessageKey) {
    const text1 = ctx.t(config.messageKey, { name });
    const text2 = ctx.t(config.secondaryMessageKey, { name });

    if (config.mediaPlacement === 'before_text') {
      await sendPromoMedia(ctx, config);
    }

    await ctx.reply(text1, { parse_mode: 'HTML' });

    if (config.mediaPlacement === 'between_texts' || config.mediaPlacement === 'after_primary_text') {
      await sendPromoMedia(ctx, config);
    }

    await ctx.reply(text2, { reply_markup: keyboard, parse_mode: 'HTML' });
  } else {
    const text = ctx.t(config.messageKey, { name });

    if (config.mediaPlacement === 'before_text') {
      await sendPromoMedia(ctx, config);
    }

    await ctx.reply(text, { reply_markup: keyboard, parse_mode: 'HTML' });

    if (config.mediaPlacement === 'after_primary_text') {
      await sendPromoMedia(ctx, config);
    }
  }
};

export const startHandler = async (ctx: BotContext) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const shouldResetDeepLink =
    Boolean(ctx.message?.text?.trim().match(START_COMMAND_REGEX)) || ctx.callbackQuery?.data === 'start';
  const startPayload = extractStartPayload(ctx.message?.text);
  if (shouldResetDeepLink) {
    ctx.session.deepLinkSlug = undefined;
  }

  if (startPayload) {
    const deepLinkConfig = getDeepLinkConfig(startPayload);
    ctx.session.deepLinkSlug = deepLinkConfig ? startPayload : undefined;
  }

  logger.info(`[INFO] User started the bot - Telegram ID: ${telegramId}, Username: @${ctx.from?.username || 'N/A'}`);

  // First, check if the user exists in the database
  const user = await UserService.getUserByTelegramId(telegramId);

  // If user exists, set locale from their stored language_code and show welcome
  if (user) {
    if (user.language_code) {
      await ctx.i18n.setLocale(user.language_code);
      ctx.session.languageSelected = true;
    }

    const activeDeepLinkSlug = ctx.session.deepLinkSlug;
    if (activeDeepLinkSlug) {
      const deepLinkConfig = getDeepLinkConfig(activeDeepLinkSlug);
      if (deepLinkConfig) {
        await showPromoMessage(ctx, deepLinkConfig);
        return;
      }
    }

    // Check if user is logged in (not logged out)
    const isLoggedIn = !user.is_logged_out;

    if (user.is_admin && isLoggedIn) {
      const text = ctx.t('admin_menu_header');
      const keyboard = getAdminMenuKeyboard(user.language_code || 'uz');

      if (ctx.callbackQuery) {
        await ctx.deleteMessage().catch((err) => {
          if (!isMessageToDeleteNotFoundError(err)) throw err;
        });
        await ctx.answerCallbackQuery().catch((err) => {
          if (!isCallbackQueryExpiredError(err)) throw err;
        });
      }

      await ctx.reply(text, { reply_markup: keyboard });
      return;
    }

    const text = ctx.t('welcome_message');
    const keyboard = getMainKeyboard(ctx, false, isLoggedIn);

    if (ctx.callbackQuery) {
      await ctx.deleteMessage().catch((err) => {
        if (!isMessageToDeleteNotFoundError(err)) throw err;
      });
      await ctx.answerCallbackQuery().catch((err) => {
        if (!isCallbackQueryExpiredError(err)) throw err;
      });
    }

    await ctx.reply(text, { reply_markup: keyboard });
    return;
  }

  // User not found in database - check if language has been selected
  if (!ctx.session?.languageSelected) {
    const text = ctx.t('start_message');
    const keyboard = getLanguageKeyboard();

    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { reply_markup: keyboard }).catch((err) => {
        if (!isMessageToDeleteNotFoundError(err)) throw err;
      });
      await ctx.answerCallbackQuery().catch((err) => {
        if (!isCallbackQueryExpiredError(err)) throw err;
      });
    } else {
      await ctx.reply(text, { reply_markup: keyboard });
    }
    return;
  }

  const activeDeepLinkSlug = ctx.session.deepLinkSlug;
  if (activeDeepLinkSlug) {
    const deepLinkConfig = getDeepLinkConfig(activeDeepLinkSlug);
    if (deepLinkConfig) {
      await showPromoMessage(ctx, deepLinkConfig);
      return;
    }
  }

  // Language selected but user not in database - show main menu with login button
  const text = ctx.t('welcome_message');
  const keyboard = getMainKeyboard(ctx, false, false);

  if (ctx.callbackQuery) {
    await ctx.deleteMessage().catch((err) => {
      if (!isMessageToDeleteNotFoundError(err)) throw err;
    });
    await ctx.answerCallbackQuery().catch((err) => {
      if (!isCallbackQueryExpiredError(err)) throw err;
    });
  }

  await ctx.reply(text, { reply_markup: keyboard });
}
