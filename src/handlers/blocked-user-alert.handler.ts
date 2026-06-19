import type { MessageEntity } from 'grammy/types';
import {
  BLOCKED_USER_BACK_CALLBACK_PREFIX,
  BLOCKED_USER_DETAILS_CALLBACK_PREFIX,
  getBlockedUserAlertKeyboard,
  getBlockedUserCardKeyboard,
} from '../keyboards/blocked-user-alert.keyboards';
import { redisService } from '../redis/redis.service';
import { UserService } from '../services/user.service';
import type { BotContext } from '../types/context';
import { i18n } from '../i18n';
import { logger } from '../utils/logger';
import {
  extractUsernameFromBlockedUserAlert,
  formatBlockedUserCard,
} from '../utils/telegram/blocked-user-card.util';
import { isCallbackQueryExpiredError } from '../utils/telegram/telegram-errors';

const ALERT_STATE_TTL_SECONDS = 30 * 24 * 60 * 60;
const ALERT_STATE_KEY_PREFIX = 'blocked-user-alert:';

interface BlockedUserAlertState {
  text: string;
  entities: MessageEntity[];
  telegramId: number;
}

const getAlertStateKey = (chatId: number, messageId: number): string =>
  `${ALERT_STATE_KEY_PREFIX}${chatId}:${messageId}`;

const parseTelegramId = (callbackData: string, prefix: string): number | null => {
  const telegramId = Number(callbackData.slice(prefix.length));
  return Number.isSafeInteger(telegramId) && telegramId > 0 ? telegramId : null;
};

const answerCallback = async (
  ctx: BotContext,
  options?: { text?: string; show_alert?: boolean },
): Promise<void> => {
  await ctx.answerCallbackQuery(options).catch((error) => {
    if (!isCallbackQueryExpiredError(error)) {
      throw error;
    }
  });
};

const requireAdmin = async (ctx: BotContext): Promise<boolean> => {
  const adminId = ctx.from?.id;
  if (!adminId) {
    return false;
  }

  const admin = await UserService.getUserByTelegramId(adminId);
  if (admin?.is_admin) {
    return true;
  }

  await answerCallback(ctx, {
    text: i18n.t(admin?.language_code || 'uz', 'admin_access_denied'),
    show_alert: true,
  });
  return false;
};

export const blockedUserDetailsHandler = async (ctx: BotContext): Promise<void> => {
  try {
    if (!(await requireAdmin(ctx))) {
      return;
    }

    const callbackData = ctx.callbackQuery?.data || '';
    const telegramId = parseTelegramId(callbackData, BLOCKED_USER_DETAILS_CALLBACK_PREFIX);
    const message = ctx.callbackQuery?.message;
    const chatId = message?.chat.id;

    if (!telegramId || !message || !chatId || !('text' in message) || !message.text) {
      await answerCallback(ctx, {
        text: "Mijoz ma'lumotlarini ochib bo'lmadi.",
        show_alert: true,
      });
      return;
    }

    const state: BlockedUserAlertState = {
      text: message.text,
      entities: message.entities || [],
      telegramId,
    };

    await redisService.set(
      getAlertStateKey(chatId, message.message_id),
      state,
      ALERT_STATE_TTL_SECONDS,
    );

    const user = await UserService.getUserByTelegramId(telegramId);
    const username = extractUsernameFromBlockedUserAlert(message.text);

    await ctx.editMessageText(formatBlockedUserCard({ telegramId, user, username }), {
      parse_mode: 'HTML',
      reply_markup: getBlockedUserCardKeyboard(telegramId),
    });
    await answerCallback(ctx);
  } catch (error) {
    logger.error('Error in blockedUserDetailsHandler:', error);
    await answerCallback(ctx, {
      text: "Mijoz ma'lumotlarini ochishda xatolik yuz berdi.",
      show_alert: true,
    }).catch(() => undefined);
  }
};

export const blockedUserAlertBackHandler = async (ctx: BotContext): Promise<void> => {
  try {
    if (!(await requireAdmin(ctx))) {
      return;
    }

    const callbackData = ctx.callbackQuery?.data || '';
    const telegramId = parseTelegramId(callbackData, BLOCKED_USER_BACK_CALLBACK_PREFIX);
    const message = ctx.callbackQuery?.message;
    const chatId = message?.chat.id;

    if (!telegramId || !message || !chatId) {
      await answerCallback(ctx, {
        text: "Bildirishnomaga qaytib bo'lmadi.",
        show_alert: true,
      });
      return;
    }

    const stateKey = getAlertStateKey(chatId, message.message_id);
    const state = await redisService.get<BlockedUserAlertState>(stateKey);

    if (!state || state.telegramId !== telegramId) {
      await answerCallback(ctx, {
        text: 'Asl bildirishnoma saqlanmagan. Iltimos, yangi bildirishnomadan foydalaning.',
        show_alert: true,
      });
      return;
    }

    await ctx.editMessageText(state.text, {
      entities: state.entities,
      parse_mode: undefined,
      reply_markup: getBlockedUserAlertKeyboard(telegramId),
    });
    await answerCallback(ctx);
    await redisService.delete(stateKey).catch((error) => {
      logger.warn('Failed to clear restored blocked-user alert state:', error);
    });
  } catch (error) {
    logger.error('Error in blockedUserAlertBackHandler:', error);
    await answerCallback(ctx, {
      text: 'Bildirishnomaga qaytishda xatolik yuz berdi.',
      show_alert: true,
    }).catch(() => undefined);
  }
};
