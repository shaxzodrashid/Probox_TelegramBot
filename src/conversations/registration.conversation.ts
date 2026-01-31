import { BotConversation, BotContext } from '../types/context';
import { Keyboard, InlineKeyboard } from 'grammy';
import { getMainKeyboardByLocale } from '../keyboards';
import { getAdminMenuKeyboard } from '../keyboards/admin.keyboards';
import { i18n } from '../i18n';
import { UserService } from '../services/user.service';
import { OtpService } from '../services/otp.service';
import { logger } from '../utils/logger';
import { SapService } from '../sap/sap-hana.service';
import { HanaService } from '../sap/hana.service';
import { IBusinessPartner } from '../interfaces/business-partner.interface';
import { getLocaleFromConversation } from '../utils/locale';
import { formatUzPhone } from '../utils/uz-phone.util';

/**
 * Checks if the user exists in SAP HANA by phone number.
 */
async function verifySapUser(phoneNumber: string): Promise<IBusinessPartner | undefined> {
  const hanaService = new HanaService();
  const sapService = new SapService(hanaService);
  const user = await sapService.getBusinessPartnerByPhone(phoneNumber);

  if (user && user.length > 0) {
    return user[0];
  }
  return undefined;
}


/**
 * Requests phone number from the user until a valid one is provided or /start is called.
 */
async function requestPhoneNumber(
  conversation: BotConversation,
  ctx: BotContext,
  locale: string
): Promise<{ phoneNumber: string, ctx: BotContext } | null> {
  const sharePhoneKeyboard = new Keyboard()
    .requestContact(i18n.t(locale, 'share-phone-button'))
    .resized()
    .oneTime();

  await ctx.reply(i18n.t(locale, 'ask-phone'), {
    reply_markup: sharePhoneKeyboard,
  });

  while (true) {
    const messageContext = await conversation.wait();
    const message = messageContext.message;

    if (message?.text === '/start') {
      return null;
    }

    if (message?.contact) {
      const normalized = formatUzPhone(message.contact.phone_number);
      return { phoneNumber: normalized, ctx: messageContext };
    }

    if (message?.text) {
      const normalized = formatUzPhone(message.text);
      if (/^\+998\d{9}$/.test(normalized)) {
        return { phoneNumber: normalized, ctx: messageContext };
      }
    }

    // If input is invalid, re-ask (or just loop waiting for valid input).
    // Original behavior re-sends the prompt.
    await messageContext.reply(i18n.t(locale, 'ask-phone'), {
      reply_markup: sharePhoneKeyboard,
    });
  }
}

/**
 * Handles the OTP verification flow.
 * Returns true if verified, false if cancelled (e.g. /start).
 */
export async function performOtpVerification(
  conversation: BotConversation,
  ctx: BotContext, // Context to reply to initially
  phoneNumber: string,
  locale: string
): Promise<{ verified: boolean, lastCtx: BotContext }> {
  const isDevelopment = process.env.NODE_ENV === 'development';

  const otp = await conversation.external(() => OtpService.createOtp(phoneNumber));
  const otpMessage = `${i18n.t(locale, 'otp-sent')}\n\n${i18n.t(locale, 'ask-otp')}`;
  const messageWithCode = isDevelopment ? `${otpMessage}\n\n🔑 Dev code: ${otp}` : otpMessage;
  await ctx.reply(messageWithCode);

  while (true) {
    const otpContext = await conversation.wait();

    // Handle Resend
    if (otpContext.callbackQuery?.data === 'resend_otp') {
      await otpContext.answerCallbackQuery();
      const resendOtp = await conversation.external(() => OtpService.createOtp(phoneNumber));
      const resendMessage = isDevelopment ? `${otpMessage}\n\n🔑 Dev code: ${resendOtp}` : otpMessage;
      await otpContext.reply(resendMessage);
      continue;
    }

    // Handle /start
    if (otpContext.message?.text === '/start') {
      return { verified: false, lastCtx: otpContext };
    }

    const text = otpContext.message?.text;

    // Valid OTP format check
    if (text && /^\d{6}$/.test(text)) {
      const isCorrect = await conversation.external(() => OtpService.verifyOtp(phoneNumber, text));

      if (isCorrect) {
        return { verified: true, lastCtx: otpContext };
      }
    }

    // If we reach here, OTP was incorrect or invalid format (but not /start)
    if (otpContext.message) {
      await conversation.external(() => OtpService.clearOtp(phoneNumber));

      const resendKeyboard = new InlineKeyboard().text(
        i18n.t(locale, 'resend-otp-button'),
        'resend_otp'
      );

      await otpContext.reply(i18n.t(locale, 'invalid-otp'), {
        reply_markup: resendKeyboard
      });
    }
  }
}

/**
 * Handles creation of a new user including SAP lookup.
 */
async function registerNewUser(
  conversation: BotConversation,
  ctx: BotContext,
  phoneNumber: string,
  locale: string
) {
  const sapUser = await conversation.external(() => verifySapUser(phoneNumber));

  const data_to_store = {
    telegram_id: ctx.from?.id,
    first_name: sapUser?.CardName?.split(' ')[0] || ctx.from?.first_name || '',
    last_name: sapUser?.CardName?.split(' ')[1] || ctx.from?.last_name || '',
    phone_number: phoneNumber,
    language_code: locale,
    sap_card_code: sapUser?.CardCode || '',
    is_admin: sapUser?.U_admin === 'yes',
    created_at: new Date(),
    updated_at: new Date()
  };

  await conversation.external(() => UserService.createUser(data_to_store));
  return data_to_store.is_admin;
}


/**
 * Main Registration Conversation
 */
export async function registrationConversation(conversation: BotConversation, ctx: BotContext) {
  const locale = await getLocaleFromConversation(conversation);
  const telegramId = ctx.from?.id;

  // 1. Check if user is already registered by Telegram ID
  if (telegramId) {
    const existingUser = await conversation.external(() => UserService.getUserByTelegramId(telegramId));

    if (existingUser) {
      // User already registered, show main menu directly
      logger.info(`User with Telegram ID ${telegramId} is already registered.`);

      if (existingUser.is_admin) {
        await ctx.reply(i18n.t(locale, 'admin-menu-header'), {
          reply_markup: getAdminMenuKeyboard(locale),
        });
      } else {
        await ctx.reply(i18n.t(locale, 'welcome-message'), {
          reply_markup: getMainKeyboardByLocale(locale),
        });
      }
      return;
    }
  }

  // 2. Get Phone Number (only for new users)
  const phoneResult = await requestPhoneNumber(conversation, ctx, locale);
  if (!phoneResult) return; // /start was called

  const { phoneNumber, ctx: phoneCtx } = phoneResult;
  logger.info(`Extracted phone number: ${phoneNumber}`);

  if (ctx.session) {
    ctx.session.user_phone = phoneNumber;
  }

  // 3. Verify OTP for new user
  const { verified, lastCtx } = await performOtpVerification(conversation, phoneCtx, phoneNumber, locale);

  if (!verified) return; // /start called during OTP

  // 4. Register new user
  const isAdmin = await registerNewUser(conversation, lastCtx, phoneNumber, locale);

  // 5. Delete all tracked messages from the registration conversation

  // 6. Success: Show confirmation and main menu
  await lastCtx.reply(i18n.t(locale, 'phone-saved'), {
    reply_markup: { remove_keyboard: true },
  });

  // 7. Show welcome message with appropriate menu keyboard
  if (isAdmin) {
    await lastCtx.reply(i18n.t(locale, 'admin-menu-header'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
  } else {
    await lastCtx.reply(i18n.t(locale, 'welcome-message'), {
      reply_markup: getMainKeyboardByLocale(locale),
    });
  }
}
