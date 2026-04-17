import { after } from 'node:test';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeUiText,
  resolveUiTextAction,
} from './ui-text-resolver';
import db from '../../database/database';
import { redisService } from '../../redis/redis.service';

after(async () => {
  await redisService.disconnect().catch(() => undefined);
  await db.destroy().catch(() => undefined);
});

test('normalizeUiText trims and collapses repeated whitespace', () => {
  assert.equal(normalizeUiText('  🎯   Aksiya \n\t'), '🎯 Aksiya');
});

test('resolveUiTextAction matches current menu texts across locales', () => {
  const uzResult = resolveUiTextAction('🎯 Aksiya');
  const ruResult = resolveUiTextAction('🪪 Ввести паспортные данные');

  assert.deepEqual(uzResult, {
    action: 'menu_promotions',
    scope: 'global',
  });
  assert.deepEqual(ruResult, {
    action: 'application_start_passport_button',
    scope: 'global',
  });
});

test('resolveUiTextAction matches legacy main-menu aliases', () => {
  const result = resolveUiTextAction('📲 Главное меню');

  assert.deepEqual(result, {
    action: 'show_main_menu',
    scope: 'global',
    legacyAlias: true,
  });
});

test('resolveUiTextAction classifies resend OTP as context-only', () => {
  const result = resolveUiTextAction('🔄 Kodni qayta jo\'natish');

  assert.deepEqual(result, {
    action: 'resend_otp',
    scope: 'context',
  });
});

test('resolveUiTextAction returns null for free-form support text', () => {
  assert.equal(resolveUiTextAction('Menga yordam kerak, buyurtmam topilmadi'), null);
});
