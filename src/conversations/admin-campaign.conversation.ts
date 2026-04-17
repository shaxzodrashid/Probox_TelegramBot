import { InlineKeyboard, InputFile, Keyboard } from 'grammy';
import { BotContext, BotConversation, PromotionPrizeEditableField } from '../types/context';
import {
  CreatePrizeInput,
  CreatePromotionInput,
  Promotion,
  PromotionImageInput,
  PromotionPrize,
  PromotionPrizeListItem,
  PromotionService,
  UpdatePrizeInput,
  UpdatePromotionInput,
} from '../services/coupon/promotion.service';
import { CouponService } from '../services/coupon/coupon.service';
import { getAdminMenuKeyboard } from '../keyboards/admin.keyboards';
import {
  getAdminPrizeDetailKeyboard,
  getAdminPrizesKeyboard,
  getAdminPromotionDetailKeyboard,
  getAdminPromotionsKeyboard,
  getAdminWinnerPrizeSelectionKeyboard,
  getCouponAdminKeyboard,
} from '../keyboards/campaign.keyboards';
import { i18n } from '../i18n';
import { formatDateForLocale, formatDateTimeForLocale } from '../utils/time/tashkent-time.util';
import { buildPromotionText, getPromotionCaptionLength } from '../utils/formatting/promotion-text.util';
import { telegramMessageToHtml } from '../utils/telegram/telegram-rich-text.util';
import { downloadTelegramFileByPath, getTelegramFilePath } from '../utils/telegram/telegram-file.util';
import { minioService } from '../services/minio.service';
import { logger } from '../utils/logger';

type PromotionDraft = CreatePromotionInput & {
  image?: PromotionImageInput | null;
};

type PrizeDraft = CreatePrizeInput & {
  image?: PromotionImageInput | null;
};

const PROMOTION_CONFIRM_SAVE_CALLBACK = 'promotion_confirm_save';
const PROMOTION_CONFIRM_CANCEL_CALLBACK = 'promotion_confirm_cancel';
const PROMOTION_LONG_CONTENT_KEEP_CALLBACK = 'promotion_long_content_keep';
const PROMOTION_LONG_CONTENT_EDIT_CALLBACK = 'promotion_long_content_edit';
const PROMOTION_LONG_CONTENT_CANCEL_CALLBACK = 'promotion_long_content_cancel';
const UZBEKISTAN_UTC_OFFSET = '+05:00';
const PROMOTIONS_PAGE_SIZE = 6;
const PRIZES_PAGE_SIZE = 6;
const TELEGRAM_CAPTION_LIMIT = 1024;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const getSkipKeyboard = (locale: string) =>
  new Keyboard()
    .text(i18n.t(locale, 'admin_campaign_skip'))
    .text(i18n.t(locale, 'admin_cancel'))
    .resized()
    .oneTime();

const getConfirmKeyboard = (locale: string) =>
  new InlineKeyboard()
    .text(i18n.t(locale, 'admin_confirm_yes'), PROMOTION_CONFIRM_SAVE_CALLBACK)
    .text(i18n.t(locale, 'admin_confirm_no'), PROMOTION_CONFIRM_CANCEL_CALLBACK);

const getLongContentDecisionKeyboard = (locale: string) =>
  new InlineKeyboard()
    .text(i18n.t(locale, 'admin_campaign_long_content_keep'), PROMOTION_LONG_CONTENT_KEEP_CALLBACK)
    .text(i18n.t(locale, 'admin_campaign_long_content_edit'), PROMOTION_LONG_CONTENT_EDIT_CALLBACK)
    .row()
    .text(i18n.t(locale, 'admin_cancel'), PROMOTION_LONG_CONTENT_CANCEL_CALLBACK);

const getLocaleChoiceKeyboard = (locale: string, options: Array<'uz' | 'ru'>) => {
  const keyboard = new Keyboard();

  if (options.includes('uz')) {
    keyboard.text(i18n.t(locale, 'admin_campaign_long_content_edit_uz'));
  }
  if (options.includes('ru')) {
    keyboard.text(i18n.t(locale, 'admin_campaign_long_content_edit_ru'));
  }

  return keyboard
    .row()
    .text(i18n.t(locale, 'admin_cancel'))
    .resized()
    .oneTime();
};

const getActiveChoiceKeyboard = (locale: string) =>
  new Keyboard()
    .text(i18n.t(locale, 'admin_yes'))
    .text(i18n.t(locale, 'admin_no'))
    .row()
    .text(i18n.t(locale, 'admin_cancel'))
    .resized()
    .oneTime();

const getCancelKeyboard = (locale: string) =>
  new Keyboard()
    .text(i18n.t(locale, 'admin_cancel'))
    .resized()
    .oneTime();

const buildPromotionSelectionKeyboard = (promotions: Promotion[], locale: string) => {
  const keyboard = new InlineKeyboard();

  promotions.forEach((promotion) => {
    keyboard.text(promotion.title_uz, `promotion_select:${promotion.id}`).row();
  });

  keyboard.text(i18n.t(locale, 'admin_cancel'), 'admin_cancel');

  return keyboard;
};

const isCancelText = (value: string, locale: string): boolean => value === i18n.t(locale, 'admin_cancel');
const isSkipText = (value: string, locale: string): boolean => value === i18n.t(locale, 'admin_campaign_skip');

const getPromotionTitleForLocale = (
  prize: Pick<PromotionPrizeListItem, 'promotion_title_uz' | 'promotion_title_ru'>,
  locale: string,
): string => {
  return (locale === 'ru' ? prize.promotion_title_ru : prize.promotion_title_uz)
    || prize.promotion_title_uz
    || prize.promotion_title_ru
    || '-';
};

const slugPattern = /^[a-z0-9][a-z0-9_-]{1,119}$/;

const parsePromotionDate = (value: string): Date | null => {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?$/);
  if (!match) {
    return null;
  }

  const [, year, month, day, hours = '00', minutes = '00'] = match;
  const date = new Date(`${year}-${month}-${day}T${hours}:${minutes}:00${UZBEKISTAN_UTC_OFFSET}`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
};

const getPromotionImageInput = async (promotion: Promotion): Promise<InputFile | null> => {
  if (!promotion.cover_image_object_key) {
    return null;
  }

  try {
    const buffer = await minioService.getFileAsBuffer(promotion.cover_image_object_key);
    return new InputFile(buffer, promotion.cover_image_file_name || `promotion-${promotion.id}.jpg`);
  } catch (error) {
    logger.error('Error loading promotion image from MinIO:', error);
    return null;
  }
};

const getPrizeImageInput = async (prize: PromotionPrizeListItem): Promise<InputFile | null> => {
  if (!prize.image_object_key) {
    return null;
  }

  try {
    const buffer = await minioService.getFileAsBuffer(prize.image_object_key);
    return new InputFile(buffer, prize.image_file_name || `prize-${prize.id}.jpg`);
  } catch (error) {
    logger.error('Error loading prize image from MinIO:', error);
    return null;
  }
};

const buildAdminPromotionsListText = (
  locale: string,
  total: number,
  page: number,
  totalPages: number,
): string => {
  return `${i18n.t(locale, 'admin_campaign_promotions')}\n\n${i18n.t(locale, 'admin_campaign_promotions_page', {
    total: total.toString(),
    current: page.toString(),
    pages: totalPages.toString(),
  })}`;
};

const buildAdminPromotionSummary = (promotion: Promotion, locale: string): string => {
  const currentTitle = locale === 'ru' ? promotion.title_ru : promotion.title_uz;
  const status = promotion.is_active
    ? i18n.t(locale, 'admin_campaign_status_active')
    : i18n.t(locale, 'admin_campaign_status_inactive');

  return [
    `<b>${i18n.t(locale, 'admin_campaign_promotion_detail_header')}</b>`,
    '',
    `<b>${escapeHtml(currentTitle)}</b>`,
    `${i18n.t(locale, 'admin_campaign_slug_label')}: <code>${escapeHtml(promotion.slug)}</code>`,
    `${i18n.t(locale, 'admin_campaign_status_label')}: ${escapeHtml(status)}`,
    `${i18n.t(locale, 'admin_campaign_starts_at_label')}: ${escapeHtml(formatDateTimeForLocale(promotion.starts_at, locale))}`,
    `${i18n.t(locale, 'admin_campaign_ends_at_label')}: ${escapeHtml(formatDateTimeForLocale(promotion.ends_at, locale))}`,
    `${i18n.t(locale, 'admin_campaign_assign_coupons_label')}: ${promotion.assign_coupons ? escapeHtml(i18n.t(locale, 'admin_yes')) : escapeHtml(i18n.t(locale, 'admin_no'))}`,
    `${i18n.t(locale, 'admin_campaign_image_label')}: ${promotion.cover_image_object_key ? escapeHtml(i18n.t(locale, 'admin_yes')) : escapeHtml(i18n.t(locale, 'admin_no'))}`,
    '',
    `${i18n.t(locale, 'admin_campaign_title_uz_label')}: ${escapeHtml(promotion.title_uz)}`,
    `${i18n.t(locale, 'admin_campaign_title_ru_label')}: ${escapeHtml(promotion.title_ru)}`,
  ].join('\n');
}

const getPromotionCaptionOverflows = (draft: CreatePromotionInput | Promotion): Array<{
  localeCode: 'uz' | 'ru';
  length: number;
}> => {
  const checks: Array<{ localeCode: 'uz' | 'ru'; title: string; body: string }> = [
    { localeCode: 'uz', title: draft.title_uz, body: draft.about_uz },
    { localeCode: 'ru', title: draft.title_ru, body: draft.about_ru },
  ];

  return checks
    .map(({ localeCode, title, body }) => ({
      localeCode,
      length: getPromotionCaptionLength(title, body),
    }))
    .filter(({ length }) => length > TELEGRAM_CAPTION_LIMIT);
};

const buildLongContentWarningText = (
  locale: string,
  overflows: Array<{ localeCode: 'uz' | 'ru'; length: number }>,
): string => {
  const lines = [
    `<b>${i18n.t(locale, 'admin_campaign_long_content_title')}</b>`,
    '',
    i18n.t(locale, 'admin_campaign_long_content_body', {
      limit: TELEGRAM_CAPTION_LIMIT.toString(),
    }),
    '',
  ];

  overflows.forEach(({ localeCode, length }) => {
    lines.push(i18n.t(locale, 'admin_campaign_long_content_item', {
      locale: localeCode.toUpperCase(),
      count: length.toString(),
    }));
  });

  lines.push('');
  lines.push(i18n.t(locale, 'admin_campaign_long_content_question'));

  return lines.join('\n');
};

const buildDraftSummary = (draft: CreatePromotionInput | Promotion, locale: string): string => {
  const status = draft.is_active
    ? i18n.t(locale, 'admin_campaign_status_active')
    : i18n.t(locale, 'admin_campaign_status_inactive');

  return [
    `<b>${i18n.t(locale, 'admin_campaign_preview_summary')}</b>`,
    '',
    `${i18n.t(locale, 'admin_campaign_slug_label')}: <code>${escapeHtml(draft.slug)}</code>`,
    `${i18n.t(locale, 'admin_campaign_status_label')}: ${escapeHtml(status)}`,
    `${i18n.t(locale, 'admin_campaign_starts_at_label')}: ${escapeHtml(formatDateTimeForLocale(draft.starts_at, locale))}`,
    `${i18n.t(locale, 'admin_campaign_ends_at_label')}: ${escapeHtml(formatDateTimeForLocale(draft.ends_at, locale))}`,
    `${i18n.t(locale, 'admin_campaign_assign_coupons_label')}: ${draft.assign_coupons ? escapeHtml(i18n.t(locale, 'admin_yes')) : escapeHtml(i18n.t(locale, 'admin_no'))}`,
    '',
    `${i18n.t(locale, 'admin_campaign_title_uz_label')}: ${escapeHtml(draft.title_uz)}`,
    `${i18n.t(locale, 'admin_campaign_title_ru_label')}: ${escapeHtml(draft.title_ru)}`,
  ].join('\n');
}

const sendPreviewMessage = async (
  ctx: BotContext,
  locale: string,
  draft: CreatePromotionInput | Promotion,
  image?: InputFile | null,
) => {
  const title = locale === 'ru' ? draft.title_ru : draft.title_uz;
  const body = locale === 'ru' ? draft.about_ru : draft.about_uz;
  const text = buildPromotionText(title, body);

  if (image) {
    try {
      await ctx.replyWithPhoto(image, {
        caption: text,
        parse_mode: 'HTML',
      });
      return;
    } catch {
      logger.warn('Promotion preview caption was too large or invalid, falling back to separate text preview.');
      await ctx.replyWithPhoto(image, {
        caption: escapeHtml(title),
        parse_mode: 'HTML',
      });
    }
  }

  await ctx.reply(text, {
    parse_mode: 'HTML',
  });
};

const sendDraftPreview = async (ctx: BotContext, locale: string, draft: PromotionDraft) => {
  const image = draft.image ? new InputFile(draft.image.buffer, draft.image.fileName || 'promotion.jpg') : null;
  await sendPreviewMessage(ctx, locale, draft, image);
};

const sendDraftConfirmation = async (ctx: BotContext, locale: string, draft: PromotionDraft) => {
  await ctx.reply(buildDraftSummary(draft, locale), {
    parse_mode: 'HTML',
    reply_markup: getConfirmKeyboard(locale),
  });
};

const askConfirmSave = async (conversation: BotConversation, ctx: BotContext, locale: string): Promise<boolean> => {
  while (true) {
    const confirmCtx = await conversation.waitFor('callback_query:data');
    const action = confirmCtx.callbackQuery.data;
    await confirmCtx.answerCallbackQuery().catch(() => undefined);

    if (action === PROMOTION_CONFIRM_SAVE_CALLBACK) {
      return true;
    }

    if (action === PROMOTION_CONFIRM_CANCEL_CALLBACK) {
      await confirmCtx.reply(i18n.t(locale, 'admin_cancelled'), {
        reply_markup: getAdminMenuKeyboard(locale),
      });
      return false;
    }
  }
};

const askLongContentDecision = async (
  conversation: BotConversation,
  ctx: BotContext,
  locale: string,
  overflows: Array<{ localeCode: 'uz' | 'ru'; length: number }>,
): Promise<'keep' | 'edit' | 'cancel'> => {
  await ctx.reply(buildLongContentWarningText(locale, overflows), {
    parse_mode: 'HTML',
    reply_markup: getLongContentDecisionKeyboard(locale),
  });

  while (true) {
    const confirmCtx = await conversation.waitFor('callback_query:data');
    const action = confirmCtx.callbackQuery.data;
    await confirmCtx.answerCallbackQuery().catch(() => undefined);

    if (action === PROMOTION_LONG_CONTENT_KEEP_CALLBACK) {
      return 'keep';
    }

    if (action === PROMOTION_LONG_CONTENT_EDIT_CALLBACK) {
      return 'edit';
    }

    if (action === PROMOTION_LONG_CONTENT_CANCEL_CALLBACK) {
      await confirmCtx.reply(i18n.t(locale, 'admin_cancelled'), {
        reply_markup: getAdminMenuKeyboard(locale),
      });
      return 'cancel';
    }
  }
};

const askLongContentLocaleToEdit = async (
  conversation: BotConversation,
  ctx: BotContext,
  locale: string,
  options: Array<'uz' | 'ru'>,
): Promise<'uz' | 'ru' | null> => {
  if (options.length === 1) {
    return options[0];
  }

  const uzLabel = i18n.t(locale, 'admin_campaign_long_content_edit_uz');
  const ruLabel = i18n.t(locale, 'admin_campaign_long_content_edit_ru');

  await ctx.reply(i18n.t(locale, 'admin_campaign_long_content_choose_locale'), {
    reply_markup: getLocaleChoiceKeyboard(locale, options),
  });

  while (true) {
    const messageCtx = await conversation.waitFor('message:text');
    const value = messageCtx.message.text.trim();

    if (isCancelText(value, locale)) {
      await messageCtx.reply(i18n.t(locale, 'admin_cancelled'), {
        reply_markup: getAdminMenuKeyboard(locale),
      });
      return null;
    }

    if (value === uzLabel && options.includes('uz')) {
      return 'uz';
    }

    if (value === ruLabel && options.includes('ru')) {
      return 'ru';
    }

    await messageCtx.reply(i18n.t(locale, 'admin_campaign_long_content_choose_locale_invalid'), {
      reply_markup: getLocaleChoiceKeyboard(locale, options),
    });
  }
};

const reviewLongContentWarning = async (
  conversation: BotConversation,
  ctx: BotContext,
  locale: string,
  draft: PromotionDraft,
): Promise<boolean> => {
  if (!draft.image) {
    return true;
  }

  while (true) {
    const overflows = getPromotionCaptionOverflows(draft);
    if (overflows.length === 0) {
      return true;
    }

    const decision = await askLongContentDecision(conversation, ctx, locale, overflows);
    if (decision === 'keep') {
      return true;
    }
    if (decision === 'cancel') {
      return false;
    }

    const localeToEdit = await askLongContentLocaleToEdit(
      conversation,
      ctx,
      locale,
      overflows.map(({ localeCode }) => localeCode),
    );

    if (!localeToEdit) {
      return false;
    }

    const promptKey =
      localeToEdit === 'uz' ? 'admin_campaign_edit_prompt_about_uz' : 'admin_campaign_edit_prompt_about_ru';
    const nextValue = await waitForRichTextMessage(conversation, ctx, locale, i18n.t(locale, promptKey));

    if (nextValue === null) {
      return false;
    }

    if (localeToEdit === 'uz') {
      draft.about_uz = nextValue;
    } else {
      draft.about_ru = nextValue;
    }

  }
};

const waitForText = async (
  conversation: BotConversation,
  ctx: BotContext,
  locale: string,
  prompt: string,
  options?: {
    skipAllowed?: boolean;
    keyboard?: Keyboard;
  },
): Promise<string | null | typeof SKIP_SYMBOL> => {
  const keyboard = options?.keyboard || (options?.skipAllowed ? getSkipKeyboard(locale) : getCancelKeyboard(locale));
  await ctx.reply(prompt, { reply_markup: keyboard });

  while (true) {
    const messageCtx = await conversation.waitFor('message:text');
    const value = messageCtx.message.text.trim();

    if (isCancelText(value, locale)) {
      await messageCtx.reply(i18n.t(locale, 'admin_cancelled'), {
        reply_markup: getAdminMenuKeyboard(locale),
      });
      return null;
    }

    if (options?.skipAllowed && isSkipText(value, locale)) {
      return SKIP_SYMBOL;
    }

    return value;
  }
};

const SKIP_SYMBOL = Symbol('skip');

const waitForRichTextMessage = async (
  conversation: BotConversation,
  ctx: BotContext,
  locale: string,
  prompt: string,
): Promise<string | null> => {
  await ctx.reply(prompt, {
    reply_markup: getCancelKeyboard(locale),
  });

  while (true) {
    const messageCtx = await conversation.wait();
    const messageText = messageCtx.message?.text || messageCtx.message?.caption || '';

    if (messageCtx.message?.text && isCancelText(messageCtx.message.text.trim(), locale)) {
      await messageCtx.reply(i18n.t(locale, 'admin_cancelled'), {
        reply_markup: getAdminMenuKeyboard(locale),
      });
      return null;
    }

    if (!messageText) {
      await messageCtx.reply(i18n.t(locale, 'admin_campaign_rich_text_required'), {
        reply_markup: getCancelKeyboard(locale),
      });
      continue;
    }

    return telegramMessageToHtml(messageCtx.message!);
  }
};

const waitForOptionalImage = async (
  conversation: BotConversation,
  ctx: BotContext,
  locale: string,
  prompt: string,
): Promise<PromotionImageInput | null | typeof SKIP_SYMBOL> => {
  await ctx.reply(prompt, {
    reply_markup: getSkipKeyboard(locale),
  });

  while (true) {
    const messageCtx = await conversation.wait();
    const text = messageCtx.message?.text?.trim();

    if (text && isCancelText(text, locale)) {
      await messageCtx.reply(i18n.t(locale, 'admin_cancelled'), {
        reply_markup: getAdminMenuKeyboard(locale),
      });
      return null;
    }

    if (text && isSkipText(text, locale)) {
      return SKIP_SYMBOL;
    }

    const photo = messageCtx.message?.photo?.[messageCtx.message.photo.length - 1];
    if (!photo) {
      await messageCtx.reply(i18n.t(locale, 'admin_campaign_photo_required'), {
        reply_markup: getSkipKeyboard(locale),
      });
      continue;
    }

    const filePath = await getTelegramFilePath(messageCtx, photo.file_id);
    if (!filePath) {
      await messageCtx.reply(i18n.t(locale, 'admin_campaign_photo_download_error'), {
        reply_markup: getSkipKeyboard(locale),
      });
      continue;
    }

    const buffer = await downloadTelegramFileByPath(filePath);
    if (!buffer) {
      await messageCtx.reply(i18n.t(locale, 'admin_campaign_photo_download_error'), {
        reply_markup: getSkipKeyboard(locale),
      });
      continue;
    }

    return {
      buffer,
      fileName: `image-${Date.now()}.jpg`,
      mimeType: 'image/jpeg',
    };
  }
};

const waitForOptionalDate = async (
  conversation: BotConversation,
  ctx: BotContext,
  locale: string,
  prompt: string,
): Promise<Date | null | typeof SKIP_SYMBOL> => {
  await ctx.reply(prompt, {
    reply_markup: getSkipKeyboard(locale),
  });

  while (true) {
    const messageCtx = await conversation.waitFor('message:text');
    const value = messageCtx.message.text.trim();

    if (isCancelText(value, locale)) {
      await messageCtx.reply(i18n.t(locale, 'admin_cancelled'), {
        reply_markup: getAdminMenuKeyboard(locale),
      });
      return null;
    }

    if (isSkipText(value, locale)) {
      return SKIP_SYMBOL;
    }

    const parsed = parsePromotionDate(value);
    if (!parsed) {
      await messageCtx.reply(i18n.t(locale, 'admin_campaign_invalid_datetime'), {
        reply_markup: getSkipKeyboard(locale),
      });
      continue;
    }

    return parsed;
  }
};

const waitForActiveState = async (
  conversation: BotConversation,
  ctx: BotContext,
  locale: string,
  prompt: string,
): Promise<boolean | null> => {
  await ctx.reply(prompt, {
    reply_markup: getActiveChoiceKeyboard(locale),
  });

  while (true) {
    const messageCtx = await conversation.waitFor('message:text');
    const value = messageCtx.message.text.trim();

    if (isCancelText(value, locale)) {
      await messageCtx.reply(i18n.t(locale, 'admin_cancelled'), {
        reply_markup: getAdminMenuKeyboard(locale),
      });
      return null;
    }

    if (value === i18n.t(locale, 'admin_yes')) {
      return true;
    }

    if (value === i18n.t(locale, 'admin_no')) {
      return false;
    }

    await messageCtx.reply(i18n.t(locale, 'admin_campaign_choose_yes_no'), {
      reply_markup: getActiveChoiceKeyboard(locale),
    });
  }
};

export const showAdminPromotionsList = async (ctx: BotContext, locale: string, page: number = 1) => {
  const result = await PromotionService.listPromotionsPage(page, PROMOTIONS_PAGE_SIZE);
  if (ctx.session) {
    ctx.session.adminPromotionListPage = result.page;
  }

  await ctx.reply(buildAdminPromotionsListText(locale, result.total, result.page, result.totalPages), {
    reply_markup: getAdminPromotionsKeyboard(result.data, result.page, result.totalPages, locale),
  });
};

export const showAdminPromotionDetailCard = async (
  ctx: BotContext,
  locale: string,
  promotionId: number,
) => {
  const promotion = await PromotionService.getPromotionForAdmin(promotionId);
  if (!promotion) {
    await ctx.reply(i18n.t(locale, 'campaign_promotion_not_found'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
    return;
  }

  const summary = buildAdminPromotionSummary(promotion, locale);
  const keyboard = getAdminPromotionDetailKeyboard(
    promotion.id,
    Boolean(promotion.cover_image_object_key),
    promotion.is_active,
    promotion.assign_coupons,
    locale,
  );
  const image = await getPromotionImageInput(promotion);

  if (image) {
    try {
      await ctx.replyWithPhoto(image, {
        caption: summary,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
      return;
    } catch {
      logger.warn('Promotion detail caption fallback triggered.');
    }
  }

  await ctx.reply(summary, {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
};

const buildAdminPrizesListText = (
  locale: string,
  total: number,
  page: number,
  totalPages: number,
): string => {
  return `${i18n.t(locale, 'admin_campaign_prizes')}\n\n${i18n.t(locale, 'admin_campaign_prizes_page', {
    total: total.toString(),
    current: page.toString(),
    pages: totalPages.toString(),
  })}`;
};

const buildAdminPrizeSummary = (prize: PromotionPrizeListItem, locale: string): string => {
  const status = prize.is_active
    ? i18n.t(locale, 'admin_campaign_status_active')
    : i18n.t(locale, 'admin_campaign_status_inactive');

  return [
    `<b>${i18n.t(locale, 'admin_campaign_prize_detail_header')}</b>`,
    '',
    `<b>${escapeHtml(prize.title)}</b>`,
    `${i18n.t(locale, 'admin_campaign_prize_promotion_label')}: ${escapeHtml(getPromotionTitleForLocale(prize, locale))}`,
    `${i18n.t(locale, 'admin_campaign_status_label')}: ${escapeHtml(status)}`,
    `${i18n.t(locale, 'admin_campaign_image_label')}: ${prize.image_object_key ? escapeHtml(i18n.t(locale, 'admin_yes')) : escapeHtml(i18n.t(locale, 'admin_no'))}`,
    '',
    `${i18n.t(locale, 'admin_campaign_prize_description_label')}:`,
    prize.description ? escapeHtml(prize.description) : escapeHtml(i18n.t(locale, 'admin_campaign_prize_description_empty')),
  ].join('\n');
};

const buildPrizeDraftSummary = (
  draft: PrizeDraft,
  promotion: Promotion,
  locale: string,
  hasImage: boolean = Boolean(draft.image),
): string => {
  const status = draft.is_active
    ? i18n.t(locale, 'admin_campaign_status_active')
    : i18n.t(locale, 'admin_campaign_status_inactive');

  return [
    `<b>${i18n.t(locale, 'admin_campaign_preview_summary')}</b>`,
    '',
    `${i18n.t(locale, 'admin_campaign_prize_promotion_label')}: ${escapeHtml(locale === 'ru' ? promotion.title_ru : promotion.title_uz)}`,
    `${i18n.t(locale, 'admin_campaign_status_label')}: ${escapeHtml(status)}`,
    `${i18n.t(locale, 'admin_campaign_image_label')}: ${hasImage ? escapeHtml(i18n.t(locale, 'admin_yes')) : escapeHtml(i18n.t(locale, 'admin_no'))}`,
    `${i18n.t(locale, 'admin_campaign_edit_prize_title')}: ${escapeHtml(draft.title)}`,
    `${i18n.t(locale, 'admin_campaign_prize_description_label')}:`,
    draft.description ? escapeHtml(draft.description) : escapeHtml(i18n.t(locale, 'admin_campaign_prize_description_empty')),
  ].join('\n');
};

const waitForPromotionSelection = async (
  conversation: BotConversation,
  ctx: BotContext,
  locale: string,
  prompt: string,
): Promise<number | null> => {
  const promotions = await conversation.external(() => PromotionService.listPromotions());

  if (promotions.length === 0) {
    await ctx.reply(i18n.t(locale, 'admin_campaign_prize_no_promotions'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
    return null;
  }

  await ctx.reply(prompt, {
    reply_markup: buildPromotionSelectionKeyboard(promotions, locale),
  });

  while (true) {
    const nextCtx = await conversation.wait();
    if (nextCtx.callbackQuery) {
      const data = nextCtx.callbackQuery.data || '';
      await nextCtx.answerCallbackQuery().catch(() => undefined);

      if (data === 'admin_cancel') {
        await nextCtx.reply(i18n.t(locale, 'admin_cancelled'), {
          reply_markup: getAdminMenuKeyboard(locale),
        });
        return null;
      }

      if (data.startsWith('promotion_select:')) {
        return Number(data.split(':')[1] || 0) || null;
      }
    }

    const text = nextCtx.message?.text?.trim();
    if (text && isCancelText(text, locale)) {
      await nextCtx.reply(i18n.t(locale, 'admin_cancelled'), {
        reply_markup: getAdminMenuKeyboard(locale),
      });
      return null;
    }
  }
};

export const showAdminPrizesList = async (ctx: BotContext, locale: string, page: number = 1) => {
  const result = await PromotionService.listPrizesPage(page, PRIZES_PAGE_SIZE);
  if (ctx.session) {
    ctx.session.adminPrizeListPage = result.page;
  }

  if (result.total === 0) {
    await ctx.reply(i18n.t(locale, 'admin_campaign_prizes_empty'), {
      reply_markup: getAdminPrizesKeyboard([], result.page, result.totalPages, locale),
    });
    return;
  }

  await ctx.reply(buildAdminPrizesListText(locale, result.total, result.page, result.totalPages), {
    reply_markup: getAdminPrizesKeyboard(result.data, result.page, result.totalPages, locale),
  });
};

export const showAdminPrizeDetailCard = async (
  ctx: BotContext,
  locale: string,
  prizeId: number,
) => {
  const prize = await PromotionService.getPrizeById(prizeId);
  if (!prize) {
    await ctx.reply(i18n.t(locale, 'admin_campaign_prize_not_found'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
    return;
  }

  const summary = buildAdminPrizeSummary(prize, locale);
  const keyboard = getAdminPrizeDetailKeyboard(prize.id, Boolean(prize.image_object_key), prize.is_active, locale);
  const image = await getPrizeImageInput(prize);

  if (image) {
    try {
      await ctx.replyWithPhoto(image, {
        caption: summary,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
      return;
    } catch {
      logger.warn('Prize detail caption fallback triggered.');
    }
  }

  await ctx.reply(summary, {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
};

export const showAdminWinnerPrizeSelection = async (
  ctx: BotContext,
  locale: string,
  couponCode: string,
  prizes: PromotionPrize[],
) => {
  await ctx.reply(i18n.t(locale, 'admin_campaign_choose_winner_prize'), {
    reply_markup: getAdminWinnerPrizeSelectionKeyboard(couponCode, prizes, locale),
  });
};

export async function adminCouponSearchConversation(
  conversation: BotConversation,
  ctx: BotContext,
) {
  const session = await conversation.external((c) => c.session);
  const locale = session?.__language_code || 'uz';

  await ctx.reply(i18n.t(locale, 'admin_campaign_coupon_search_prompt'));
  const inputCtx = await conversation.waitFor('message:text');
  const code = inputCtx.message.text.trim();
  const coupon = await conversation.external(() => CouponService.findCouponByCode(code));

  if (!coupon) {
    await ctx.reply(i18n.t(locale, 'admin_campaign_coupon_not_found'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
    return;
  }

  const name = [coupon.first_name, coupon.last_name].filter(Boolean).join(' ') || 'Unknown';
  const promotion = locale === 'ru' ? coupon.promotion_title_ru : coupon.promotion_title_uz;

  let message = `<b>${escapeHtml(i18n.t(locale, 'admin_campaign_coupon_detail_header'))}</b>\n\n`;
  message += `🎟 <code>${escapeHtml(coupon.code)}</code>\n`;
  message += `👤 ${escapeHtml(name)}\n`;
  message += `📱 ${escapeHtml(coupon.phone_number || '-')}\n`;
  message += `📌 ${escapeHtml(coupon.source_type)}\n`;
  message += `📅 ${escapeHtml(formatDateForLocale(coupon.expires_at, locale))}\n`;
  message += `🔖 ${escapeHtml(coupon.status)}\n`;
  if (promotion) {
    message += `🎯 ${escapeHtml(promotion)}\n`;
  }

  await ctx.reply(message, {
    parse_mode: 'HTML',
    reply_markup:
      coupon.status === 'active' ? getCouponAdminKeyboard(coupon.code, locale) : getAdminMenuKeyboard(locale),
  });
}

export async function adminPromotionCreateConversation(
  conversation: BotConversation,
  ctx: BotContext,
) {
  const session = await conversation.external((c) => c.session);
  const locale = session?.__language_code || 'uz';
  const draft: PromotionDraft = {
    slug: '',
    title_uz: '',
    title_ru: '',
    about_uz: '',
    about_ru: '',
    starts_at: null,
    ends_at: null,
    is_active: true,
    assign_coupons: false,
    image: null,
  };

  while (true) {
    const slug = await waitForText(
      conversation,
      ctx,
      locale,
      i18n.t(locale, 'admin_campaign_ask_slug'),
    );

    if (slug === null || slug === SKIP_SYMBOL) {
      return;
    }

    if (!slugPattern.test(slug)) {
      await ctx.reply(i18n.t(locale, 'admin_campaign_invalid_slug'), {
        reply_markup: getCancelKeyboard(locale),
      });
      continue;
    }

    const existing = await conversation.external(() => PromotionService.getPromotionBySlug(slug));
    if (existing) {
      await ctx.reply(i18n.t(locale, 'admin_campaign_slug_exists'), {
        reply_markup: getCancelKeyboard(locale),
      });
      continue;
    }

    draft.slug = slug;
    break;
  }

  const titleUz = await waitForText(conversation, ctx, locale, i18n.t(locale, 'admin_campaign_ask_title_uz'));
  if (titleUz === null || titleUz === SKIP_SYMBOL) {
    return;
  }
  draft.title_uz = titleUz;

  const titleRu = await waitForText(conversation, ctx, locale, i18n.t(locale, 'admin_campaign_ask_title_ru'));
  if (titleRu === null || titleRu === SKIP_SYMBOL) {
    return;
  }
  draft.title_ru = titleRu;

  const aboutUz = await waitForRichTextMessage(
    conversation,
    ctx,
    locale,
    i18n.t(locale, 'admin_campaign_ask_about_uz'),
  );
  if (aboutUz === null) {
    return;
  }
  draft.about_uz = aboutUz;

  const aboutRu = await waitForRichTextMessage(
    conversation,
    ctx,
    locale,
    i18n.t(locale, 'admin_campaign_ask_about_ru'),
  );
  if (aboutRu === null) {
    return;
  }
  draft.about_ru = aboutRu;

  const image = await waitForOptionalImage(
    conversation,
    ctx,
    locale,
    i18n.t(locale, 'admin_campaign_ask_image'),
  );
  if (image === null) {
    return;
  }
  draft.image = image === SKIP_SYMBOL ? null : image;

  const startsAt = await waitForOptionalDate(
    conversation,
    ctx,
    locale,
    i18n.t(locale, 'admin_campaign_ask_starts_at'),
  );
  if (startsAt === null) {
    return;
  }
  draft.starts_at = startsAt === SKIP_SYMBOL ? null : startsAt;

  const endsAt = await waitForOptionalDate(
    conversation,
    ctx,
    locale,
    i18n.t(locale, 'admin_campaign_ask_ends_at'),
  );
  if (endsAt === null) {
    return;
  }
  draft.ends_at = endsAt === SKIP_SYMBOL ? null : endsAt;

  const isActive = await waitForActiveState(
    conversation,
    ctx,
    locale,
    i18n.t(locale, 'admin_campaign_ask_is_active'),
  );
  if (isActive === null) {
    return;
  }
  draft.is_active = isActive;

  const assignCoupons = await waitForActiveState(
    conversation,
    ctx,
    locale,
    i18n.t(locale, 'admin_campaign_ask_assign_coupons'),
  );
  if (assignCoupons === null) {
    return;
  }
  draft.assign_coupons = assignCoupons;

  const warningAccepted = await reviewLongContentWarning(conversation, ctx, locale, draft);
  if (!warningAccepted) {
    return;
  }
  await sendDraftPreview(ctx, locale, draft);
  await sendDraftConfirmation(ctx, locale, draft);
  const confirmed = await askConfirmSave(conversation, ctx, locale);

  if (!confirmed) {
    return;
  }

  try {
    const createInput: CreatePromotionInput = {
      slug: draft.slug,
      title_uz: draft.title_uz,
      title_ru: draft.title_ru,
      about_uz: draft.about_uz,
      about_ru: draft.about_ru,
      ends_at: draft.ends_at,
      is_active: draft.is_active,
      assign_coupons: draft.assign_coupons,
    };
    const created = await conversation.external(() => PromotionService.createPromotion(createInput));
    if (draft.image) {
      await conversation.external(() => PromotionService.replacePromotionImage(created.id, draft.image!));
    }

    await ctx.reply(i18n.t(locale, 'admin_campaign_promotion_created'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
    await showAdminPromotionDetailCard(ctx, locale, created.id);
  } catch (error) {
    logger.error('Error creating promotion:', error);
    await ctx.reply(i18n.t(locale, 'admin_error'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
  }
}

export async function adminPromotionEditConversation(
  conversation: BotConversation,
  ctx: BotContext,
) {
  const adminSession = await conversation.external((c) => c.session);
  const locale = adminSession?.__language_code || 'uz';
  const target = adminSession?.adminPromotionEditTarget;

  if (!target) {
    await ctx.reply(i18n.t(locale, 'admin_error'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
    return;
  }

  const promotion = await conversation.external(() => PromotionService.getPromotionForAdmin(target.promotionId));
  if (!promotion) {
    await ctx.reply(i18n.t(locale, 'campaign_promotion_not_found'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
    await conversation.external((c) => {
      if (c.session) c.session.adminPromotionEditTarget = undefined;
    });
    return;
  }

  const update: UpdatePromotionInput = {};
  let imageUpdate: PromotionImageInput | null | typeof SKIP_SYMBOL = SKIP_SYMBOL;

  switch (target.field) {
    case 'slug': {
      while (true) {
        const slug = await waitForText(conversation, ctx, locale, i18n.t(locale, 'admin_campaign_edit_prompt_slug'));
        if (slug === null || slug === SKIP_SYMBOL) {
          await conversation.external((c) => {
      if (c.session) c.session.adminPromotionEditTarget = undefined;
    });
          return;
        }
        if (!slugPattern.test(slug)) {
          await ctx.reply(i18n.t(locale, 'admin_campaign_invalid_slug'), {
            reply_markup: getCancelKeyboard(locale),
          });
          continue;
        }

        const existing = await conversation.external(() => PromotionService.getPromotionBySlug(slug));
        if (existing && existing.id !== promotion.id) {
          await ctx.reply(i18n.t(locale, 'admin_campaign_slug_exists'), {
            reply_markup: getCancelKeyboard(locale),
          });
          continue;
        }

        update.slug = slug;
        break;
      }
      break;
    }
    case 'title_uz': {
      const value = await waitForText(conversation, ctx, locale, i18n.t(locale, 'admin_campaign_edit_prompt_title_uz'));
      if (value === null || value === SKIP_SYMBOL) {
        await conversation.external((c) => {
      if (c.session) c.session.adminPromotionEditTarget = undefined;
    });
        return;
      }
      update.title_uz = value;
      break;
    }
    case 'title_ru': {
      const value = await waitForText(conversation, ctx, locale, i18n.t(locale, 'admin_campaign_edit_prompt_title_ru'));
      if (value === null || value === SKIP_SYMBOL) {
        await conversation.external((c) => {
      if (c.session) c.session.adminPromotionEditTarget = undefined;
    });
        return;
      }
      update.title_ru = value;
      break;
    }
    case 'about_uz': {
      const value = await waitForRichTextMessage(
        conversation,
        ctx,
        locale,
        i18n.t(locale, 'admin_campaign_edit_prompt_about_uz'),
      );
      if (value === null) {
        await conversation.external((c) => {
      if (c.session) c.session.adminPromotionEditTarget = undefined;
    });
        return;
      }
      update.about_uz = value;
      break;
    }
    case 'about_ru': {
      const value = await waitForRichTextMessage(
        conversation,
        ctx,
        locale,
        i18n.t(locale, 'admin_campaign_edit_prompt_about_ru'),
      );
      if (value === null) {
        await conversation.external((c) => {
      if (c.session) c.session.adminPromotionEditTarget = undefined;
    });
        return;
      }
      update.about_ru = value;
      break;
    }
    case 'cover_image': {
      const value = await waitForOptionalImage(
        conversation,
        ctx,
        locale,
        i18n.t(locale, 'admin_campaign_edit_prompt_image'),
      );
      if (value === null) {
        await conversation.external((c) => {
      if (c.session) c.session.adminPromotionEditTarget = undefined;
    });
        return;
      }
      if (value === SKIP_SYMBOL) {
        await conversation.external((c) => {
      if (c.session) c.session.adminPromotionEditTarget = undefined;
    });
        await ctx.reply(i18n.t(locale, 'admin_cancelled'), {
          reply_markup: getAdminMenuKeyboard(locale),
        });
        return;
      }
      imageUpdate = value;
      break;
    }
    case 'starts_at': {
      const value = await waitForOptionalDate(
        conversation,
        ctx,
        locale,
        i18n.t(locale, 'admin_campaign_edit_prompt_starts_at'),
      );
      if (value === null) {
        await conversation.external((c) => {
      if (c.session) c.session.adminPromotionEditTarget = undefined;
    });
        return;
      }
      update.starts_at = value === SKIP_SYMBOL ? null : value;
      break;
    }
    case 'ends_at': {
      const value = await waitForOptionalDate(
        conversation,
        ctx,
        locale,
        i18n.t(locale, 'admin_campaign_edit_prompt_ends_at'),
      );
      if (value === null) {
        await conversation.external((c) => {
      if (c.session) c.session.adminPromotionEditTarget = undefined;
    });
        return;
      }
      update.ends_at = value === SKIP_SYMBOL ? null : value;
      break;
    }
    case 'assign_coupons': {
      const value = await waitForActiveState(
        conversation,
        ctx,
        locale,
        i18n.t(locale, 'admin_campaign_edit_prompt_assign_coupons'),
      );
      if (value === null) {
        await conversation.external((c) => {
          if (c.session) c.session.adminPromotionEditTarget = undefined;
        });
        return;
      }
      update.assign_coupons = value;
      break;
    }
  }

  const preview: Promotion = {
    ...promotion,
    ...update,
  };

  const previewDraft: PromotionDraft = {
    slug: preview.slug,
    title_uz: preview.title_uz,
    title_ru: preview.title_ru,
    about_uz: preview.about_uz,
    about_ru: preview.about_ru,
    is_active: preview.is_active,
    assign_coupons: preview.assign_coupons,
    starts_at: preview.starts_at || null,
    ends_at: preview.ends_at || null,
    image: imageUpdate && imageUpdate !== SKIP_SYMBOL ? imageUpdate : null,
  };

  const warningAccepted = await reviewLongContentWarning(conversation, ctx, locale, previewDraft);
  if (!warningAccepted) {
    await conversation.external((c) => {
      if (c.session) c.session.adminPromotionEditTarget = undefined;
    });
    return;
  }
  await sendDraftPreview(ctx, locale, previewDraft);
  await sendDraftConfirmation(ctx, locale, previewDraft);
  const confirmed = await askConfirmSave(conversation, ctx, locale);
  if (!confirmed) {
    await conversation.external((c) => {
      if (c.session) c.session.adminPromotionEditTarget = undefined;
    });
    return;
  }

  try {
    if (Object.keys(update).length > 0) {
      await conversation.external(() => PromotionService.updatePromotion(promotion.id, update));
    }

    if (imageUpdate && imageUpdate !== SKIP_SYMBOL) {
      await conversation.external(() => PromotionService.replacePromotionImage(promotion.id, imageUpdate));
    }

    await ctx.reply(i18n.t(locale, 'admin_campaign_promotion_updated'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
    await showAdminPromotionDetailCard(ctx, locale, promotion.id);
  } catch (error) {
    logger.error('Error updating promotion:', error);
    await ctx.reply(i18n.t(locale, 'admin_error'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
  } finally {
    await conversation.external((c) => {
      if (c.session) c.session.adminPromotionEditTarget = undefined;
    });
  }
}

export async function adminPrizeCreateConversation(
  conversation: BotConversation,
  ctx: BotContext,
) {
  const session = await conversation.external((c) => c.session);
  const locale = session?.__language_code || 'uz';
  const draft: PrizeDraft = {
    promotion_id: 0,
    title: '',
    description: null,
    image: null,
    is_active: true,
  };

  const promotionId = await waitForPromotionSelection(
    conversation,
    ctx,
    locale,
    i18n.t(locale, 'admin_campaign_ask_prize_promotion'),
  );
  if (!promotionId) {
    return;
  }
  draft.promotion_id = promotionId;

  const title = await waitForText(conversation, ctx, locale, i18n.t(locale, 'admin_campaign_ask_prize_title'));
  if (title === null || title === SKIP_SYMBOL) {
    return;
  }
  draft.title = title;

  const description = await waitForText(
    conversation,
    ctx,
    locale,
    i18n.t(locale, 'admin_campaign_ask_prize_description'),
    { skipAllowed: true },
  );
  if (description === null) {
    return;
  }
  draft.description = description === SKIP_SYMBOL ? null : description;

  const image = await waitForOptionalImage(
    conversation,
    ctx,
    locale,
    i18n.t(locale, 'admin_campaign_ask_prize_image'),
  );
  if (image === null) {
    return;
  }
  draft.image = image === SKIP_SYMBOL ? null : image;

  const isActive = await waitForActiveState(
    conversation,
    ctx,
    locale,
    i18n.t(locale, 'admin_campaign_ask_is_active'),
  );
  if (isActive === null) {
    return;
  }
  draft.is_active = isActive;

  const promotion = await conversation.external(() => PromotionService.getPromotionById(draft.promotion_id));
  if (!promotion) {
    await ctx.reply(i18n.t(locale, 'admin_campaign_prize_no_promotions'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
    return;
  }

  await ctx.reply(buildPrizeDraftSummary(draft, promotion, locale), {
    parse_mode: 'HTML',
    reply_markup: getConfirmKeyboard(locale),
  });
  const confirmed = await askConfirmSave(conversation, ctx, locale);
  if (!confirmed) {
    return;
  }

  try {
    const created = await conversation.external(() => PromotionService.createPrize({
      promotion_id: draft.promotion_id,
      title: draft.title,
      description: draft.description,
      is_active: draft.is_active,
    }));
    if (draft.image) {
      await conversation.external(() => PromotionService.replacePrizeImage(created.id, draft.image!));
    }
    await ctx.reply(i18n.t(locale, 'admin_campaign_prize_created'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
    await showAdminPrizeDetailCard(ctx, locale, created.id);
  } catch (error) {
    logger.error('Error creating prize:', error);
    await ctx.reply(i18n.t(locale, 'admin_error'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
  }
}

export async function adminPrizeEditConversation(
  conversation: BotConversation,
  ctx: BotContext,
) {
  const adminSession = await conversation.external((c) => c.session);
  const locale = adminSession?.__language_code || 'uz';
  const target = adminSession?.adminPrizeEditTarget;

  if (!target) {
    await ctx.reply(i18n.t(locale, 'admin_error'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
    return;
  }

  const prize = await conversation.external(() => PromotionService.getPrizeById(target.prizeId));
  if (!prize) {
    await ctx.reply(i18n.t(locale, 'admin_campaign_prize_not_found'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
    await conversation.external((c) => {
      if (c.session) c.session.adminPrizeEditTarget = undefined;
    });
    return;
  }

  const update: UpdatePrizeInput = {};
  let imageUpdate: PromotionImageInput | null | typeof SKIP_SYMBOL = SKIP_SYMBOL;

  switch (target.field) {
    case 'promotion_id': {
      const promotionId = await waitForPromotionSelection(
        conversation,
        ctx,
        locale,
        i18n.t(locale, 'admin_campaign_edit_prompt_prize_promotion'),
      );
      if (!promotionId) {
        await conversation.external((c) => {
          if (c.session) c.session.adminPrizeEditTarget = undefined;
        });
        return;
      }
      update.promotion_id = promotionId;
      break;
    }
    case 'title': {
      const title = await waitForText(conversation, ctx, locale, i18n.t(locale, 'admin_campaign_edit_prompt_prize_title'));
      if (title === null || title === SKIP_SYMBOL) {
        await conversation.external((c) => {
          if (c.session) c.session.adminPrizeEditTarget = undefined;
        });
        return;
      }
      update.title = title;
      break;
    }
    case 'description': {
      const description = await waitForText(
        conversation,
        ctx,
        locale,
        i18n.t(locale, 'admin_campaign_edit_prompt_prize_description'),
        { skipAllowed: true },
      );
      if (description === null) {
        await conversation.external((c) => {
          if (c.session) c.session.adminPrizeEditTarget = undefined;
        });
        return;
      }
      update.description = description === SKIP_SYMBOL ? null : description;
      break;
    }
    case 'image': {
      imageUpdate = await waitForOptionalImage(
        conversation,
        ctx,
        locale,
        i18n.t(locale, 'admin_campaign_edit_prompt_prize_image'),
      );
      if (imageUpdate === null) {
        await conversation.external((c) => {
          if (c.session) c.session.adminPrizeEditTarget = undefined;
        });
        return;
      }
      break;
    }
  }

  const preview: PrizeDraft = {
    promotion_id: update.promotion_id ?? prize.promotion_id,
    title: update.title ?? prize.title,
    description: update.description === undefined ? prize.description ?? null : update.description,
    image: imageUpdate && imageUpdate !== SKIP_SYMBOL ? imageUpdate : null,
    is_active: prize.is_active,
  };

  const promotion = await conversation.external(() => PromotionService.getPromotionById(preview.promotion_id));
  if (!promotion) {
    await ctx.reply(i18n.t(locale, 'admin_campaign_prize_no_promotions'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
    await conversation.external((c) => {
      if (c.session) c.session.adminPrizeEditTarget = undefined;
    });
    return;
  }

  const previewHasImage =
    imageUpdate === SKIP_SYMBOL
      ? Boolean(prize.image_object_key)
      : Boolean(imageUpdate);

  await ctx.reply(buildPrizeDraftSummary(preview, promotion, locale, previewHasImage), {
    parse_mode: 'HTML',
    reply_markup: getConfirmKeyboard(locale),
  });
  const confirmed = await askConfirmSave(conversation, ctx, locale);
  if (!confirmed) {
    await conversation.external((c) => {
      if (c.session) c.session.adminPrizeEditTarget = undefined;
    });
    return;
  }

  try {
    await conversation.external(() => PromotionService.updatePrize(prize.id, update));
    if (imageUpdate && imageUpdate !== SKIP_SYMBOL) {
      await conversation.external(() => PromotionService.replacePrizeImage(prize.id, imageUpdate));
    }
    await ctx.reply(i18n.t(locale, 'admin_campaign_prize_updated'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
    await showAdminPrizeDetailCard(ctx, locale, prize.id);
  } catch (error) {
    logger.error('Error updating prize:', error);
    await ctx.reply(i18n.t(locale, 'admin_error'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
  } finally {
    await conversation.external((c) => {
      if (c.session) c.session.adminPrizeEditTarget = undefined;
    });
  }
}
