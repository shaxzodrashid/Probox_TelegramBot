import { BotContext } from '../types/context';
import { getMainKeyboard, getLanguageKeyboard } from '../keyboards';
import { getAdminMenuKeyboard } from '../keyboards/admin.keyboards';
import { logger } from '../utils/logger';
import { UserService } from '../services/user.service';

export const startHandler = async (ctx: BotContext) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  logger.info(`[INFO] User started the bot - Telegram ID: ${telegramId}, Username: @${ctx.from?.username || 'N/A'}`);

  // First, check if the user exists in the database
  const user = await UserService.getUserByTelegramId(telegramId);

  // If user exists, set locale from their stored language_code and show welcome
  if (user) {
    if (user.language_code) {
      await ctx.i18n.setLocale(user.language_code);
      ctx.session.languageSelected = true;
    }

    if (user.is_admin) {
      const text = ctx.t('admin-menu-header');
      const keyboard = getAdminMenuKeyboard(user.language_code || 'uz');

      if (ctx.callbackQuery) {
        await ctx.deleteMessage().catch(() => { });
        await ctx.answerCallbackQuery();
      }

      await ctx.reply(text, { reply_markup: keyboard });
      return;
    }

    const text = ctx.t('welcome-message');
    const keyboard = getMainKeyboard(ctx);

    if (ctx.callbackQuery) {
      await ctx.deleteMessage().catch(() => { });
      await ctx.answerCallbackQuery();
    }

    await ctx.reply(text, { reply_markup: keyboard });
    return;
  }

  // User not found in database - check if language has been selected
  if (!ctx.session?.languageSelected) {
    const text = ctx.t('start-message');
    const keyboard = getLanguageKeyboard();

    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { reply_markup: keyboard });
      await ctx.answerCallbackQuery();
    } else {
      await ctx.reply(text, { reply_markup: keyboard });
    }
    return;
  }

  // Language selected but user not in database - show main menu directly (registration will be prompted when needed)
  const text = ctx.t('welcome-message');
  const keyboard = getMainKeyboard(ctx);

  if (ctx.callbackQuery) {
    await ctx.deleteMessage().catch(() => { });
    await ctx.answerCallbackQuery();
  }

  await ctx.reply(text, { reply_markup: keyboard });
}

