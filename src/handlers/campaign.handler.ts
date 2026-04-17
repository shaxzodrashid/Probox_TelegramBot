import { BotContext } from '../types/context';
import { InputFile } from 'grammy';
import { getMainKeyboardByLocale } from '../keyboards';
import { getPromotionsKeyboard, getPromotionDetailKeyboard, getCouponsKeyboard } from '../keyboards/campaign.keyboards';
import { CouponService } from '../services/coupon/coupon.service';
import { PromotionService } from '../services/coupon/promotion.service';
import { UserService } from '../services/user.service';
import { minioService } from '../services/minio.service';
import { formatDateForLocale } from '../utils/time/tashkent-time.util';
import { buildPromotionText } from '../utils/formatting/promotion-text.util';
import { logger } from '../utils/logger';
import { escapeHtml } from '../utils/telegram/telegram-rich-text.util';

const resolveLocale = async (ctx: BotContext): Promise<string> => (await ctx.i18n.getLocale()) || 'uz';

const clearPromotionSession = (ctx: BotContext) => {
  ctx.session.promotions = undefined;
};

const sendPromotionContent = async (
  ctx: BotContext,
  text: string,
  keyboard: ReturnType<typeof getPromotionDetailKeyboard>,
  promotion: Awaited<ReturnType<typeof PromotionService.getPromotionById>>,
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

export const promotionsHandler = async (ctx: BotContext) => {
  const locale = await resolveLocale(ctx);
  const promotions = await PromotionService.getActivePromotions();

  if (promotions.length === 0) {
    clearPromotionSession(ctx);
    await ctx.reply(ctx.t('campaign_no_promotions'));
    return;
  }

  ctx.session.promotions = promotions.map((promotion) => ({
    id: promotion.id,
    title: locale === 'ru' ? promotion.title_ru : promotion.title_uz,
  }));

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    await ctx.deleteMessage().catch(() => undefined);
    await ctx.reply(ctx.t('campaign_promotions_header'), {
      reply_markup: getPromotionsKeyboard(promotions, locale),
    });
    return;
  }

  await ctx.reply(ctx.t('campaign_promotions_header'), {
    reply_markup: getPromotionsKeyboard(promotions, locale),
  });
};

export const promotionDetailHandler = async (ctx: BotContext) => {
  const locale = await resolveLocale(ctx);
  const promotionId = Number(ctx.callbackQuery?.data?.split(':')[1]);
  const promotion = await PromotionService.getPromotionById(promotionId);

  await ctx.answerCallbackQuery().catch(() => undefined);

  if (!promotion) {
    await ctx.reply(ctx.t('campaign_promotion_not_found'));
    return;
  }

  const title = locale === 'ru' ? promotion.title_ru : promotion.title_uz;
  const about = locale === 'ru' ? promotion.about_ru : promotion.about_uz;
  const text = buildPromotionText(title, about);

  const keyboard = getPromotionDetailKeyboard(locale);

  if (ctx.callbackQuery) {
    await ctx.deleteMessage().catch(() => undefined);
    await sendPromotionContent(ctx, text, keyboard, promotion);
  } else {
    await sendPromotionContent(ctx, text, keyboard, promotion);
  }
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

  const promotion = await PromotionService.getPromotionById(selectedPromotion.id);
  if (!promotion) {
    await ctx.reply(ctx.t('campaign_promotion_not_found'));
    return;
  }

  const title = locale === 'ru' ? promotion.title_ru : promotion.title_uz;
  const about = locale === 'ru' ? promotion.about_ru : promotion.about_uz;
  const text = buildPromotionText(title, about);

  await sendPromotionContent(ctx, text, getPromotionDetailKeyboard(locale), promotion);
};

export const couponsHandler = async (ctx: BotContext) => {
  const locale = await resolveLocale(ctx);
  const telegramId = ctx.from?.id;

  clearPromotionSession(ctx);

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
  await ctx.answerCallbackQuery().catch(() => undefined);
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
