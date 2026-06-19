import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { GrammyError } from 'grammy';
import type { Api, RawApi } from 'grammy';

process.env.BOT_TOKEN ||= 'test-token';
const loadModule = createRequire(__filename);

test('ErrorNotificationService formats blocked-user bot errors as a calm Uzbek delivery notice', async () => {
  const { ErrorNotificationService } = loadModule(
    './error-notification.service',
  ) as typeof import('./error-notification.service');
  const serviceInternals = ErrorNotificationService as unknown as {
    buildMessage(params: {
      error: unknown;
      context: {
        scope: string;
        severity?: 'warning' | 'error' | 'critical';
        title?: string;
        includeStack?: boolean;
        updateId?: number;
        chatId?: number;
        chatType?: string;
        actor?: {
          telegramId?: number;
          username?: string | null;
          firstName?: string;
          lastName?: string | null;
          languageCode?: string;
        };
        metadata?: Record<string, string>;
      };
    }): string;
  };

  const message = serviceInternals.buildMessage({
    error: new GrammyError(
      'Forbidden',
      {
        ok: false,
        error_code: 403,
        description: 'Forbidden: bot was blocked by the user',
      },
      'sendMessage',
      {},
    ),
    context: {
      scope: 'telegram_update',
      severity: 'error',
      title: 'Telegram bot handler error',
      updateId: 70327908,
      chatId: 8372569413,
      chatType: 'private',
      actor: {
        telegramId: 8372569413,
        username: null,
        firstName: 'Samandar',
        lastName: null,
        languageCode: 'uz',
      },
      metadata: {
        updateType: 'my_chat_member',
      },
    },
  });

  assert.match(message, /Telegram xabari yuborilmadi/);
  assert.match(message, /Adminlardan hech qanday harakat talab qilinmaydi/);
  assert.match(message, /Foydalanuvchi botni bloklagan/);
  assert.match(message, /Samandar/);
  assert.doesNotMatch(message, /Severity/);
  assert.doesNotMatch(message, /Stack/);
  assert.doesNotMatch(message, /GrammyError/);
  assert.doesNotMatch(message, /sendMessage' failed/);
});

test('ErrorNotificationService can omit stacks for compact admin alerts', async () => {
  const { ErrorNotificationService } = loadModule(
    './error-notification.service',
  ) as typeof import('./error-notification.service');
  const serviceInternals = ErrorNotificationService as unknown as {
    buildMessage(params: {
      error: unknown;
      context: {
        scope: string;
        severity?: 'warning' | 'error' | 'critical';
        title?: string;
        includeStack?: boolean;
      };
    }): string;
  };

  const error = new Error('Request failed with status code 503');
  error.stack = 'Error: Request failed with status code 503\n    at noisyInternalFrame';

  const message = serviceInternals.buildMessage({
    error,
    context: {
      scope: 'support_ai_agent',
      severity: 'critical',
      title: 'AI support agent failed',
      includeStack: false,
    },
  });

  assert.match(message, /AI support agent failed/);
  assert.match(message, /Request failed with status code 503/);
  assert.doesNotMatch(message, /Stack/);
  assert.doesNotMatch(message, /noisyInternalFrame/);
});

test('ErrorNotificationService adds the customer-details button to blocked-user alerts', async () => {
  const { ErrorNotificationService } = loadModule(
    './error-notification.service',
  ) as typeof import('./error-notification.service');
  const { config } = loadModule('../config') as typeof import('../config');
  const originalNotificationChatId = config.ERROR_NOTIFICATION_CHAT_ID;
  let sentOptions: {
    reply_markup?: {
      inline_keyboard: Array<Array<{ text: string; callback_data?: string }>>;
    };
  } | null = null;

  config.ERROR_NOTIFICATION_CHAT_ID = '-1001234567890';

  const api = {
    sendMessage: async (_chatId: string, _text: string, options: typeof sentOptions) => {
      sentOptions = options;
      return {};
    },
  } as unknown as Api<RawApi>;

  try {
    await ErrorNotificationService.notify({
      api,
      error: new GrammyError(
        'Forbidden',
        {
          ok: false,
          error_code: 403,
          description: 'Forbidden: bot was blocked by the user',
        },
        'sendMessage',
        {},
      ),
      context: {
        scope: 'telegram_update',
        chatId: 8078830248,
        chatType: 'private',
        actor: {
          telegramId: 8078830248,
          firstName: 'Diyorbek',
        },
      },
    });
  } finally {
    config.ERROR_NOTIFICATION_CHAT_ID = originalNotificationChatId;
  }

  assert.ok(sentOptions);
  const detailsButton = (
    sentOptions as {
      reply_markup?: {
        inline_keyboard: Array<Array<{ text: string; callback_data?: string }>>;
      };
    }
  ).reply_markup?.inline_keyboard[0][0];

  assert.deepEqual(detailsButton, {
    text: "👤 Mijoz ma'lumotlari",
    callback_data: 'blocked_user_details:8078830248',
  });
});
