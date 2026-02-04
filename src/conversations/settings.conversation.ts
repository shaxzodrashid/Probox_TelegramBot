import { BotConversation, BotContext } from '../types/context';
import { i18n } from '../i18n';
import { UserService } from '../services/user.service';
import { performOtpVerification } from './registration.conversation';
import { getMainKeyboardByLocale } from '../keyboards';
import { getLocaleFromConversation } from '../utils/locale';

/**
 * Conversation to change user's name
 */
export async function changeNameConversation(conversation: BotConversation, ctx: BotContext) {
  const locale = await getLocaleFromConversation(conversation);
  const telegramId = ctx.from?.id;

  if (!telegramId) return;

  // Ask for First Name
  await ctx.reply(i18n.t(locale, 'settings_enter_first_name'), {
    reply_markup: { remove_keyboard: true }
  });

  const firstNameCtx = await conversation.wait();
  if (firstNameCtx.message?.text === '/start') return;
  const firstName = firstNameCtx.message?.text || '';

  // Ask for Last Name
  await ctx.reply(i18n.t(locale, 'settings_enter_last_name'));

  const lastNameCtx = await conversation.wait();
  if (lastNameCtx.message?.text === '/start') return;
  const lastName = lastNameCtx.message?.text || '';

  // Update in DB
  await conversation.external(() => UserService.updateUserName(telegramId, firstName, lastName));

  const user = await conversation.external(() => UserService.getUserByTelegramId(telegramId));
  const isAdmin = user?.is_admin || false;

  await ctx.reply(i18n.t(locale, 'settings_name_updated'), {
    reply_markup: getMainKeyboardByLocale(locale, isAdmin)
  });
}

/**
 * Conversation to change user's phone number
 */
export async function changePhoneConversation(conversation: BotConversation, ctx: BotContext) {
  const locale = await getLocaleFromConversation(conversation);
  const telegramId = ctx.from?.id;

  if (!telegramId) return;

  await ctx.reply(i18n.t(locale, 'settings_enter_phone'), {
    reply_markup: { remove_keyboard: true }
  });

  while (true) {
    const phoneCtx = await conversation.wait();
    const text = phoneCtx.message?.text;

    if (text === '/start') return;

    if (text && /^\+998\d{9}$/.test(text)) {
      const phoneNumber = text;

      // Perform OTP Verification
      const { verified, lastCtx } = await performOtpVerification(conversation, phoneCtx, phoneNumber, locale);

      if (!verified) return;

      // Update in DB
      await conversation.external(() => UserService.updateUserPhone(telegramId, phoneNumber));

      const user = await conversation.external(() => UserService.getUserByTelegramId(telegramId));
      const isAdmin = user?.is_admin || false;

      await lastCtx.reply(i18n.t(locale, 'settings_phone_updated'), {
        reply_markup: getMainKeyboardByLocale(locale, isAdmin)
      });
      break;
    } else {
      await phoneCtx.reply(i18n.t(locale, 'settings_enter_phone'));
    }
  }
}
