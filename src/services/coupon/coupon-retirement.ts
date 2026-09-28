/** Permanent business-policy retirement, intentionally not an environment flag. */
export const COUPON_PROGRAM_RETIRED = 'COUPON_PROGRAM_RETIRED';
export const COUPON_PROGRAM_RETIRED_MESSAGE = 'The coupon program has ended.';
export const RETIRED_COUPON_TEMPLATE_TYPES = [
  'store_visit',
  'purchase',
  'referral',
  'payment_paid_on_time',
  'winner_notification',
] as const;
export const isRetiredCouponNotification = (type: string): boolean =>
  (RETIRED_COUPON_TEMPLATE_TYPES as readonly string[]).includes(type) ||
  type === 'payment_on_time' ||
  type === 'payment_on_time_recovery';
export function rejectRetiredCouponOperation(): never {
  throw new Error(COUPON_PROGRAM_RETIRED);
}
