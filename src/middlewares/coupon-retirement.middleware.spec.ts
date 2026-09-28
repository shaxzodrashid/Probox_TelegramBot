import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import {
  couponRetirementMiddleware,
  isRetiredCouponCallback,
} from './coupon-retirement.middleware';
import { getMainKeyboardByLocale } from '../keyboards';
import { getAdminMenuKeyboard } from '../keyboards/admin.keyboards';
import {
  getPromotionDetailKeyboard,
  getAdminPromotionDetailKeyboard,
} from '../keyboards/campaign.keyboards';
import { i18n } from '../i18n';
import { UserService } from '../services/user.service';
import { redisService } from '../redis/redis.service';
import db from '../database/database';
import type { BotContext } from '../types/context';
redisService.getClient().disconnect();
after(async () => {
  await db.destroy();
});

test('menus retain promotions and payments but expose no coupon or prize controls', () => {
  for (const locale of ['uz', 'ru']) {
    const customer = JSON.stringify(getMainKeyboardByLocale(locale, true, true));
    assert.ok(customer.includes(i18n.t(locale, 'menu_payments')));
    assert.ok(customer.includes(i18n.t(locale, 'menu_promotions')));
    assert.ok(!customer.includes(i18n.t(locale, 'menu_coupons')));
    const admin = JSON.stringify(getAdminMenuKeyboard(locale));
    for (const key of [
      'admin_campaign_prizes',
      'admin_campaign_coupon_search',
      'admin_campaign_coupon_export',
    ])
      assert.ok(!admin.includes(i18n.t(locale, key)));
    assert.ok(
      !JSON.stringify(getPromotionDetailKeyboard(locale, { showCoupons: true })).includes(
        'campaign_open_coupons',
      ),
    );
    assert.ok(
      !JSON.stringify(getAdminPromotionDetailKeyboard(1, false, true, true, locale)).includes(
        'apact:',
      ),
    );
    assert.ok(!i18n.t(locale, 'coupon_program_retired').includes('coupon_program_retired'));
  }
});

test('old coupon and prize callbacks are blocked while ordinary promotion/payment controls remain available', () => {
  for (const data of [
    'campaign_open_coupons',
    'admin_coupon_mark_winner:PRO1234567',
    'awps:1:2',
    'apact:1',
    'ape:1:assign_coupons',
    'apre:1:title',
    'admin_prize_create',
    'ace:all',
    'type_select:payment_paid_on_time',
  ])
    assert.equal(isRetiredCouponCallback(data), true, data);
  for (const data of [
    'promotion_detail:1',
    'ape:1:title_uz',
    'admin_template_create',
    'type_select:payment_reminder_d1',
    'start',
  ])
    assert.equal(isRetiredCouponCallback(data), false, data);
});

test('middleware exits persisted prize conversations and refreshes the keyboard with a retirement notice', async (t) => {
  const exited: string[] = [];
  const replies: string[] = [];
  t.mock.method(UserService, 'getUserByTelegramId', async () => null);
  const ctx = {
    conversation: {
      active: () => ({ adminPrizeCreateConversation: 1 }),
      exit: async (name: string) => {
        exited.push(name);
      },
    },
    message: { text: 'old prize draft' },
    from: { id: 123 },
    t: (key: string) => i18n.t('uz', key),
    reply: async (text: string) => {
      replies.push(text);
    },
  } as unknown as BotContext;
  await couponRetirementMiddleware(ctx, async () => {
    assert.fail('retired conversation must not resume');
  });
  assert.deepEqual(exited, ['adminPrizeCreateConversation']);
  assert.deepEqual(replies, [i18n.t('uz', 'coupon_program_retired')]);
});
