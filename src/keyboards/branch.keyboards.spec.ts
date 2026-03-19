import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_BRANCH_DEACTIVATE_CALLBACK_PREFIX,
  ADMIN_BRANCH_DEACTIVATE_CONFIRM_CALLBACK_PREFIX,
  ADMIN_BRANCH_DETAIL_CALLBACK_PREFIX,
  getAdminBranchDeactivateConfirmKeyboard,
  getAdminBranchDetailKeyboard,
} from './branch.keyboards';

const BRANCH_ID = '13d22a53-ab99-4272-9766-57425a8e0e51';
const TELEGRAM_CALLBACK_DATA_LIMIT = 64;

const getCallbackData = (keyboard: { inline_keyboard: unknown[][] }) =>
  keyboard.inline_keyboard
    .flat()
    .flatMap((button) => {
      if (typeof button !== 'object' || button === null || !('callback_data' in button)) {
        return [];
      }

      const { callback_data } = button as { callback_data?: string };
      return callback_data ? [callback_data] : [];
    });

test('branch detail keyboard keeps callback payloads within Telegram limit', () => {
  const keyboard = getAdminBranchDetailKeyboard(BRANCH_ID, true, 'uz');
  const callbackData = getCallbackData(keyboard);

  assert.deepEqual(callbackData, [
    `${ADMIN_BRANCH_DEACTIVATE_CONFIRM_CALLBACK_PREFIX}${BRANCH_ID}`,
    'admin_branches_back',
  ]);
  assert.ok(callbackData.every((value) => value.length <= TELEGRAM_CALLBACK_DATA_LIMIT));
});

test('branch deactivate confirm keyboard keeps callback payloads within Telegram limit', () => {
  const keyboard = getAdminBranchDeactivateConfirmKeyboard(BRANCH_ID, 'uz');
  const callbackData = getCallbackData(keyboard);

  assert.deepEqual(callbackData, [
    `${ADMIN_BRANCH_DEACTIVATE_CALLBACK_PREFIX}${BRANCH_ID}`,
    `${ADMIN_BRANCH_DETAIL_CALLBACK_PREFIX}${BRANCH_ID}`,
  ]);
  assert.ok(callbackData.every((value) => value.length <= TELEGRAM_CALLBACK_DATA_LIMIT));
});
