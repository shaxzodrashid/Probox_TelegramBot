import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { GrammyError } from 'grammy';

process.env.BOT_TOKEN ||= 'test-token';
const loadModule = createRequire(__filename);

test('ErrorNotificationService formats blocked-user bot errors as a calm Uzbek delivery notice', async () => {
  const { ErrorNotificationService } = loadModule('./error-notification.service') as typeof import('./error-notification.service');
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
  const { ErrorNotificationService } = loadModule('./error-notification.service') as typeof import('./error-notification.service');
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
