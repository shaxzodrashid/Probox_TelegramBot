import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getBlockedUserAlertKeyboard,
  getBlockedUserCardKeyboard,
} from './blocked-user-alert.keyboards';

test('blocked-user alert keyboards switch between customer details and the original alert', () => {
  const telegramId = 8078830248;
  const detailsButton = getBlockedUserAlertKeyboard(telegramId).inline_keyboard[0][0];
  const backButton = getBlockedUserCardKeyboard(telegramId).inline_keyboard[0][0];

  assert.deepEqual(detailsButton, {
    text: "👤 Mijoz ma'lumotlari",
    callback_data: `blocked_user_details:${telegramId}`,
  });
  assert.deepEqual(backButton, {
    text: '⬅️ Orqaga',
    callback_data: `blocked_user_back:${telegramId}`,
  });
});
