import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { PaymentOnTimeCouponRepairService } from './payment-on-time-coupon-repair.service';
import { redisService } from '../../redis/redis.service';
import db from '../../database/database';
import type { User } from '../user.service';
redisService.getClient().disconnect();
after(async () => {
  await db.destroy();
});

test('historical coupon repair rejects writes and notifications before loading data', async () => {
  await assert.rejects(
    PaymentOnTimeCouponRepairService.repairHistoricalCoupons({ dryRun: false, notify: false }),
    /COUPON_PROGRAM_RETIRED/,
  );
  await assert.rejects(
    PaymentOnTimeCouponRepairService.repairHistoricalCoupons({ dryRun: true, notify: true }),
    /COUPON_PROGRAM_RETIRED/,
  );
  assert.deepEqual(
    await PaymentOnTimeCouponRepairService.sendRecoveryNotificationsForUser({
      user: {} as User,
      coupons: [],
      installmentsByKey: new Map(),
    }),
    [],
  );
});
