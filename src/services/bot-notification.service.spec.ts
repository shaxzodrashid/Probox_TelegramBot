import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { BotNotificationService } from './bot-notification.service';
import { MessageTemplateService, type MessageTemplate } from './message-template.service';
import { UserService, type User } from './user.service';
import { RETIRED_COUPON_TEMPLATE_TYPES } from './coupon/coupon-retirement';
import { redisService } from '../redis/redis.service';
import db from '../database/database';
redisService.getClient().disconnect();
after(async () => {
  await db.destroy();
});
const user = { id: 1, telegram_id: 123, language_code: 'uz' } as User;
const template = {
  id: 1,
  template_type: 'payment_reminder_d1',
  content_uz: 'Salom, {{customer_name}}!',
  content_ru: 'Здравствуйте, {{customer_name}}!',
} as MessageTemplate;
const internals = BotNotificationService as unknown as {
  getBot: () => Promise<unknown>;
  writeDispatchLog: () => Promise<number>;
};

test('all retired templates and recovery sends are suppressed without template, log or Telegram access', async (t) => {
  t.mock.method(MessageTemplateService, 'getActiveTemplateByType', () => {
    throw new Error('must not load templates');
  });
  t.mock.method(internals, 'getBot', () => {
    throw new Error('must not send');
  });
  t.mock.method(internals, 'writeDispatchLog', () => {
    throw new Error('must not write');
  });
  for (const type of RETIRED_COUPON_TEMPLATE_TYPES) {
    const result = await BotNotificationService.sendTemplateMessage({
      user,
      templateType: type,
      placeholders: {},
      dispatchType: type,
    });
    assert.deepEqual(result, { delivered: false, error: 'COUPON_PROGRAM_RETIRED' });
    assert.equal(
      (
        await BotNotificationService.sendRenderedMessage({
          user,
          template: { ...template, template_type: type },
          placeholders: {},
          dispatchType: type,
        })
      ).error,
      'COUPON_PROGRAM_RETIRED',
    );
  }
  assert.equal(
    (
      await BotNotificationService.sendTemplateMessage({
        user,
        templateType: 'payment_reminder_d1',
        couponId: 99,
        placeholders: {},
        dispatchType: 'legacy',
      })
    ).delivered,
    false,
  );
  assert.equal(
    (
      await BotNotificationService.sendDirectMessage({
        user,
        text: 'Old coupon',
        dispatchType: 'payment_on_time_recovery',
      })
    ).delivered,
    false,
  );
});

test('ordinary payment templates still render and deliver', async (t) => {
  const sent: string[] = [];
  t.mock.method(MessageTemplateService, 'getActiveTemplateByType', async () => template);
  t.mock.method(internals, 'getBot', async () => ({
    api: {
      sendMessage: async (_id: number, text: string) => {
        sent.push(text);
      },
    },
  }));
  t.mock.method(internals, 'writeDispatchLog', async () => 1);
  t.mock.method(UserService, 'unblockUserIfBlocked', async () => undefined);
  const result = await BotNotificationService.sendTemplateMessage({
    user,
    templateType: 'payment_reminder_d1',
    placeholders: { customer_name: 'Ali' },
    dispatchType: 'payment_reminder_d1',
  });
  assert.equal(result.delivered, true);
  assert.deepEqual(sent, ['Salom, Ali!']);
});
