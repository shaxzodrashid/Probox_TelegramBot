import { BotConversation, BotContext } from '../types/context';
import { Keyboard } from 'grammy';
import { i18n } from '../i18n';
import { User, UserService, normalizeUserPhoneForIdentity } from '../services/user.service';
import { verifySapUser } from './registration.conversation';
import { getMainKeyboardByLocale } from '../keyboards';
import { getLocaleFromConversation } from '../utils/locale';
import { sanitizeName } from '../utils/formatting/formatter.util';
import { CouponRegistrationService } from '../services/coupon/coupon-registration.service';
import { isSapBusinessPartnerAdmin } from '../utils/sap-business-partner.util';
import { strictNormalizeUzPhone } from '../utils/uz-phone.util';
import { logger } from '../utils/logger';

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

async function requestSharedContactPhoneNumber(
  conversation: BotConversation,
  ctx: BotContext,
  locale: string,
): Promise<{ phoneNumber: string; ctx: BotContext } | null> {
  const telegramId = ctx.from?.id;
  const sharePhoneButtonText = i18n.t(locale, 'share_phone_button');
  const sharePhoneKeyboard = new Keyboard()
    .requestContact(sharePhoneButtonText)
    .resized()
    .oneTime();

  await ctx.reply(i18n.t(locale, 'ask_phone'), {
    reply_markup: sharePhoneKeyboard,
  });

  while (true) {
    const phoneCtx = await conversation.wait();
    const message = phoneCtx.message;

    if (message?.text === '/start') return null;

    const contact = message?.contact;
    if (contact) {
      if (!telegramId || contact.user_id !== telegramId) {
        await phoneCtx.reply(i18n.t(locale, 'phone_share_own_contact', {
          button: sharePhoneButtonText,
        }), {
          reply_markup: sharePhoneKeyboard,
        });
        continue;
      }

      try {
        return {
          phoneNumber: strictNormalizeUzPhone(contact.phone_number),
          ctx: phoneCtx,
        };
      } catch (error) {
        logger.warn('Invalid phone number received from Telegram contact sharing:', {
          phoneNumber: contact.phone_number,
          telegramId,
          error,
        });
      }
    }

    await phoneCtx.reply(i18n.t(locale, 'phone_share_only', {
      button: sharePhoneButtonText,
    }), {
      reply_markup: sharePhoneKeyboard,
    });
  }
}

type PhoneUpdatePayload = Partial<User> & {
  updated_at: Date;
};

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
  const currentPhoneNumber = normalizeUserPhoneForIdentity(existingUser?.phone_number);

  const phoneResult = await requestSharedContactPhoneNumber(conversation, ctx, locale);
  if (!phoneResult) return;

  const { phoneNumber, ctx: phoneCtx } = phoneResult;

  if (currentPhoneNumber && currentPhoneNumber === phoneNumber) {
    await phoneCtx.reply(i18n.t(locale, 'settings_phone_unchanged'), {
      reply_markup: getMainKeyboardByLocale(locale, existingUser?.is_admin || false, true),
    });
    return;
  }

  if (isFirstTimePhone && existingUser) {
    const sapUser = await conversation.external(() => verifySapUser(phoneNumber));

    const dataToUpdate: PhoneUpdatePayload = {
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
      dataToUpdate.is_admin = isSapBusinessPartnerAdmin(sapUser);
    }

    await conversation.external(() => UserService.updateUser(existingUser.id, dataToUpdate));
  } else {
    await conversation.external(() => UserService.updateUserPhone(telegramId, phoneNumber));
  }

  const user = await conversation.external(() => UserService.getUserByTelegramId(telegramId));
  const isAdmin = user?.is_admin || false;

  await phoneCtx.reply(i18n.t(locale, 'settings_phone_updated'), {
    reply_markup: getMainKeyboardByLocale(locale, isAdmin, true),
  });

  if (user?.phone_number) {
    await conversation.external(() => CouponRegistrationService.claimPendingCouponsForUser(user));
  }
}
