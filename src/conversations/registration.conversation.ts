import { BotConversation, BotContext } from '../types/context';
import { Keyboard, InlineKeyboard } from 'grammy';
import { getMainKeyboardByLocale } from '../keyboards';
import { i18n } from '../i18n';
import { UserService } from '../services/user.service';
import { OtpService } from '../services/otp.service';
import { logger } from '../utils/logger';
import { SapService } from '../sap/sap-hana.service';
import { HanaService } from '../sap/hana.service';
import { IBusinessPartner } from '../interfaces/business-partner.interface';

/**
 * Tracker for message IDs to delete after registration
 */
interface MessageTracker {
  messageIds: number[];
  chatId: number;
}

/**
 * Helper to track a message ID
 */
function trackMessage(tracker: MessageTracker, messageId: number | undefined) {
  if (messageId) {
    tracker.messageIds.push(messageId);
  }
}

/**
 * Deletes all tracked messages
 */
async function deleteTrackedMessages(ctx: BotContext, tracker: MessageTracker) {
  for (const messageId of tracker.messageIds) {
    try {
      await ctx.api.deleteMessage(tracker.chatId, messageId);
    } catch (error) {
      // Silently ignore deletion errors (message may already be deleted or too old)
      logger.debug(`Failed to delete message ${messageId}: ${error}`);
    }
  }
}

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
 * Helper to determine the locale from context or session.
 */
async function getLocale(ctx: BotContext): Promise<string> {
  if (ctx.i18n) {
    return await ctx.i18n.getLocale();
  } else if (ctx.session && ctx.session.__language_code) {
    return ctx.session.__language_code;
  }
  return 'uz';
}

/**
 * Requests phone number from the user until a valid one is provided or /start is called.
 */
async function requestPhoneNumber(
  conversation: BotConversation, 
  ctx: BotContext, 
  locale: string,
  tracker: MessageTracker
): Promise<{ phoneNumber: string, ctx: BotContext } | null> {
  const sharePhoneKeyboard = new Keyboard()
    .requestContact(i18n.t(locale, 'share-phone-button'))
    .resized()
    .oneTime();

  const askPhoneMsg = await ctx.reply(i18n.t(locale, 'ask-phone'), {
    reply_markup: sharePhoneKeyboard,
  });
  trackMessage(tracker, askPhoneMsg.message_id);

  while (true) {
    const messageContext = await conversation.wait();
    const message = messageContext.message;

    // Track user message
    trackMessage(tracker, message?.message_id);

    if (message?.text === '/start') {
      return null;
    }

    if (message?.contact) {
      return { phoneNumber: message.contact.phone_number, ctx: messageContext };
    }

    if (message?.text && /^\+998\d{9}$/.test(message.text)) {
      return { phoneNumber: message.text, ctx: messageContext };
    }

    // If input is invalid, re-ask (or just loop waiting for valid input).
    // Original behavior re-sends the prompt.
    const reAskMsg = await messageContext.reply(i18n.t(locale, 'ask-phone'), {
      reply_markup: sharePhoneKeyboard,
    });
    trackMessage(tracker, reAskMsg.message_id);
  }
}

/**
 * Handles the OTP verification flow.
 * Returns true if verified, false if cancelled (e.g. /start).
 */
async function performOtpVerification(
  conversation: BotConversation,
  ctx: BotContext, // Context to reply to initially
  phoneNumber: string,
  locale: string,
  tracker: MessageTracker
): Promise<{ verified: boolean, lastCtx: BotContext }> {
  await conversation.external(() => OtpService.createOtp(phoneNumber));
  const otpSentMsg = await ctx.reply(i18n.t(locale, 'otp-sent'));
  trackMessage(tracker, otpSentMsg.message_id);

  while (true) {
    const askOtpMsg = await ctx.reply(i18n.t(locale, 'ask-otp'));
    trackMessage(tracker, askOtpMsg.message_id);
    const otpContext = await conversation.wait();

    // Track user message or callback query message
    trackMessage(tracker, otpContext.message?.message_id);

    // Handle Resend
    if (otpContext.callbackQuery?.data === 'resend_otp') {
      await otpContext.answerCallbackQuery();
      await conversation.external(() => OtpService.createOtp(phoneNumber));
      const resendOtpMsg = await otpContext.reply(i18n.t(locale, 'otp-sent'));
      trackMessage(tracker, resendOtpMsg.message_id);
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
      
      const invalidOtpMsg = await otpContext.reply(i18n.t(locale, 'invalid-otp'), {
        reply_markup: resendKeyboard
      });
      trackMessage(tracker, invalidOtpMsg.message_id);
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
    language_code: locale
  };

  await conversation.external(() => UserService.createUser(data_to_store));
}

/**
 * Updates an existing user's Telegram info.
 */
async function updateExistingUser(
  conversation: BotConversation,
  userId: number,
  ctx: BotContext,
  locale: string
) {
  await conversation.external(() => UserService.updateUser(userId, {
    telegram_id: ctx.from?.id,
    first_name: ctx.from?.first_name,
    last_name: ctx.from?.last_name,
    language_code: locale
  }));
}

/**
 * Main Registration Conversation
 */
export async function registrationConversation(conversation: BotConversation, ctx: BotContext) {
  const locale = await getLocale(ctx);
  
  // Initialize message tracker
  const tracker: MessageTracker = {
    messageIds: [],
    chatId: ctx.chat?.id || 0
  };

  // 1. Get Phone Number
  const phoneResult = await requestPhoneNumber(conversation, ctx, locale, tracker);
  if (!phoneResult) return; // /start was called
  
  const { phoneNumber, ctx: phoneCtx } = phoneResult;
  logger.info(`Extracted phone number: ${phoneNumber}`);
  
  if (ctx.session) {
    ctx.session.user_phone = phoneNumber;
  }

  // 2. Check if user exists
  const user = await conversation.external(() => UserService.getUserByPhone(phoneNumber));
  
  let finalCtx = phoneCtx;

  if (!user) {
    // 3. New User: Verify OTP
    const { verified, lastCtx } = await performOtpVerification(conversation, phoneCtx, phoneNumber, locale, tracker);
    finalCtx = lastCtx;

    if (!verified) return; // /start called during OTP

    // 4. Register
    await registerNewUser(conversation, finalCtx, phoneNumber, locale);
  } else {
    // 3. Existing User: Update
    await updateExistingUser(conversation, user.id, phoneCtx, locale);
  }
  
  // 5. Delete all tracked messages from the registration conversation
  await deleteTrackedMessages(finalCtx, tracker);
  
  // 6. Success: Show confirmation and main menu
  await finalCtx.reply(i18n.t(locale, 'phone-saved'), {
    reply_markup: { remove_keyboard: true },
  });

  // 7. Show welcome message with main menu keyboard
  await finalCtx.reply(i18n.t(locale, 'welcome-message'), {
    reply_markup: getMainKeyboardByLocale(locale),
  });
}
