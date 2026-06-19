import { InlineKeyboard } from 'grammy';

export const BLOCKED_USER_DETAILS_CALLBACK_PREFIX = 'blocked_user_details:';
export const BLOCKED_USER_BACK_CALLBACK_PREFIX = 'blocked_user_back:';

export const getBlockedUserAlertKeyboard = (telegramId: number): InlineKeyboard =>
  new InlineKeyboard().text(
    "👤 Mijoz ma'lumotlari",
    `${BLOCKED_USER_DETAILS_CALLBACK_PREFIX}${telegramId}`,
  );

export const getBlockedUserCardKeyboard = (telegramId: number): InlineKeyboard =>
  new InlineKeyboard().text('⬅️ Orqaga', `${BLOCKED_USER_BACK_CALLBACK_PREFIX}${telegramId}`);
