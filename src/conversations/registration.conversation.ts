import { BotConversation, BotContext } from '../types/context';
import { Keyboard, InlineKeyboard, Api } from 'grammy';
import { config } from '../config';
import { getMainKeyboardByLocale } from '../keyboards';
import { getAdminMenuKeyboard } from '../keyboards/admin.keyboards';
import { i18n } from '../i18n';
import {
  getUserIdentityResetData,
  isUserIdentitySwitch,
  User,
  UserService,
} from '../services/user.service';
import { OtpService } from '../services/otp.service';
import { logger } from '../utils/logger';
import { SapService } from '../sap/sap-hana.service';
import { HanaService } from '../sap/hana.service';
import { IBusinessPartner } from '../interfaces/business-partner.interface';
import { getLocaleFromConversation } from '../utils/locale';
import { isCallbackQueryExpiredError } from '../utils/telegram/telegram-errors';
import { strictNormalizeUzPhone } from '../utils/uz-phone.util';
import { sanitizeName } from '../utils/formatting/formatter.util';
import { redisService } from '../redis/redis.service';
import { CouponRegistrationService } from '../services/coupon/coupon-registration.service';
import { clearAccountSwitchArtifacts } from '../utils/account-switch.util';
import {
  isSapBusinessPartnerAdmin,
  selectPreferredSapBusinessPartner,
} from '../utils/sap-business-partner.util';

const REGISTRATION_ACTIVE_TTL_SECONDS = 60 * 60;

/**
 * Checks if the user exists in SAP HANA by phone number.
 */
export async function verifySapUser(phoneNumber: string): Promise<IBusinessPartner | undefined> {
  const hanaService = new HanaService();
  const sapService = new SapService(hanaService);
  const partners = await sapService.getBusinessPartnerByPhone(phoneNumber);

  if (partners && partners.length > 0) {
    return selectPreferredSapBusinessPartner(partners);
  }
  return undefined;
}

/**
 * Requests the user's own Telegram contact until a valid one is shared or /start is called.
 */
async function requestPhoneNumber(
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
    const messageContext = await conversation.wait();
    const message = messageContext.message;

    if (message?.text === '/start') {
      return null;
    }

    const contact = message?.contact;
    if (contact) {
      if (!telegramId || contact.user_id !== telegramId) {
        await messageContext.reply(i18n.t(locale, 'phone_share_own_contact', {
          button: sharePhoneButtonText,
        }), {
          reply_markup: sharePhoneKeyboard,
        });
        continue;
      }

      try {
        return {
          phoneNumber: strictNormalizeUzPhone(contact.phone_number),
          ctx: messageContext,
        };
      } catch (error) {
        logger.warn('Invalid phone number received from Telegram contact sharing:', {
          phoneNumber: contact.phone_number,
          telegramId,
          error,
        });
      }
    }

    await messageContext.reply(i18n.t(locale, 'phone_share_only', {
      button: sharePhoneButtonText,
    }), {
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
  ctx: BotContext,
  phoneNumber: string,
  locale: string,
): Promise<{ verified: boolean; lastCtx: BotContext }> {
  const isDevelopment = process.env.NODE_ENV === 'development';
  let timerId: NodeJS.Timeout | null = null;

  const clearTimer = () => {
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  const startResendTimer = (currentCtx: BotContext) => {
    clearTimer();
    const chatId = currentCtx.chat?.id;
    if (!chatId) return;

    timerId = setTimeout(async () => {
      try {
        const telegramId = currentCtx.from?.id;
        if (telegramId) {
          const existingUser = await UserService.getUserByTelegramId(telegramId);
          if (existingUser) return;
        }

        const api = new Api(config.BOT_TOKEN);
        const resendKeyboard = new Keyboard()
          .text(i18n.t(locale, 'resend_otp_button'))
          .resized()
          .oneTime();

        await api.sendMessage(chatId, i18n.t(locale, 'otp_resend_info'), {
          reply_markup: resendKeyboard,
        });
      } catch (error) {
        logger.error('Error sending automatic resend button:', error);
      }
    }, 60000);
  };

  const sendOtp = async (targetCtx: BotContext) => {
    const otp = await conversation.external(() => OtpService.createOtp(phoneNumber));
    const otpMessage = `${i18n.t(locale, 'otp_sent_wait')}\n\n${i18n.t(locale, 'ask_otp')}`;
    const messageWithCode = isDevelopment ? `${otpMessage}\n\n🔑 Dev code: ${otp}` : otpMessage;
    await targetCtx.reply(messageWithCode);
    startResendTimer(targetCtx);
  };

  await sendOtp(ctx);

  try {
    while (true) {
      const otpContext = await conversation.wait();
      clearTimer();

      const isResendButton = otpContext.message?.text === i18n.t(locale, 'resend_otp_button');
      const isResendCallback = otpContext.callbackQuery?.data === 'resend_otp';

      if (isResendButton || isResendCallback) {
        if (isResendCallback) {
          await otpContext.answerCallbackQuery().catch((err) => {
            if (!isCallbackQueryExpiredError(err)) throw err;
          });
        }
        await sendOtp(otpContext);
        continue;
      }

      if (otpContext.message?.text === '/start') {
        return { verified: false, lastCtx: otpContext };
      }

      const text = otpContext.message?.text;
      if (text && /^\d{6}$/.test(text)) {
        const isCorrect = await conversation.external(() =>
          OtpService.verifyOtp(phoneNumber, text),
        );

        if (isCorrect) {
          return { verified: true, lastCtx: otpContext };
        }
      }

      if (otpContext.message) {
        await conversation.external(() => OtpService.clearOtp(phoneNumber));

        const resendKeyboard = new InlineKeyboard().text(
          i18n.t(locale, 'resend_otp_button'),
          'resend_otp',
        );

        await otpContext.reply(i18n.t(locale, 'invalid_otp'), {
          reply_markup: resendKeyboard,
        });

        startResendTimer(otpContext);
      }
    }
  } finally {
    clearTimer();
  }
}

async function registerOrUpdateUser(
  conversation: BotConversation,
  ctx: BotContext,
  phoneNumber: string,
  locale: string,
): Promise<User | null> {
  const sapUser = await conversation.external(() => verifySapUser(phoneNumber));

  const telegramId = ctx.from?.id;
  if (!telegramId) return null;

  const dataToStore: Omit<User, 'id' | 'telegram_id' | 'created_at'> & {
    telegram_id?: number;
    created_at?: Date;
  } = {
    first_name: sanitizeName(sapUser?.CardName?.split(' ')[0] || ctx.from?.first_name),
    last_name: sanitizeName(sapUser?.CardName?.split(' ')[1] || ctx.from?.last_name),
    phone_number: phoneNumber,
    language_code: locale,
    sap_card_code: sapUser?.CardCode || '',
    is_admin: isSapBusinessPartnerAdmin(sapUser),
    is_logged_out: false,
    updated_at: new Date(),
  };

  const existingUser = await conversation.external(() =>
    UserService.getUserByTelegramId(telegramId),
  );

  if (existingUser) {
    const switchedAccount = isUserIdentitySwitch(existingUser.phone_number, phoneNumber);
    const updatePayload = switchedAccount
      ? { ...dataToStore, ...getUserIdentityResetData() }
      : dataToStore;

    const updatedUser = await conversation.external(() =>
      UserService.updateUser(existingUser.id, updatePayload),
    );

    if (switchedAccount) {
      await conversation.external(() => clearAccountSwitchArtifacts(telegramId));
    }

    return updatedUser;
  }

  dataToStore.telegram_id = telegramId;
  dataToStore.created_at = new Date();
  return conversation.external(() => UserService.createUser(dataToStore));
}

export async function registrationConversation(conversation: BotConversation, ctx: BotContext) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const registrationActiveKey = `registrationActive:${telegramId}`;

  await conversation.external(() =>
    redisService.set(registrationActiveKey, true, REGISTRATION_ACTIVE_TTL_SECONDS),
  );

  try {
    // Read pendingAction from Redis
    const pendingAction = await conversation.external(() =>
      redisService.get<string>(`pendingAction:${telegramId}`),
    );
    const locale = await getLocaleFromConversation(conversation);

    const phoneResult = await requestPhoneNumber(conversation, ctx, locale);
    if (!phoneResult) return;

    const { phoneNumber, ctx: phoneCtx } = phoneResult;
    logger.info(`Extracted phone number: ${phoneNumber}`);

    if (ctx.session) {
      ctx.session.user_phone = phoneNumber;
    }

    const user = await registerOrUpdateUser(conversation, phoneCtx, phoneNumber, locale);
    if (!user) return;

    await phoneCtx.reply(i18n.t(locale, 'phone_saved'), {
      reply_markup: { remove_keyboard: true },
    });

    if (user.phone_number) {
      await conversation.external(() => CouponRegistrationService.claimPendingCouponsForUser(user));
    }

    if (pendingAction === 'application') {
      // Inside a conversation, ctx.conversation is unavailable (plain hydrated Context).
      // The pendingAction key stays in Redis. The bot-level pending-action router will
      // pick it up on the next update.
      // Give the user a button to tap so the router fires immediately — clean UX.
      const continueKeyboard = new InlineKeyboard().text(
        i18n.t(locale, 'application_continue_button'),
        'continue_to_application',
      );
      await phoneCtx.reply(i18n.t(locale, 'registration_success_continue'), {
        reply_markup: continueKeyboard,
      });
      return;
    }

    if (user.is_admin) {
      await phoneCtx.reply(i18n.t(locale, 'admin_menu_header'), {
        reply_markup: getAdminMenuKeyboard(locale),
      });
    } else {
      await phoneCtx.reply(i18n.t(locale, 'welcome_message'), {
        reply_markup: getMainKeyboardByLocale(locale, false, true),
      });
    }
  } finally {
    await conversation.external(() => redisService.delete(registrationActiveKey));
  }
}
