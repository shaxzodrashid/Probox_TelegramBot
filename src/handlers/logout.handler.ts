import { BotContext } from '../types/context';
import { UserService } from '../services/user.service';
import { getMainKeyboardByLocale } from '../keyboards';
import { i18n } from '../i18n';
import { logger } from '../utils/logger';

export async function logoutHandler(ctx: BotContext) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const locale = (await ctx.i18n.getLocale()) || 'uz';

  logger.info(`[LOGOUT] User ${telegramId} requested logout`);

  // Mark user as logged out
  await UserService.logoutUser(telegramId);

  // Clear session
  ctx.session = {};

  // Show confirmation and updated menu
  await ctx.reply(i18n.t(locale, 'logout_success'), {
    reply_markup: getMainKeyboardByLocale(locale, false, false),
  });
}
