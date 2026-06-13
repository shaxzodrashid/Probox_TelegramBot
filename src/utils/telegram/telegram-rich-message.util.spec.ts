import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isRichMessageFallbackError,
  trySendTelegramRichMessage,
} from './telegram-rich-message.util';
import { logger } from '../logger';

test('trySendTelegramRichMessage calls Bot API 10.1 with rich HTML and reply markup', async () => {
  const calls: unknown[] = [];
  const infoLogs: Array<{ message: string; metadata: unknown }> = [];
  const sentMessage = { message_id: 42 };
  const api = {
    raw: {
      sendRichMessage: async (payload: unknown) => {
        calls.push(payload);
        return sentMessage;
      },
    },
  };
  const originalInfo = logger.info;
  logger.info = (message: string, metadata?: unknown) => {
    infoLogs.push({ message, metadata });
  };

  try {
    const result = await trySendTelegramRichMessage({
      api: api as never,
      chatId: 55,
      html: '<p>Hello</p>',
      replyMarkup: { keyboard: [[{ text: 'Menu' }]] },
    });

    assert.equal(result, sentMessage);
    assert.deepEqual(calls, [
      {
        chat_id: 55,
        rich_message: { html: '<p>Hello</p>' },
        reply_markup: { keyboard: [[{ text: 'Menu' }]] },
      },
    ]);
    assert.deepEqual(infoLogs, [
      {
        message: '[TELEGRAM_RICH_MESSAGE] Attempting rich-message delivery.',
        metadata: { chatId: 55, htmlChars: 12, hasReplyMarkup: true },
      },
      {
        message: '[TELEGRAM_RICH_MESSAGE] Rich-message delivery succeeded.',
        metadata: { chatId: 55, messageId: 42 },
      },
    ]);
  } finally {
    logger.info = originalInfo;
  }
});

test('trySendTelegramRichMessage returns null when the runtime has no rich-message method', async () => {
  const result = await trySendTelegramRichMessage({
    api: {} as never,
    chatId: 55,
    html: '<p>Hello</p>',
  });

  assert.equal(result, null);
});

test('trySendTelegramRichMessage falls back for Telegram validation and unsupported-method errors', async () => {
  const warnLogs: Array<{ message: string; metadata: unknown }> = [];
  const originalWarn = logger.warn;
  logger.warn = (message: string, metadata?: unknown) => {
    warnLogs.push({ message, metadata });
  };

  try {
    for (const errorCode of [400, 404]) {
      const api = {
        raw: {
          sendRichMessage: async () => {
            throw { error_code: errorCode };
          },
        },
      };

      const result = await trySendTelegramRichMessage({
        api: api as never,
        chatId: 55,
        html: '<p>Hello</p>',
      });

      assert.equal(result, null);
    }

    assert.equal(warnLogs.length, 2);
    assert.ok(
      warnLogs.every(
        (entry) =>
          entry.message ===
          '[TELEGRAM_RICH_MESSAGE] Rich-message delivery was rejected; standard fallback is required.',
      ),
    );
    assert.deepEqual(
      warnLogs.map((entry) => (entry.metadata as { errorCode: number }).errorCode),
      [400, 404],
    );
  } finally {
    logger.warn = originalWarn;
  }
});

test('trySendTelegramRichMessage rethrows delivery errors that legacy sendMessage cannot fix', async () => {
  const error = { error_code: 403 };
  const api = {
    raw: {
      sendRichMessage: async () => {
        throw error;
      },
    },
  };

  await assert.rejects(
    trySendTelegramRichMessage({
      api: api as never,
      chatId: 55,
      html: '<p>Hello</p>',
    }),
    (received) => received === error,
  );
  assert.equal(isRichMessageFallbackError(error), false);
});
