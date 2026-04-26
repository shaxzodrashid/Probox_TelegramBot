import test from 'node:test';
import assert from 'node:assert/strict';
import { GrammyError } from 'grammy';
import {
  couponsHandler,
  promotionDetailHandler,
  promotionsHandler,
} from './campaign.handler';
import { Promotion, PromotionService } from '../services/coupon/promotion.service';
import { minioService } from '../services/minio.service';
import { UserService } from '../services/user.service';

const basePromotion = (overrides: Partial<Promotion> = {}): Promotion => ({
  id: 1,
  slug: 'barakali-hafta',
  title_uz: 'Barakali Hafta',
  title_ru: 'Барокали Хафта',
  about_uz: 'Chegirmalar sizni kutmoqda',
  about_ru: 'Скидки уже ждут вас',
  cover_image_object_key: null,
  cover_image_mime_type: null,
  cover_image_file_name: null,
  is_active: true,
  assign_coupons: false,
  starts_at: null,
  ends_at: null,
  deleted_at: null,
  created_at: new Date('2026-04-01T00:00:00.000Z'),
  updated_at: new Date('2026-04-01T00:00:00.000Z'),
  ...overrides,
});

const translations: Record<string, string> = {
  campaign_promotions_header: '🎯 Aktiv aksiyalar ro‘yxati',
  campaign_promotion_not_found: 'Aksiya topilmadi.',
  menu_coupons: '🎟 Kuponlar',
  back: '🔙 Orqaga',
  admin_campaign_promotions_back: '🔙 Ro‘yxatga qaytish',
  campaign_login_required: "Kuponlarni ko'rish uchun avval akkauntga kiring.",
  registration_button: "📝 Ro'yxatdan o'tish",
};

const getInlineButtons = (keyboard: { inline_keyboard?: Array<Array<{ text?: string; callback_data?: string }>> }) =>
  keyboard.inline_keyboard?.flat() || [];

const createContext = (options: {
  callbackData?: string;
  onEditMessageText?: (text: string, other?: Record<string, unknown>) => Promise<void> | void;
  onEditMessageMedia?: (media: Record<string, unknown>, other?: Record<string, unknown>) => Promise<void> | void;
} = {}) => {
  const calls = {
    replies: [] as Array<{ text: string; other?: Record<string, unknown> }>,
    replyPhotos: [] as Array<{ photo: unknown; other?: Record<string, unknown> }>,
    editsText: [] as Array<{ text: string; other?: Record<string, unknown> }>,
    editsMedia: [] as Array<{ media: Record<string, unknown>; other?: Record<string, unknown> }>,
    answerCallbackQuery: 0,
    deleteMessage: 0,
  };

  const ctx = {
    session: {} as { promotions?: Array<{ id: number; title: string }> },
    from: { id: 99 },
    chat: { id: 99, type: 'private' },
    callbackQuery: options.callbackData ? { data: options.callbackData } : undefined,
    i18n: {
      getLocale: async () => 'uz',
    },
    t: (key: string) => translations[key] || key,
    reply: async (text: string, other?: Record<string, unknown>) => {
      calls.replies.push({ text, other });
      return { message_id: 100 + calls.replies.length };
    },
    replyWithPhoto: async (photo: unknown, other?: Record<string, unknown>) => {
      calls.replyPhotos.push({ photo, other });
      return { message_id: 200 + calls.replyPhotos.length };
    },
    editMessageText: async (text: string, other?: Record<string, unknown>) => {
      calls.editsText.push({ text, other });
      await options.onEditMessageText?.(text, other);
    },
    editMessageMedia: async (media: Record<string, unknown>, other?: Record<string, unknown>) => {
      calls.editsMedia.push({ media, other });
      await options.onEditMessageMedia?.(media, other);
    },
    answerCallbackQuery: async () => {
      calls.answerCallbackQuery += 1;
    },
    deleteMessage: async () => {
      calls.deleteMessage += 1;
    },
  };

  return {
    ctx: ctx as any,
    calls,
  };
};

test('promotionsHandler sends the single active promotion card directly', async () => {
  const originalGetActivePromotions = PromotionService.getActivePromotions;

  try {
    PromotionService.getActivePromotions = (async () => [
      basePromotion(),
    ]) as typeof PromotionService.getActivePromotions;

    const { ctx, calls } = createContext();

    await promotionsHandler(ctx);

    assert.equal(calls.replies.length, 1);
    assert.equal(calls.replyPhotos.length, 0);
    assert.equal(calls.replies[0].text, '<b>Barakali Hafta</b>\n\nChegirmalar sizni kutmoqda');

    const buttons = getInlineButtons(
      calls.replies[0].other?.reply_markup as { inline_keyboard?: Array<Array<{ text?: string; callback_data?: string }>> },
    );

    assert.deepEqual(
      buttons.map((button) => button.callback_data),
      ['campaign_open_coupons', 'campaign_back_to_menu'],
    );
  } finally {
    PromotionService.getActivePromotions = originalGetActivePromotions;
  }
});

test('promotionsHandler sends a numbered inline selector when multiple promotions are active', async () => {
  const originalGetActivePromotions = PromotionService.getActivePromotions;

  try {
    PromotionService.getActivePromotions = (async () => [
      basePromotion({ id: 10, title_uz: 'Barakali Hafta' }),
      basePromotion({ id: 11, slug: 'mega-bonus', title_uz: 'Mega Bonus' }),
    ]) as typeof PromotionService.getActivePromotions;

    const { ctx, calls } = createContext();

    await promotionsHandler(ctx);

    assert.equal(calls.replies.length, 1);
    assert.match(calls.replies[0].text, /1\. Barakali Hafta/);
    assert.match(calls.replies[0].text, /2\. Mega Bonus/);

    const buttons = getInlineButtons(
      calls.replies[0].other?.reply_markup as { inline_keyboard?: Array<Array<{ text?: string; callback_data?: string }>> },
    );

    assert.deepEqual(
      buttons.map((button) => ({ text: button.text, callback_data: button.callback_data })),
      [
        { text: '1', callback_data: 'promotion_detail:10' },
        { text: '2', callback_data: 'promotion_detail:11' },
        { text: '🎟 Kuponlar', callback_data: 'campaign_open_coupons' },
        { text: '🔙 Orqaga', callback_data: 'campaign_back_to_menu' },
      ],
    );
  } finally {
    PromotionService.getActivePromotions = originalGetActivePromotions;
  }
});

test('promotionDetailHandler deletes the selector message and sends the card when media editing fails', async () => {
  const originalGetActivePromotions = PromotionService.getActivePromotions;
  const originalGetFileAsBuffer = minioService.getFileAsBuffer;

  try {
    PromotionService.getActivePromotions = (async () => [
      basePromotion({
        id: 21,
        cover_image_object_key: 'promotions/21/cover.jpg',
        cover_image_file_name: 'cover.jpg',
      }),
      basePromotion({
        id: 22,
        slug: 'bonus',
        title_uz: 'Super Bonus',
      }),
    ]) as typeof PromotionService.getActivePromotions;
    minioService.getFileAsBuffer = (async () => Buffer.from('fake-image')) as typeof minioService.getFileAsBuffer;

    const { ctx, calls } = createContext({
      callbackData: 'promotion_detail:21',
      onEditMessageMedia: async () => {
        throw new GrammyError(
          'Bad Request',
          {
            ok: false,
            error_code: 400,
            description: "message can't be edited",
          },
          'editMessageMedia',
          {},
        );
      },
    });

    await promotionDetailHandler(ctx);

    assert.equal(calls.answerCallbackQuery, 1);
    assert.equal(calls.editsMedia.length, 1);
    assert.equal(calls.deleteMessage, 1);
    assert.equal(calls.replyPhotos.length, 1);
    assert.equal(calls.replies.length, 0);

    const photoReply = calls.replyPhotos[0];
    assert.equal(photoReply.other?.caption, '<b>Barakali Hafta</b>\n\nChegirmalar sizni kutmoqda');

    const buttons = getInlineButtons(
      photoReply.other?.reply_markup as { inline_keyboard?: Array<Array<{ text?: string; callback_data?: string }>> },
    );

    assert.deepEqual(
      buttons.map((button) => button.callback_data),
      ['campaign_back_to_promotions', 'campaign_open_coupons', 'campaign_back_to_menu'],
    );
  } finally {
    PromotionService.getActivePromotions = originalGetActivePromotions;
    minioService.getFileAsBuffer = originalGetFileAsBuffer;
  }
});

test('couponsHandler shows registration starter when user is not logged in', async () => {
  const originalGetUserByTelegramId = UserService.getUserByTelegramId;

  try {
    UserService.getUserByTelegramId = (async () => null) as typeof UserService.getUserByTelegramId;

    const { ctx, calls } = createContext();
    ctx.session.promotions = [{ id: 1, title: 'Barakali Hafta' }];

    await couponsHandler(ctx);

    assert.equal(ctx.session.promotions, undefined);
    assert.equal(calls.replies.length, 1);
    assert.equal(calls.replies[0].text, "Kuponlarni ko'rish uchun avval akkauntga kiring.");

    const buttons = getInlineButtons(
      calls.replies[0].other?.reply_markup as { inline_keyboard?: Array<Array<{ text?: string; callback_data?: string }>> },
    );

    assert.deepEqual(
      buttons.map((button) => ({ text: button.text, callback_data: button.callback_data })),
      [
        { text: "📝 Ro'yxatdan o'tish", callback_data: 'start_registration' },
      ],
    );
  } finally {
    UserService.getUserByTelegramId = originalGetUserByTelegramId;
  }
});
