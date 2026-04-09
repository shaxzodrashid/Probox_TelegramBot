import { BotConversation, BotContext } from '../types/context';
import { i18n } from '../i18n';
import { UserService } from '../services/user.service';
import { performOtpVerification, verifySapUser } from './registration.conversation';
import { getMainKeyboardByLocale } from '../keyboards';
import { getLocaleFromConversation } from '../utils/locale';
import { sanitizeName } from '../utils/formatter.util';
import { CouponRegistrationService } from '../services/coupon-registration.service';

/**
 * Conversation to change user's name
 */
export async function changeNameConversation(conversation: BotConversation, ctx: BotContext) {
  const locale = await getLocaleFromConversation(conversation);
  const telegramId = ctx.from?.id;

  if (!telegramId) return;

  // Ask for First Name
  await ctx.reply(i18n.t(locale, 'settings_enter_first_name'), {
    reply_markup: { remove_keyboard: true },
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
  const sanitizedFirstName = sanitizeName(firstName);
  const sanitizedLastName = sanitizeName(lastName);

  await conversation.external(() =>
    UserService.updateUserName(telegramId, sanitizedFirstName, sanitizedLastName),
  );

  const user = await conversation.external(() => UserService.getUserByTelegramId(telegramId));
  const isAdmin = user?.is_admin || false;

  await ctx.reply(i18n.t(locale, 'settings_name_updated'), {
    reply_markup: getMainKeyboardByLocale(locale, isAdmin, true),
  });
}

/**
 * Conversation to change user's phone number
 */
export async function changePhoneConversation(conversation: BotConversation, ctx: BotContext) {
  const locale = await getLocaleFromConversation(conversation);
  const telegramId = ctx.from?.id;

  if (!telegramId) return;

  const existingUser = await conversation.external(() =>
    UserService.getUserByTelegramId(telegramId),
  );
  const isFirstTimePhone = existingUser && !existingUser.phone_number;

  await ctx.reply(i18n.t(locale, 'settings_enter_phone'), {
    reply_markup: { remove_keyboard: true },
  });

  while (true) {
    const phoneCtx = await conversation.wait();
    const text = phoneCtx.message?.text;

    if (text === '/start') return;

    if (text && /^\+998\d{9}$/.test(text)) {
      const phoneNumber = text;

      // Perform OTP Verification
      const { verified, lastCtx } = await performOtpVerification(
        conversation,
        phoneCtx,
        phoneNumber,
        locale,
      );

      if (!verified) return;

      if (isFirstTimePhone && existingUser) {
        const sapUser = await conversation.external(() => verifySapUser(phoneNumber));

        const dataToUpdate: any = {
          phone_number: phoneNumber,
          updated_at: new Date(),
        };

        if (sapUser) {
          dataToUpdate.first_name = sanitizeName(
            sapUser.CardName?.split(' ')[0] || existingUser.first_name || '',
          );
          dataToUpdate.last_name = sanitizeName(
            sapUser.CardName?.split(' ')[1] || existingUser.last_name || '',
          );
          dataToUpdate.sap_card_code = sapUser.CardCode || '';
          dataToUpdate.is_admin = sapUser.U_admin === 'yes';
        }

        await conversation.external(() => UserService.updateUser(existingUser.id, dataToUpdate));
      } else {
        // Update in DB
        await conversation.external(() => UserService.updateUserPhone(telegramId, phoneNumber));
      }

      const user = await conversation.external(() => UserService.getUserByTelegramId(telegramId));
      const isAdmin = user?.is_admin || false;

      await lastCtx.reply(i18n.t(locale, 'settings_phone_updated'), {
        reply_markup: getMainKeyboardByLocale(locale, isAdmin, true),
      });

      if (user?.phone_number) {
        await conversation.external(() =>
          CouponRegistrationService.claimPendingCouponsForUser(user),
        );
      }
      break;
    } else {
      await phoneCtx.reply(i18n.t(locale, 'settings_enter_phone'));
    }
  }
}
