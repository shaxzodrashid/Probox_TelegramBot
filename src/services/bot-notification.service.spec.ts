import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BotNotificationService } from './bot-notification.service';
import { UserService } from './user.service';

test('BotNotificationService sends a prize photo when the template includes prize_name', async () => {
  const serviceInternals = BotNotificationService as unknown as Record<string, unknown>;
  const userServiceInternals = UserService as unknown as Record<string, unknown>;
  const originalGetBot = serviceInternals.getBot as (() => Promise<unknown>) | undefined;
  const originalWriteDispatchLog = serviceInternals.writeDispatchLog as ((params: unknown) => Promise<number | undefined>) | undefined;
  const originalUnblockUserIfBlocked = userServiceInternals.unblockUserIfBlocked as ((telegramId: number) => Promise<void>) | undefined;

  let sentPhotoCaption: string | undefined;
  let sentMessage = false;

  serviceInternals.getBot = async () => ({
    api: {
      sendPhoto: async (_chatId: number, _photo: unknown, options?: { caption?: string }) => {
        sentPhotoCaption = options?.caption;
      },
      sendMessage: async () => {
        sentMessage = true;
      },
    },
  });
  serviceInternals.writeDispatchLog = async () => 101;
  userServiceInternals.unblockUserIfBlocked = async () => undefined;

  try {
    const result = await BotNotificationService.sendRenderedMessage({
      user: {
        id: 1,
        telegram_id: 123456,
        phone_number: '+998901234567',
        language_code: 'uz',
        is_admin: false,
        is_blocked: false,
        is_logged_out: false,
        created_at: new Date(),
        updated_at: new Date(),
      },
      template: {
        id: 10,
        template_key: 'winner_notification',
        template_type: 'winner_notification',
        title: 'Winner',
        content_uz: 'Tabriklaymiz, sizga {{prize_name}} berildi!',
        content_ru: 'Поздравляем, вам достался {{prize_name}}!',
        channel: 'telegram_bot',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      placeholders: {
        prize_name: 'Velosiped',
      },
      dispatchType: 'winner_notification',
      photo: {
        buffer: Buffer.from('photo'),
        fileName: 'prize.jpg',
      },
    });

    assert.equal(result.delivered, true);
    assert.equal(sentPhotoCaption, 'Tabriklaymiz, sizga Velosiped berildi!');
    assert.equal(sentMessage, false);
  } finally {
    serviceInternals.getBot = originalGetBot;
    serviceInternals.writeDispatchLog = originalWriteDispatchLog;
    userServiceInternals.unblockUserIfBlocked = originalUnblockUserIfBlocked;
  }
});

test('BotNotificationService keeps plain text delivery when the template does not include prize_name', async () => {
  const serviceInternals = BotNotificationService as unknown as Record<string, unknown>;
  const userServiceInternals = UserService as unknown as Record<string, unknown>;
  const originalGetBot = serviceInternals.getBot as (() => Promise<unknown>) | undefined;
  const originalWriteDispatchLog = serviceInternals.writeDispatchLog as ((params: unknown) => Promise<number | undefined>) | undefined;
  const originalUnblockUserIfBlocked = userServiceInternals.unblockUserIfBlocked as ((telegramId: number) => Promise<void>) | undefined;

  let sentPhoto = false;
  let sentMessageText: string | undefined;

  serviceInternals.getBot = async () => ({
    api: {
      sendPhoto: async () => {
        sentPhoto = true;
      },
      sendMessage: async (_chatId: number, text: string) => {
        sentMessageText = text;
      },
    },
  });
  serviceInternals.writeDispatchLog = async () => 102;
  userServiceInternals.unblockUserIfBlocked = async () => undefined;

  try {
    const result = await BotNotificationService.sendRenderedMessage({
      user: {
        id: 2,
        telegram_id: 999999,
        phone_number: '+998909999999',
        language_code: 'uz',
        is_admin: false,
        is_blocked: false,
        is_logged_out: false,
        created_at: new Date(),
        updated_at: new Date(),
      },
      template: {
        id: 11,
        template_key: 'purchase',
        template_type: 'purchase',
        title: 'Purchase',
        content_uz: 'Xaridingiz uchun rahmat!',
        content_ru: 'Спасибо за покупку!',
        channel: 'telegram_bot',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      placeholders: {
        prize_name: 'Velosiped',
      },
      dispatchType: 'purchase',
      photo: {
        buffer: Buffer.from('photo'),
        fileName: 'prize.jpg',
      },
    });

    assert.equal(result.delivered, true);
    assert.equal(sentPhoto, false);
    assert.equal(sentMessageText, 'Xaridingiz uchun rahmat!');
  } finally {
    serviceInternals.getBot = originalGetBot;
    serviceInternals.writeDispatchLog = originalWriteDispatchLog;
    userServiceInternals.unblockUserIfBlocked = originalUnblockUserIfBlocked;
  }
});
