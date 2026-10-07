import assert from 'node:assert/strict';
import test from 'node:test';
import { loggerMiddleware } from './logger.middleware';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { BotContext } from '../types/context';

test('verbose logging suppresses auth links, contacts and pending auth text while retaining ordinary updates', async (t) => {
  const originalLevel = config.LOG_LEVEL;
  config.LOG_LEVEL = 'extra-high';
  const logged: unknown[] = [];
  t.mock.method(logger, 'debug', (_text: string, update: unknown) => {
    logged.push(update);
  });
  t.mock.method(logger, 'info', () => {});
  let handled = 0;
  try {
    for (const [message, session] of [
      [{ text: '/start auth_3f6c0a3b9d2e4f718a5b6c7d8e9f0a1b' }, {}],
      [{ contact: { phone_number: '+998901234567' } }, {}],
      [{ text: '+998901234567' }, { telegramAuth: { status: 'pending' } }],
      [{ text: 'ordinary' }, {}],
    ]) {
      const ctx = {
        chat: { type: 'private' },
        message,
        session,
        update: { update_id: 1, message },
      } as unknown as BotContext;
      await loggerMiddleware(ctx, async () => {
        handled++;
      });
    }
  } finally {
    config.LOG_LEVEL = originalLevel;
  }
  assert.equal(handled, 4);
  assert.deepEqual(logged, [{ update_id: 1, message: { text: 'ordinary' } }]);
});
