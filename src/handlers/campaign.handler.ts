import { BotContext } from '../types/context';
import { GrammyError, InputFile } from 'grammy';
import { getMainKeyboardByLocale } from '../keyboards';
import { getPromotionsKeyboard, getPromotionDetailKeyboard, getCouponsKeyboard } from '../keyboards/campaign.keyboards';
import { CouponService } from '../services/coupon/coupon.service';
import { Promotion, PromotionService } from '../services/coupon/promotion.service';
import { UserService } from '../services/user.service';
import { minioService } from '../services/minio.service';
import { formatDateForLocale } from '../utils/time/tashkent-time.util';
import { buildPromotionText } from '../utils/formatting/promotion-text.util';
import { logger } from '../utils/logger';
import { escapeHtml } from '../utils/telegram/telegram-rich-text.util';
import {
  isCallbackQueryExpiredError,
  isMessageNotModifiedError,
  isMessageToDeleteNotFoundError,
} from '../utils/telegram/telegram-errors';

const resolveLocale = async (ctx: BotContext): Promise<string> => (await ctx.i18n.getLocale()) || 'uz';

const clearPromotionSession = (ctx: BotContext) => {
  ctx.session.promotions = undefined;
};

const syncPromotionSession = (ctx: BotContext, promotions: Promotion[], locale: string) => {
  ctx.session.promotions = promotions.map((promotion) => ({
    id: promotion.id,
    title: locale === 'ru' ? promotion.title_ru : promotion.title_uz,
  }));
};

const getPromotionTitle = (promotion: Promotion, locale: string): string =>
  locale === 'ru' ? promotion.title_ru : promotion.title_uz;

const getPromotionAbout = (promotion: Promotion, locale: string): string =>
  locale === 'ru' ? promotion.about_ru : promotion.about_uz;

const buildPromotionCardText = (promotion: Promotion, locale: string): string =>
  buildPromotionText(getPromotionTitle(promotion, locale), getPromotionAbout(promotion, locale));

const buildPromotionsListText = (promotions: Promotion[], locale: string, header: string): string => {
  const lines = promotions.map((promotion, index) => `${index + 1}. ${escapeHtml(getPromotionTitle(promotion, locale))}`);
  return `<b>${escapeHtml(header)}</b>\n\n${lines.join('\n')}`;
};

const canFallbackToDeleteAndSend = (error: unknown): boolean => {
  if (isMessageNotModifiedError(error) || isMessageToDeleteNotFoundError(error)) {
    return true;
  }

  return error instanceof GrammyError && error.error_code === 400;
};

const answerPromotionCallback = async (ctx: BotContext) => {
  if (!ctx.callbackQuery) {
    return;
  }

  await ctx.answerCallbackQuery().catch((error) => {
    if (!isCallbackQueryExpiredError(error)) {
      throw error;
    }
  });
};

const deleteCurrentPromotionMessage = async (ctx: BotContext) => {
  if (!ctx.callbackQuery) {
    return;
  }

  await ctx.deleteMessage().catch((error) => {
    if (!isMessageToDeleteNotFoundError(error)) {
      throw error;
    }
  });
};

const sendPromotionContent = async (
  ctx: BotContext,
  text: string,
  keyboard: ReturnType<typeof getPromotionDetailKeyboard>,
  promotion: Promotion,
) => {
  if (promotion?.cover_image_object_key) {
    try {
      const buffer = await minioService.getFileAsBuffer(promotion.cover_image_object_key);
      await ctx.replyWithPhoto(
        new InputFile(buffer, promotion.cover_image_file_name || `promotion-${promotion.id}.jpg`),
        {
          caption: text,
          parse_mode: 'HTML',
          reply_markup: keyboard,
        },
      );
      return;
    } catch (imageError) {
      logger.warn('Promotion detail photo caption fallback triggered.', imageError);

      try {
        const buffer = await minioService.getFileAsBuffer(promotion.cover_image_object_key);
        await ctx.replyWithPhoto(
          new InputFile(buffer, promotion.cover_image_file_name || `promotion-${promotion.id}.jpg`),
          {},
        );
        await ctx.reply(text, {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        });
        return;
      } catch (fallbackError) {
        logger.error('Failed to load promotion image for detail view:', fallbackError);
      }
    }
  }

  await ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
};

const editPromotionContent = async (
  ctx: BotContext,
  text: string,
  keyboard: ReturnType<typeof getPromotionDetailKeyboard>,
  promotion: Promotion,
): Promise<boolean> => {
  if (!ctx.callbackQuery) {
    return false;
  }

  try {
    if (promotion.cover_image_object_key) {
      const buffer = await minioService.getFileAsBuffer(promotion.cover_image_object_key);
      await ctx.editMessageMedia(
        {
          type: 'photo',
          media: new InputFile(buffer, promotion.cover_image_file_name || `promotion-${promotion.id}.jpg`),
          caption: text,
        },
        {
          reply_markup: keyboard,
        },
      );
      return true;
    }

    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
    return true;
  } catch (error) {
    if (isMessageNotModifiedError(error)) {
      return true;
    }

    if (!canFallbackToDeleteAndSend(error)) {
      throw error;
    }

    logger.warn('Promotion detail edit failed; retrying by deleting the selector message.', error);
    return false;
  }
};

const renderPromotionContent = async (
  ctx: BotContext,
  promotion: Promotion,
  locale: string,
  options: {
    showBackToPromotions: boolean;
    showCoupons: boolean;
    preferEdit?: boolean;
  },
) => {
  const text = buildPromotionCardText(promotion, locale);
  const keyboard = getPromotionDetailKeyboard(locale, {
    showBackToPromotions: options.showBackToPromotions,
    showCoupons: options.showCoupons,
  });

  if (options.preferEdit && ctx.callbackQuery) {
    const edited = await editPromotionContent(ctx, text, keyboard, promotion);
    if (edited) {
      return;
    }

    await deleteCurrentPromotionMessage(ctx);
  }

  await sendPromotionContent(ctx, text, keyboard, promotion);
};

const renderPromotionsList = async (ctx: BotContext, promotions: Promotion[], locale: string) => {
  const text = buildPromotionsListText(promotions, locale, ctx.t('campaign_promotions_header'));
  const keyboard = getPromotionsKeyboard(promotions, locale);

  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
      return;
    } catch (error) {
      if (isMessageNotModifiedError(error)) {
        return;
      }

      if (!canFallbackToDeleteAndSend(error)) {
        throw error;
      }

      logger.warn('Promotions list edit failed; retrying as a new message.', error);
      await deleteCurrentPromotionMessage(ctx);
    }
  }

  await ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
};

export const promotionsHandler = async (ctx: BotContext) => {
  const locale = await resolveLocale(ctx);
  const promotions = await PromotionService.getActivePromotions();

  await answerPromotionCallback(ctx);

  if (promotions.length === 0) {
    clearPromotionSession(ctx);
    await ctx.reply(ctx.t('campaign_no_promotions'));
    return;
  }

  syncPromotionSession(ctx, promotions, locale);

  if (promotions.length === 1) {
    await renderPromotionContent(ctx, promotions[0], locale, {
      showBackToPromotions: false,
      showCoupons: true,
      preferEdit: Boolean(ctx.callbackQuery),
    });
    return;
  }

  await renderPromotionsList(ctx, promotions, locale);
};

export const promotionDetailHandler = async (ctx: BotContext) => {
  const locale = await resolveLocale(ctx);
  const promotionId = Number(ctx.callbackQuery?.data?.split(':')[1]);
  const promotions = await PromotionService.getActivePromotions();
  const promotion = promotions.find((item) => item.id === promotionId) || null;

  await answerPromotionCallback(ctx);

  if (!promotion) {
    await ctx.reply(ctx.t('campaign_promotion_not_found'));
    return;
  }

  syncPromotionSession(ctx, promotions, locale);

  await renderPromotionContent(ctx, promotion, locale, {
    showBackToPromotions: promotions.length > 1,
    showCoupons: true,
    preferEdit: Boolean(ctx.callbackQuery),
  });
};

export const promotionSelectionHandler = async (ctx: BotContext) => {
  const locale = await resolveLocale(ctx);
  const selectedTitle = ctx.message?.text?.trim();

  if (!selectedTitle || !ctx.session.promotions?.length) {
    return;
  }

  const selectedPromotion = ctx.session.promotions.find((promotion) => promotion.title === selectedTitle);
  if (!selectedPromotion) {
    return;
  }

  const promotions = await PromotionService.getActivePromotions();
  const promotion = promotions.find((item) => item.id === selectedPromotion.id) || null;
  if (!promotion) {
    await ctx.reply(ctx.t('campaign_promotion_not_found'));
    return;
  }

  syncPromotionSession(ctx, promotions, locale);

  await renderPromotionContent(ctx, promotion, locale, {
    showBackToPromotions: promotions.length > 1,
    showCoupons: true,
  });
};

export const couponsHandler = async (ctx: BotContext) => {
  const locale = await resolveLocale(ctx);
  const telegramId = ctx.from?.id;

  clearPromotionSession(ctx);
  await answerPromotionCallback(ctx);

  if (!telegramId) {
    return;
  }

  const user = await UserService.getUserByTelegramId(telegramId);
  if (!user || user.is_logged_out) {
    await ctx.reply(ctx.t('campaign_login_required'));
    return;
  }

  const coupons = await CouponService.getActiveCouponsByTelegramId(telegramId);
  if (coupons.length === 0) {
    await ctx.reply(ctx.t('campaign_no_coupons'));
    return;
  }

  let text = `<b>${escapeHtml(ctx.t('campaign_coupons_header', { count: coupons.length.toString() }))}</b>\n\n`;
  coupons.forEach((coupon, index) => {
    const promotion = locale === 'ru' ? coupon.promotion_title_ru : coupon.promotion_title_uz;
    text += `${index + 1}. <code>${escapeHtml(coupon.code)}</code>\n`;
    text += `${escapeHtml(ctx.t('campaign_coupon_expires', {
      date: formatDateForLocale(coupon.expires_at, locale),
    }))}\n`;
    if (promotion) {
      text += `${escapeHtml(ctx.t('campaign_coupon_promotion', { title: promotion }))}\n`;
    }
    text += '\n';
  });

  await ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: getCouponsKeyboard(locale),
  });

  if (ctx.callbackQuery) {
    await ctx.deleteMessage().catch(() => undefined);
  }
};

export const campaignBackToPromotionsHandler = async (ctx: BotContext) => {
  return promotionsHandler(ctx);
};

export const campaignBackToMenuHandler = async (ctx: BotContext) => {
  const locale = await resolveLocale(ctx);
  const telegramId = ctx.from?.id;
  const user = telegramId ? await UserService.getUserByTelegramId(telegramId) : null;
  const isLoggedIn = Boolean(user && !user.is_logged_out);
  const isAdmin = Boolean(user?.is_admin);

  clearPromotionSession(ctx);
  await ctx.answerCallbackQuery().catch(() => undefined);
  if (ctx.callbackQuery) {
    await ctx.deleteMessage().catch(() => undefined);
  }
  await ctx.reply(ctx.t('welcome_message'), {
    reply_markup: getMainKeyboardByLocale(locale, isAdmin, isLoggedIn),
  });
};
