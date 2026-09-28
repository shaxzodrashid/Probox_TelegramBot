import assert from 'node:assert/strict';
import test from 'node:test';
import { CouponRegistrationService } from './coupon-registration.service';
import { CouponService } from './coupon.service';

test('retired registration and pending claims produce no coupons or deliveries', async () => {
  assert.deepEqual(await CouponRegistrationService.process(), {
    processed: false,
    reason: 'COUPON_PROGRAM_RETIRED',
    coupons: [],
    delivery: [],
  });
  assert.deepEqual(await CouponRegistrationService.claimPendingCouponsForUser(), {
    coupons: [],
    delivery: [],
  });
});

test('legacy direct issuance and winner mutation reject before any database operation', async () => {
  for (const sourceType of ['payment_on_time', 'purchase', 'store_visit', 'referral'] as const) {
    await assert.rejects(
      CouponService.createCouponsForUser({ sourceType, phoneSnapshot: '901234567' }),
      /COUPON_PROGRAM_RETIRED/,
    );
  }
  await assert.rejects(CouponService.markCouponAsWinner('PRO1234567'), /COUPON_PROGRAM_RETIRED/);
});
