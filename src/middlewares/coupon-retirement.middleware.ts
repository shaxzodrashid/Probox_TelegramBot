import type { NextFunction } from 'grammy';
import type { BotContext } from '../types/context';
import { i18n } from '../i18n';
import { getMainKeyboardByLocale } from '../keyboards';
import { UserService } from '../services/user.service';

const retiredActions = [
  'menu_coupons',
  'admin_campaign_prizes',
  'admin_campaign_coupon_search',
  'admin_campaign_coupon_export',
];
const retiredConversations = [
  'adminCouponSearchConversation',
  'adminPrizeCreateConversation',
  'adminPrizeEditConversation',
];
export const isRetiredCouponCallback = (data: string): boolean =>
  /^(campaign_open_coupons$|admin_coupon_|admin_prize_|admin_prizes_back$|aprpg:|aprd:|apre:|aprt:|aprdl:|aprir:|awps:|ace:|apact:|ape:\d+:assign_coupons$|type_select:(store_visit|purchase|referral|payment_paid_on_time|winner_notification)$)/.test(
    data,
  );

export async function couponRetirementMiddleware(
  ctx: BotContext,
  next: NextFunction,
): Promise<void> {
  const active = ctx.conversation.active();
  const retiredActive = retiredConversations.filter((name) => active[name] > 0);
  const text = ctx.message?.text;
  const retiredText = retiredActions.some((key) =>
    ['uz', 'ru'].some((locale) => text === i18n.t(locale, key)),
  );
  if (
    !retiredText &&
    !isRetiredCouponCallback(ctx.callbackQuery?.data || '') &&
    retiredActive.length === 0
  ) {
    await next();
    return;
  }
  for (const name of retiredActive) await ctx.conversation.exit(name);
  if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: ctx.t('coupon_program_retired') });
  const user = ctx.from ? await UserService.getUserByTelegramId(ctx.from.id) : null;
  await ctx.reply(ctx.t('coupon_program_retired'), {
    reply_markup: getMainKeyboardByLocale(
      user?.language_code || 'uz',
      Boolean(user?.is_admin),
      Boolean(user && !user.is_logged_out),
    ),
  });
}
