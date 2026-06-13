import { Api, RawApi } from 'grammy';
import { Message } from 'grammy/types';
import { logger } from '../logger';

interface SendRichMessagePayload {
  chat_id: number;
  rich_message: {
    html: string;
  };
  reply_markup?: unknown;
}

interface TelegramRichMessageRawApi {
  sendRichMessage(payload: SendRichMessagePayload): Promise<Message>;
}

const getTelegramErrorCode = (error: unknown): number | null => {
  if (!error || typeof error !== 'object' || !('error_code' in error)) {
    return null;
  }

  const errorCode = (error as { error_code?: unknown }).error_code;
  return typeof errorCode === 'number' ? errorCode : null;
};

export const isRichMessageFallbackError = (error: unknown): boolean => {
  const errorCode = getTelegramErrorCode(error);
  return errorCode === 400 || errorCode === 404;
};

export const trySendTelegramRichMessage = async (params: {
  api: Api<RawApi>;
  chatId: number;
  html: string;
  replyMarkup?: unknown;
}): Promise<Message | null> => {
  const rawApi = params.api.raw as unknown as Partial<TelegramRichMessageRawApi> | undefined;

  if (!rawApi || typeof rawApi.sendRichMessage !== 'function') {
    logger.warn('[TELEGRAM_RICH_MESSAGE] Rich-message API is unavailable in the current runtime.', {
      chatId: params.chatId,
      htmlChars: params.html.length,
    });
    return null;
  }

  logger.info('[TELEGRAM_RICH_MESSAGE] Attempting rich-message delivery.', {
    chatId: params.chatId,
    htmlChars: params.html.length,
    hasReplyMarkup: Boolean(params.replyMarkup),
  });

  try {
    const message = await rawApi.sendRichMessage({
      chat_id: params.chatId,
      rich_message: {
        html: params.html,
      },
      ...(params.replyMarkup ? { reply_markup: params.replyMarkup } : {}),
    });

    logger.info('[TELEGRAM_RICH_MESSAGE] Rich-message delivery succeeded.', {
      chatId: params.chatId,
      messageId: message.message_id,
    });

    return message;
  } catch (error) {
    if (isRichMessageFallbackError(error)) {
      logger.warn(
        '[TELEGRAM_RICH_MESSAGE] Rich-message delivery was rejected; standard fallback is required.',
        {
          chatId: params.chatId,
          errorCode: getTelegramErrorCode(error),
          error,
        },
      );
      return null;
    }

    logger.error('[TELEGRAM_RICH_MESSAGE] Rich-message delivery failed without fallback.', {
      chatId: params.chatId,
      errorCode: getTelegramErrorCode(error),
      error,
    });
    throw error;
  }
};
