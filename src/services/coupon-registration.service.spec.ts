import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { redisService } from '../redis/redis.service';
import { BotNotificationService } from './bot-notification.service';
import { CouponRegistrationEventService } from './coupon-registration-event.service';
import { CouponRegistrationService } from './coupon-registration.service';
import { CouponService } from './coupon.service';
import { PromotionService } from './promotion.service';
import { ReferralService } from './referral.service';
import { UserService } from './user.service';

after(async () => {
  await redisService.disconnect().catch(() => undefined);
});

const purchasePayload = {
  phone_number: '+998901111111',
  full_name: 'Buyer From API',
  lead_id: 'lead-100',
  status: 'Purchased' as const,
  product_name: 'Air Conditioner',
};

test('CouponRegistrationService rewards purchaser and all matched referrers on Purchased', async () => {
  const originalRunInTransaction = CouponRegistrationService.runInTransaction;
  const originalGetClient = redisService.getClient;
  const originalGet = redisService.get;
  const originalDelete = redisService.delete;
  const originalGetCurrentPromotion = PromotionService.getCurrentPromotion;
  const originalGetUserByPhoneNumber = UserService.getUserByPhoneNumber;
  const originalGetUsersByIds = UserService.getUsersByIds;
  const originalGetByIdentity = CouponRegistrationEventService.getByIdentity;
  const originalCreateEvent = CouponRegistrationEventService.create;
  const originalCreateCouponsForUser = CouponService.createCouponsForUser;
  const originalCreateOrIgnore = ReferralService.createOrIgnore;
  const originalListByReferredPhoneNumber = ReferralService.listByReferredPhoneNumber;
  const originalHasRewardForEvent = ReferralService.hasRewardForEvent;
  const originalRecordReward = ReferralService.recordReward;
  const originalSendTemplateMessage = BotNotificationService.sendTemplateMessage;

  const notificationCalls: Array<{
    telegramId: number;
    templateType: string;
    customerName: string;
    dispatchType: string;
  }> = [];

  try {
    CouponRegistrationService.runInTransaction = async <T>(callback: (trx: never) => Promise<T>): Promise<T> =>
      callback({} as never);
    (redisService as unknown as { getClient: () => { set: (...args: unknown[]) => Promise<string> } }).getClient = () => ({
      set: async () => 'OK',
    });
    (redisService as unknown as { get: typeof redisService.get }).get = async <T>() => 'token' as T;
    (redisService as unknown as { delete: typeof redisService.delete }).delete = async () => 1;
    PromotionService.getCurrentPromotion = async () =>
      ({
        id: 5,
        slug: 'spring-sale',
      } as Awaited<ReturnType<typeof PromotionService.getCurrentPromotion>>);
    UserService.getUserByPhoneNumber = async (phoneNumber: string) => {
      if (phoneNumber === purchasePayload.phone_number) {
        return {
          id: 11,
          telegram_id: 1111,
          phone_number: phoneNumber,
          language_code: 'uz',
          first_name: 'Stored',
          last_name: 'Buyer',
        } as Awaited<ReturnType<typeof UserService.getUserByPhoneNumber>>;
      }

      return null;
    };
    UserService.getUsersByIds = async (ids: number[]) =>
      ids.map((id) => ({
        id,
        telegram_id: id === 21 ? 2121 : 3131,
        phone_number: id === 21 ? '+998902111111' : '+998903333333',
        language_code: 'uz',
        first_name: id === 21 ? 'Referrer' : 'Second',
        last_name: id === 21 ? 'One' : 'Referrer',
      })) as Awaited<ReturnType<typeof UserService.getUsersByIds>>;
    CouponRegistrationEventService.getByIdentity = async () => null;
    CouponRegistrationEventService.create = async () =>
      ({
        id: 500,
        user_id: 11,
        promotion_id: 5,
        phone_number: purchasePayload.phone_number,
        lead_id: purchasePayload.lead_id,
        customer_full_name: purchasePayload.full_name,
        status: 'Purchased',
        product_name: purchasePayload.product_name,
        referred_phone_number: null,
        processed_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      });
    CouponService.createCouponsForUser = async (params) => [
      {
        id: params.sourceType === 'purchase' ? 9001 : params.userId === 21 ? 9002 : 9003,
        code: params.sourceType === 'purchase' ? 'PRO1111' : params.userId === 21 ? 'PRO2222' : 'PRO3333',
        source_type: params.sourceType,
        expires_at: new Date('2026-04-30T00:00:00.000Z'),
        status: 'active',
        issued_phone_snapshot: params.phoneSnapshot,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ] as Awaited<ReturnType<typeof CouponService.createCouponsForUser>>;
    ReferralService.createOrIgnore = async () => null;
    ReferralService.listByReferredPhoneNumber = async () => [
      {
        id: 700,
        referrer_user_id: 21,
        referred_phone_number: purchasePayload.phone_number,
        referrer_full_name_snapshot: 'Referrer One',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 701,
        referrer_user_id: 31,
        referred_phone_number: purchasePayload.phone_number,
        referrer_full_name_snapshot: 'Second Referrer',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ] as Awaited<ReturnType<typeof ReferralService.listByReferredPhoneNumber>>;
    ReferralService.hasRewardForEvent = async () => false;
    ReferralService.recordReward = async () =>
      ({
        id: 800,
        referral_id: 700,
        registration_event_id: 500,
        rewarded_coupon_count: 1,
        created_at: new Date(),
        updated_at: new Date(),
      });
    BotNotificationService.sendTemplateMessage = async (params) => {
      notificationCalls.push({
        telegramId: params.user.telegram_id,
        templateType: params.templateType,
        customerName: String(params.placeholders.customer_name || ''),
        dispatchType: params.dispatchType,
      });

      return {
        delivered: true,
      };
    };

    const result = await CouponRegistrationService.process(purchasePayload);

    assert.equal(result.processed, true);
    assert.equal(result.reason, undefined);
    assert.equal(result.coupons.length, 3);
    assert.equal(notificationCalls.length, 3);
    assert.deepEqual(
      notificationCalls.map((call) => call.templateType),
      ['purchase', 'referral', 'referral'],
    );
    assert.ok(notificationCalls.every((call) => call.customerName === purchasePayload.full_name));
  } finally {
    CouponRegistrationService.runInTransaction = originalRunInTransaction;
    (redisService as unknown as { getClient: typeof redisService.getClient }).getClient = originalGetClient;
    (redisService as unknown as { get: typeof redisService.get }).get = originalGet;
    (redisService as unknown as { delete: typeof redisService.delete }).delete = originalDelete;
    PromotionService.getCurrentPromotion = originalGetCurrentPromotion;
    UserService.getUserByPhoneNumber = originalGetUserByPhoneNumber;
    UserService.getUsersByIds = originalGetUsersByIds;
    CouponRegistrationEventService.getByIdentity = originalGetByIdentity;
    CouponRegistrationEventService.create = originalCreateEvent;
    CouponService.createCouponsForUser = originalCreateCouponsForUser;
    ReferralService.createOrIgnore = originalCreateOrIgnore;
    ReferralService.listByReferredPhoneNumber = originalListByReferredPhoneNumber;
    ReferralService.hasRewardForEvent = originalHasRewardForEvent;
    ReferralService.recordReward = originalRecordReward;
    BotNotificationService.sendTemplateMessage = originalSendTemplateMessage;
  }
});

test('CouponRegistrationService returns duplicate_event_skipped for an already processed event', async () => {
  const originalGetClient = redisService.getClient;
  const originalGet = redisService.get;
  const originalDelete = redisService.delete;
  const originalGetCurrentPromotion = PromotionService.getCurrentPromotion;
  const originalGetUserByPhoneNumber = UserService.getUserByPhoneNumber;
  const originalGetByIdentity = CouponRegistrationEventService.getByIdentity;
  const originalCreateCouponsForUser = CouponService.createCouponsForUser;

  try {
    (redisService as unknown as { getClient: () => { set: (...args: unknown[]) => Promise<string> } }).getClient = () => ({
      set: async () => 'OK',
    });
    (redisService as unknown as { get: typeof redisService.get }).get = async <T>() => 'token' as T;
    (redisService as unknown as { delete: typeof redisService.delete }).delete = async () => 1;
    PromotionService.getCurrentPromotion = async () =>
      ({
        id: 5,
        slug: 'spring-sale',
      } as Awaited<ReturnType<typeof PromotionService.getCurrentPromotion>>);
    UserService.getUserByPhoneNumber = async () =>
      ({
        id: 11,
        telegram_id: 1111,
        phone_number: purchasePayload.phone_number,
        language_code: 'uz',
      } as Awaited<ReturnType<typeof UserService.getUserByPhoneNumber>>);
    CouponRegistrationEventService.getByIdentity = async () =>
      ({
        id: 500,
        user_id: 11,
        promotion_id: 5,
        phone_number: purchasePayload.phone_number,
        lead_id: purchasePayload.lead_id,
        customer_full_name: purchasePayload.full_name,
        status: 'Purchased',
        product_name: purchasePayload.product_name,
        referred_phone_number: null,
        processed_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      });
    CouponService.createCouponsForUser = async () => {
      throw new Error('createCouponsForUser should not be called for duplicate events');
    };

    const result = await CouponRegistrationService.process(purchasePayload);

    assert.equal(result.processed, true);
    assert.equal(result.reason, 'duplicate_event_skipped');
    assert.deepEqual(result.coupons, []);
    assert.deepEqual(result.delivery, []);
  } finally {
    (redisService as unknown as { getClient: typeof redisService.getClient }).getClient = originalGetClient;
    (redisService as unknown as { get: typeof redisService.get }).get = originalGet;
    (redisService as unknown as { delete: typeof redisService.delete }).delete = originalDelete;
    PromotionService.getCurrentPromotion = originalGetCurrentPromotion;
    UserService.getUserByPhoneNumber = originalGetUserByPhoneNumber;
    CouponRegistrationEventService.getByIdentity = originalGetByIdentity;
    CouponService.createCouponsForUser = originalCreateCouponsForUser;
  }
});
