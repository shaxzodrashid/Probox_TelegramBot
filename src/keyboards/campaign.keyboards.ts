import { InlineKeyboard, Keyboard } from 'grammy';
import { i18n } from '../i18n';
import { Promotion, PromotionPrize, PromotionPrizeListItem } from '../services/coupon/promotion.service';

export const ADMIN_PROMOTION_PAGE_CALLBACK_PREFIX = 'apg:';
export const ADMIN_PROMOTION_DETAIL_CALLBACK_PREFIX = 'apd:';
export const ADMIN_PROMOTION_EDIT_CALLBACK_PREFIX = 'ape:';
export const ADMIN_PROMOTION_TOGGLE_CALLBACK_PREFIX = 'apt:';
export const ADMIN_PROMOTION_ASSIGN_COUPONS_TOGGLE_CALLBACK_PREFIX = 'apact:';
export const ADMIN_PROMOTION_ARCHIVE_CALLBACK_PREFIX = 'apa:';
export const ADMIN_PROMOTION_IMAGE_REMOVE_CALLBACK_PREFIX = 'apir:';
export const ADMIN_PROMOTION_CREATE_CALLBACK = 'admin_promotion_create';
export const ADMIN_PROMOTION_BACK_TO_LIST_CALLBACK = 'admin_promotions_back';
export const ADMIN_PRIZE_PAGE_CALLBACK_PREFIX = 'aprpg:';
export const ADMIN_PRIZE_DETAIL_CALLBACK_PREFIX = 'aprd:';
export const ADMIN_PRIZE_EDIT_CALLBACK_PREFIX = 'apre:';
export const ADMIN_PRIZE_TOGGLE_CALLBACK_PREFIX = 'aprt:';
export const ADMIN_PRIZE_DELETE_CALLBACK_PREFIX = 'aprdl:';
export const ADMIN_PRIZE_IMAGE_REMOVE_CALLBACK_PREFIX = 'aprir:';
export const ADMIN_PRIZE_CREATE_CALLBACK = 'admin_prize_create';
export const ADMIN_PRIZE_BACK_TO_LIST_CALLBACK = 'admin_prizes_back';
export const ADMIN_WINNER_PRIZE_SELECT_CALLBACK_PREFIX = 'awps:';

export const getPromotionsKeyboard = (promotions: Promotion[], locale: string) => {
  const keyboard = new Keyboard();

  promotions.forEach((promotion) => {
    const title = locale === 'ru' ? promotion.title_ru : promotion.title_uz;
    keyboard.text(title).row();
  });

  keyboard
    .text(i18n.t(locale, 'back'))
    .text(i18n.t(locale, 'menu_coupons'));

  return keyboard.resized();
};

export const getPromotionDetailKeyboard = (locale: string) => {
  return new InlineKeyboard()
    .text(i18n.t(locale, 'admin_campaign_promotions_back'), 'campaign_back_to_promotions')
    .row()
    .text(i18n.t(locale, 'back'), 'campaign_back_to_menu');
};

export const getCouponsKeyboard = (locale: string) => {
  return new InlineKeyboard()
    .text(i18n.t(locale, 'admin_campaign_promotions_back'), 'campaign_back_to_promotions')
    .row()
    .text(i18n.t(locale, 'back'), 'campaign_back_to_menu');
};

export const getCouponAdminKeyboard = (code: string, locale: string) =>
  new InlineKeyboard()
    .text(i18n.t(locale, 'admin_campaign_mark_winner'), `admin_coupon_mark_winner:${code}`)
    .row()
    .text(i18n.t(locale, 'admin_back_to_menu'), 'admin_back_to_menu');

export const getAdminPromotionsKeyboard = (
  promotions: Promotion[],
  page: number,
  totalPages: number,
  locale: string,
) => {
  const keyboard = new InlineKeyboard();

  promotions.forEach((promotion) => {
    const title = locale === 'ru' ? promotion.title_ru : promotion.title_uz;
    const icon = promotion.is_active ? '🟢' : '⚫';
    keyboard.text(`${icon} ${title}`, `${ADMIN_PROMOTION_DETAIL_CALLBACK_PREFIX}${promotion.id}`).row();
  });

  if (totalPages > 1) {
    if (page > 1) {
      keyboard.text('⬅️', `${ADMIN_PROMOTION_PAGE_CALLBACK_PREFIX}${page - 1}`);
    }
    keyboard.text(`${page}/${totalPages}`, 'noop');
    if (page < totalPages) {
      keyboard.text('➡️', `${ADMIN_PROMOTION_PAGE_CALLBACK_PREFIX}${page + 1}`);
    }
    keyboard.row();
  }

  keyboard
    .text(i18n.t(locale, 'admin_campaign_promotion_create'), ADMIN_PROMOTION_CREATE_CALLBACK)
    .row()
    .text(i18n.t(locale, 'admin_back_to_menu'), 'admin_back_to_menu');

  return keyboard;
};

export const getAdminPromotionDetailKeyboard = (
  promotionId: number,
  hasImage: boolean,
  isActive: boolean,
  assignCoupons: boolean,
  locale: string,
) => {
  const keyboard = new InlineKeyboard();

  keyboard
    .text(i18n.t(locale, 'admin_campaign_edit_slug'), `${ADMIN_PROMOTION_EDIT_CALLBACK_PREFIX}${promotionId}:slug`)
    .text(i18n.t(locale, 'admin_campaign_edit_title_uz'), `${ADMIN_PROMOTION_EDIT_CALLBACK_PREFIX}${promotionId}:title_uz`)
    .row()
    .text(i18n.t(locale, 'admin_campaign_edit_title_ru'), `${ADMIN_PROMOTION_EDIT_CALLBACK_PREFIX}${promotionId}:title_ru`)
    .text(i18n.t(locale, 'admin_campaign_edit_about_uz'), `${ADMIN_PROMOTION_EDIT_CALLBACK_PREFIX}${promotionId}:about_uz`)
    .row()
    .text(i18n.t(locale, 'admin_campaign_edit_about_ru'), `${ADMIN_PROMOTION_EDIT_CALLBACK_PREFIX}${promotionId}:about_ru`)
    .text(i18n.t(locale, 'admin_campaign_edit_image'), `${ADMIN_PROMOTION_EDIT_CALLBACK_PREFIX}${promotionId}:cover_image`)
    .row()
    .text(i18n.t(locale, 'admin_campaign_edit_starts_at'), `${ADMIN_PROMOTION_EDIT_CALLBACK_PREFIX}${promotionId}:starts_at`)
    .text(i18n.t(locale, 'admin_campaign_edit_ends_at'), `${ADMIN_PROMOTION_EDIT_CALLBACK_PREFIX}${promotionId}:ends_at`)
    .row()
    .text(
      isActive ? i18n.t(locale, 'admin_campaign_make_inactive') : i18n.t(locale, 'admin_campaign_make_active'),
      `${ADMIN_PROMOTION_TOGGLE_CALLBACK_PREFIX}${promotionId}`,
    )
    .text(
      assignCoupons ? i18n.t(locale, 'admin_campaign_assign_coupons_disable') : i18n.t(locale, 'admin_campaign_assign_coupons_enable'),
      `${ADMIN_PROMOTION_ASSIGN_COUPONS_TOGGLE_CALLBACK_PREFIX}${promotionId}`,
    )
    .row();

  if (hasImage) {
    keyboard
      .text(
        i18n.t(locale, 'admin_campaign_remove_image'),
        `${ADMIN_PROMOTION_IMAGE_REMOVE_CALLBACK_PREFIX}${promotionId}`,
      )
      .row();
  } else {
    keyboard.row();
  }

  keyboard
    .text(i18n.t(locale, 'admin_campaign_archive'), `${ADMIN_PROMOTION_ARCHIVE_CALLBACK_PREFIX}${promotionId}`)
    .row()
    .text(i18n.t(locale, 'admin_campaign_promotions_back'), ADMIN_PROMOTION_BACK_TO_LIST_CALLBACK);

  return keyboard;
};

export const getAdminPrizesKeyboard = (
  prizes: PromotionPrizeListItem[],
  page: number,
  totalPages: number,
  locale: string,
) => {
  const keyboard = new InlineKeyboard();

  prizes.forEach((prize) => {
    const icon = prize.is_active ? '🟢' : '⚫';
    keyboard.text(`${icon} ${prize.title}`, `${ADMIN_PRIZE_DETAIL_CALLBACK_PREFIX}${prize.id}`).row();
  });

  if (totalPages > 1) {
    if (page > 1) {
      keyboard.text('⬅️', `${ADMIN_PRIZE_PAGE_CALLBACK_PREFIX}${page - 1}`);
    }
    keyboard.text(`${page}/${totalPages}`, 'noop');
    if (page < totalPages) {
      keyboard.text('➡️', `${ADMIN_PRIZE_PAGE_CALLBACK_PREFIX}${page + 1}`);
    }
    keyboard.row();
  }

  keyboard
    .text(i18n.t(locale, 'admin_campaign_prize_create'), ADMIN_PRIZE_CREATE_CALLBACK)
    .row()
    .text(i18n.t(locale, 'admin_back_to_menu'), 'admin_back_to_menu');

  return keyboard;
};

export const getAdminPrizeDetailKeyboard = (
  prizeId: number,
  hasImage: boolean,
  isActive: boolean,
  locale: string,
) => {
  const keyboard = new InlineKeyboard();

  keyboard
    .text(i18n.t(locale, 'admin_campaign_edit_prize_promotion'), `${ADMIN_PRIZE_EDIT_CALLBACK_PREFIX}${prizeId}:promotion_id`)
    .row()
    .text(i18n.t(locale, 'admin_campaign_edit_prize_title'), `${ADMIN_PRIZE_EDIT_CALLBACK_PREFIX}${prizeId}:title`)
    .row()
    .text(i18n.t(locale, 'admin_campaign_edit_prize_description'), `${ADMIN_PRIZE_EDIT_CALLBACK_PREFIX}${prizeId}:description`)
    .row()
    .text(i18n.t(locale, 'admin_campaign_edit_prize_image'), `${ADMIN_PRIZE_EDIT_CALLBACK_PREFIX}${prizeId}:image`)
    .row()
    .text(
      isActive ? i18n.t(locale, 'admin_campaign_make_inactive') : i18n.t(locale, 'admin_campaign_make_active'),
      `${ADMIN_PRIZE_TOGGLE_CALLBACK_PREFIX}${prizeId}`,
    )
    .row();

  if (hasImage) {
    keyboard
      .text(i18n.t(locale, 'admin_campaign_remove_prize_image'), `${ADMIN_PRIZE_IMAGE_REMOVE_CALLBACK_PREFIX}${prizeId}`)
      .row();
  }

  keyboard
    .text(i18n.t(locale, 'admin_campaign_delete'), `${ADMIN_PRIZE_DELETE_CALLBACK_PREFIX}${prizeId}`)
    .row()
    .text(i18n.t(locale, 'admin_campaign_prizes_back'), ADMIN_PRIZE_BACK_TO_LIST_CALLBACK);

  return keyboard;
};

export const getAdminWinnerPrizeSelectionKeyboard = (
  couponCode: string,
  prizes: PromotionPrize[],
  locale: string,
) => {
  const keyboard = new InlineKeyboard();

  prizes.forEach((prize) => {
    keyboard.text(prize.title, `${ADMIN_WINNER_PRIZE_SELECT_CALLBACK_PREFIX}${couponCode}:${prize.id}`).row();
  });

  keyboard.text(i18n.t(locale, 'admin_back_to_menu'), 'admin_back_to_menu');

  return keyboard;
};

export const getAdminMissingPrizeKeyboard = (locale: string) => {
  return new InlineKeyboard()
    .text(i18n.t(locale, 'admin_campaign_prize_create'), ADMIN_PRIZE_CREATE_CALLBACK)
    .row()
    .text(i18n.t(locale, 'admin_back_to_menu'), 'admin_back_to_menu');
};
