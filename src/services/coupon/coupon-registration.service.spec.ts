import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { redisService } from '../../redis/redis.service';
import { BotNotificationService } from '../bot-notification.service';
import { CouponRegistrationEventService } from './coupon-registration-event.service';
import { CouponRegistrationService } from './coupon-registration.service';
import { CouponService } from './coupon.service';
import { PaymentOnTimeCouponRepairService } from './payment-on-time-coupon-repair.service';
import { PromotionService } from './promotion.service';
import { ReferralService } from './referral.service';
import { UserService } from '../user.service';

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
    CouponRegistrationService.runInTransaction = async <T>(
      callback: (trx: never) => Promise<T>,
    ): Promise<T> => callback({} as never);
    (
      redisService as unknown as {
        getClient: () => { set: (...args: unknown[]) => Promise<string> };
      }
    ).getClient = () => ({
      set: async () => 'OK',
    });
    (redisService as unknown as { get: typeof redisService.get }).get = async <T>() => 'token' as T;
    (redisService as unknown as { delete: typeof redisService.delete }).delete = async () => 1;
    PromotionService.getCurrentPromotion = async () =>
      ({
        id: 5,
        slug: 'spring-sale',
      }) as Awaited<ReturnType<typeof PromotionService.getCurrentPromotion>>;
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
    CouponRegistrationEventService.create = async () => ({
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
    CouponService.createCouponsForUser = async (params) =>
      [
        {
          id: params.sourceType === 'purchase' ? 9001 : params.userId === 21 ? 9002 : 9003,
          code:
            params.sourceType === 'purchase'
              ? 'PRO1111111'
              : params.userId === 21
                ? 'PRO2222222'
                : 'PRO3333333',
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
    ReferralService.listByReferredPhoneNumber = async () =>
      [
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
    ReferralService.recordReward = async () => ({
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
    (redisService as unknown as { getClient: typeof redisService.getClient }).getClient =
      originalGetClient;
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
    (
      redisService as unknown as {
        getClient: () => { set: (...args: unknown[]) => Promise<string> };
      }
    ).getClient = () => ({
      set: async () => 'OK',
    });
    (redisService as unknown as { get: typeof redisService.get }).get = async <T>() => 'token' as T;
    (redisService as unknown as { delete: typeof redisService.delete }).delete = async () => 1;
    PromotionService.getCurrentPromotion = async () =>
      ({
        id: 5,
        slug: 'spring-sale',
      }) as Awaited<ReturnType<typeof PromotionService.getCurrentPromotion>>;
    UserService.getUserByPhoneNumber = async () =>
      ({
        id: 11,
        telegram_id: 1111,
        phone_number: purchasePayload.phone_number,
        language_code: 'uz',
      }) as Awaited<ReturnType<typeof UserService.getUserByPhoneNumber>>;
    CouponRegistrationEventService.getByIdentity = async () => ({
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
    (redisService as unknown as { getClient: typeof redisService.getClient }).getClient =
      originalGetClient;
    (redisService as unknown as { get: typeof redisService.get }).get = originalGet;
    (redisService as unknown as { delete: typeof redisService.delete }).delete = originalDelete;
    PromotionService.getCurrentPromotion = originalGetCurrentPromotion;
    UserService.getUserByPhoneNumber = originalGetUserByPhoneNumber;
    CouponRegistrationEventService.getByIdentity = originalGetByIdentity;
    CouponService.createCouponsForUser = originalCreateCouponsForUser;
  }
});

test('CouponRegistrationService creates coupons for later assignment when user is not found', async () => {
  const originalRunInTransaction = CouponRegistrationService.runInTransaction;
  const originalGetClient = redisService.getClient;
  const originalGet = redisService.get;
  const originalDelete = redisService.delete;
  const originalGetCurrentPromotion = PromotionService.getCurrentPromotion;
  const originalGetUserByPhoneNumber = UserService.getUserByPhoneNumber;
  const originalGetByIdentity = CouponRegistrationEventService.getByIdentity;
  const originalCreateEvent = CouponRegistrationEventService.create;
  const originalCreateCouponsForUser = CouponService.createCouponsForUser;
  const originalListByReferredPhoneNumber = ReferralService.listByReferredPhoneNumber;
  const originalSendTemplateMessage = BotNotificationService.sendTemplateMessage;

  try {
    CouponRegistrationService.runInTransaction = async <T>(
      callback: (trx: never) => Promise<T>,
    ): Promise<T> => callback({} as never);
    (
      redisService as unknown as {
        getClient: () => { set: (...args: unknown[]) => Promise<string> };
      }
    ).getClient = () => ({
      set: async () => 'OK',
    });
    (redisService as unknown as { get: typeof redisService.get }).get = async <T>() => 'token' as T;
    (redisService as unknown as { delete: typeof redisService.delete }).delete = async () => 1;
    PromotionService.getCurrentPromotion = async () =>
      ({
        id: 5,
        slug: 'spring-sale',
      }) as Awaited<ReturnType<typeof PromotionService.getCurrentPromotion>>;
    UserService.getUserByPhoneNumber = async () => null;
    CouponRegistrationEventService.getByIdentity = async () => null;
    CouponRegistrationEventService.create = async () => ({
      id: 501,
      user_id: null,
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
    CouponService.createCouponsForUser = async () =>
      [
        {
          id: 9101,
          code: 'PRO9101234',
          source_type: 'purchase',
          expires_at: new Date('2026-04-30T00:00:00.000Z'),
          status: 'active',
          issued_phone_snapshot: purchasePayload.phone_number,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ] as Awaited<ReturnType<typeof CouponService.createCouponsForUser>>;
    ReferralService.listByReferredPhoneNumber = async () => [];
    BotNotificationService.sendTemplateMessage = async () => {
      throw new Error('sendTemplateMessage should not be called while user is unregistered');
    };

    const result = await CouponRegistrationService.process(purchasePayload);

    assert.equal(result.processed, true);
    assert.equal(result.reason, 'pending_user_assignment');
    assert.equal(result.user, undefined);
    assert.equal(result.coupons.length, 1);
    assert.deepEqual(result.delivery, []);
  } finally {
    CouponRegistrationService.runInTransaction = originalRunInTransaction;
    (redisService as unknown as { getClient: typeof redisService.getClient }).getClient =
      originalGetClient;
    (redisService as unknown as { get: typeof redisService.get }).get = originalGet;
    (redisService as unknown as { delete: typeof redisService.delete }).delete = originalDelete;
    PromotionService.getCurrentPromotion = originalGetCurrentPromotion;
    UserService.getUserByPhoneNumber = originalGetUserByPhoneNumber;
    CouponRegistrationEventService.getByIdentity = originalGetByIdentity;
    CouponRegistrationEventService.create = originalCreateEvent;
    CouponService.createCouponsForUser = originalCreateCouponsForUser;
    ReferralService.listByReferredPhoneNumber = originalListByReferredPhoneNumber;
    BotNotificationService.sendTemplateMessage = originalSendTemplateMessage;
  }
});

test('CouponRegistrationService claims pending coupons after user registration', async () => {
  const originalRunInTransaction = CouponRegistrationService.runInTransaction;
  const originalAssignPendingEventsToUser =
    CouponRegistrationEventService.assignPendingEventsToUser;
  const originalAssignPendingCouponsToUser = CouponService.assignPendingCouponsToUser;
  const originalCreateOrIgnore = ReferralService.createOrIgnore;
  const originalSendTemplateMessage = BotNotificationService.sendTemplateMessage;

  const referralCalls: Array<{ referredPhoneNumber: string }> = [];

  try {
    CouponRegistrationService.runInTransaction = async <T>(
      callback: (trx: never) => Promise<T>,
    ): Promise<T> => callback({} as never);
    CouponRegistrationEventService.assignPendingEventsToUser = async () => [
      {
        id: 601,
        user_id: 11,
        promotion_id: 5,
        phone_number: '+998901111111',
        lead_id: 'lead-100',
        customer_full_name: 'Buyer From API',
        status: 'Purchased',
        product_name: 'Air Conditioner',
        referred_phone_number: '+998909999999',
        processed_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];
    CouponService.assignPendingCouponsToUser = async () => [
      {
        id: 9201,
        code: 'PRO9201234',
        promotion_id: 5,
        registration_event_id: 601,
        source_type: 'purchase',
        status: 'active',
        issued_phone_snapshot: '901111111',
        lead_id: 'lead-100',
        customer_full_name: 'Buyer From API',
        expires_at: new Date('2026-04-30T00:00:00.000Z'),
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];
    ReferralService.createOrIgnore = async (params) => {
      referralCalls.push({ referredPhoneNumber: params.referredPhoneNumber });
      return null;
    };
    BotNotificationService.sendTemplateMessage = async () => ({
      delivered: true,
    });

    const result = await CouponRegistrationService.claimPendingCouponsForUser({
      id: 11,
      telegram_id: 1111,
      first_name: 'Stored',
      last_name: 'Buyer',
      phone_number: '+998901111111',
      language_code: 'uz',
      is_admin: false,
      created_at: new Date(),
      updated_at: new Date(),
    });

    assert.equal(result.coupons.length, 1);
    assert.equal(result.delivery.length, 1);
    assert.deepEqual(referralCalls, [{ referredPhoneNumber: '+998909999999' }]);
  } finally {
    CouponRegistrationService.runInTransaction = originalRunInTransaction;
    CouponRegistrationEventService.assignPendingEventsToUser = originalAssignPendingEventsToUser;
    CouponService.assignPendingCouponsToUser = originalAssignPendingCouponsToUser;
    ReferralService.createOrIgnore = originalCreateOrIgnore;
    BotNotificationService.sendTemplateMessage = originalSendTemplateMessage;
  }
});

test(
  'CouponRegistrationService claims orphaned payment_on_time coupons by SAP installment ownership',
  async () => {
    const originalRunInTransaction = CouponRegistrationService.runInTransaction;
    const originalAssignPendingEventsToUser =
      CouponRegistrationEventService.assignPendingEventsToUser;
    const originalAssignPendingCouponsToUser = CouponService.assignPendingCouponsToUser;
    const originalAssignPaymentOnTimeCouponsByInstallments =
      CouponService.assignPaymentOnTimeCouponsByInstallments;
    const originalGetOwnedInstallmentsByKey =
      PaymentOnTimeCouponRepairService.getOwnedInstallmentsByKey;
    const originalSendRecoveryNotificationsForUser =
      PaymentOnTimeCouponRepairService.sendRecoveryNotificationsForUser;

    const capturedPairs: Array<{ docEntry: number; installmentId: number }> = [];

    try {
      CouponRegistrationService.runInTransaction = async <T>(
        callback: (trx: never) => Promise<T>,
      ): Promise<T> => callback({} as never);
      CouponRegistrationEventService.assignPendingEventsToUser = async () => [];
      CouponService.assignPendingCouponsToUser = async () => [];
      PaymentOnTimeCouponRepairService.getOwnedInstallmentsByKey = async () =>
        new Map([
          [
            '24708:6',
            {
              DocEntry: 24708,
              DocNum: 23474,
              CardCode: 'BP251108133837G',
              CardName: 'AMINJONOVA FERUZA',
              DocDate: '2025-11-08',
              DocDueDate: '2027-02-11',
              DocCur: 'UZS',
              Total: 100,
              TotalPaid: 50,
              InstlmntID: 6,
              InstDueDate: '2026-04-11',
              InstTotal: 10,
              InstPaidToDate: 10,
              InstStatus: 'C',
              itemsPairs: 'APPLE0022::iPhone 14 Pro Max 128GB nano-SIM B/U::12500266.4',
            },
          ],
        ]);
      CouponService.assignPaymentOnTimeCouponsByInstallments = async (params) => {
        capturedPairs.push(...params.installmentPairs);
        return [
          {
            id: 9301,
            code: 'PRO9301234',
            promotion_id: 5,
            registration_event_id: null,
            source_type: 'payment_on_time',
            status: 'active',
            issued_phone_snapshot: params.phoneNumber || '',
            sap_doc_entry: 24708,
            sap_installment_id: 6,
            expires_at: new Date('2026-05-11T00:00:00.000Z'),
            is_active: true,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ];
      };
      PaymentOnTimeCouponRepairService.sendRecoveryNotificationsForUser = async () => [];

      const result = await CouponRegistrationService.claimPendingCouponsForUser({
        id: 11,
        telegram_id: 1111,
        first_name: 'Feruza',
        last_name: 'Aminjonova',
        phone_number: '+998919791468',
        sap_card_code: 'BP251108133837G',
        language_code: 'uz',
        is_admin: false,
        created_at: new Date(),
        updated_at: new Date(),
      });

      assert.equal(result.coupons.length, 1);
      assert.deepEqual(capturedPairs, [{ docEntry: 24708, installmentId: 6 }]);
    } finally {
      CouponRegistrationService.runInTransaction = originalRunInTransaction;
      CouponRegistrationEventService.assignPendingEventsToUser = originalAssignPendingEventsToUser;
      CouponService.assignPendingCouponsToUser = originalAssignPendingCouponsToUser;
      CouponService.assignPaymentOnTimeCouponsByInstallments =
        originalAssignPaymentOnTimeCouponsByInstallments;
      PaymentOnTimeCouponRepairService.getOwnedInstallmentsByKey =
        originalGetOwnedInstallmentsByKey;
      PaymentOnTimeCouponRepairService.sendRecoveryNotificationsForUser =
        originalSendRecoveryNotificationsForUser;
    }
  },
);

test(
  'CouponRegistrationService sends one payment_on_time recovery notification and skips sent or inactive coupons',
  async () => {
    const originalRunInTransaction = CouponRegistrationService.runInTransaction;
    const originalAssignPendingEventsToUser =
      CouponRegistrationEventService.assignPendingEventsToUser;
    const originalAssignPendingCouponsToUser = CouponService.assignPendingCouponsToUser;
    const originalAssignPaymentOnTimeCouponsByInstallments =
      CouponService.assignPaymentOnTimeCouponsByInstallments;
    const originalGetOwnedInstallmentsByKey =
      PaymentOnTimeCouponRepairService.getOwnedInstallmentsByKey;
    const originalHasSuccessfulDispatch = CouponService.hasSuccessfulDispatch;
    const originalSendTemplateMessage = BotNotificationService.sendTemplateMessage;

    const notificationCalls: Array<{ couponId?: number; dispatchType: string }> = [];

    try {
      CouponRegistrationService.runInTransaction = async <T>(
        callback: (trx: never) => Promise<T>,
      ): Promise<T> => callback({} as never);
      CouponRegistrationEventService.assignPendingEventsToUser = async () => [];
      CouponService.assignPendingCouponsToUser = async () => [];
      PaymentOnTimeCouponRepairService.getOwnedInstallmentsByKey = async () =>
        new Map([
          [
            '24708:6',
            {
              DocEntry: 24708,
              DocNum: 23474,
              CardCode: 'BP251108133837G',
              CardName: 'AMINJONOVA FERUZA',
              DocDate: '2025-11-08',
              DocDueDate: '2027-02-11',
              DocCur: 'UZS',
              Total: 100,
              TotalPaid: 50,
              InstlmntID: 6,
              InstDueDate: '2026-04-11',
              InstTotal: 10,
              InstPaidToDate: 10,
              InstStatus: 'C',
              itemsPairs: 'APPLE0022::iPhone 14 Pro Max 128GB nano-SIM B/U::12500266.4',
            },
          ],
        ]);
      CouponService.assignPaymentOnTimeCouponsByInstallments = async () => [
        {
          id: 9401,
          code: 'PRO9401234',
          promotion_id: 5,
          registration_event_id: null,
          source_type: 'payment_on_time',
          status: 'active',
          issued_phone_snapshot: '+998919791468',
          sap_doc_entry: 24708,
          sap_installment_id: 6,
          expires_at: new Date('2026-05-11T00:00:00.000Z'),
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 9402,
          code: 'PRO9402234',
          promotion_id: 5,
          registration_event_id: null,
          source_type: 'payment_on_time',
          status: 'active',
          issued_phone_snapshot: '+998919791468',
          sap_doc_entry: 24708,
          sap_installment_id: 6,
          expires_at: new Date('2026-05-11T00:00:00.000Z'),
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 9403,
          code: 'PRO9403234',
          promotion_id: 5,
          registration_event_id: null,
          source_type: 'payment_on_time',
          status: 'won',
          issued_phone_snapshot: '+998919791468',
          sap_doc_entry: 24708,
          sap_installment_id: 6,
          expires_at: new Date('2026-05-11T00:00:00.000Z'),
          is_active: false,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];
      CouponService.hasSuccessfulDispatch = async (couponId: number) => couponId === 9402;
      BotNotificationService.sendTemplateMessage = async (params) => {
        notificationCalls.push({
          couponId: params.couponId,
          dispatchType: params.dispatchType,
        });
        return {
          delivered: true,
        };
      };

      const result = await CouponRegistrationService.claimPendingCouponsForUser({
        id: 11,
        telegram_id: 1111,
        first_name: 'Feruza',
        last_name: 'Aminjonova',
        phone_number: '+998919791468',
        sap_card_code: 'BP251108133837G',
        language_code: 'uz',
        is_admin: false,
        created_at: new Date(),
        updated_at: new Date(),
      });

      assert.equal(result.coupons.length, 3);
      assert.equal(result.delivery.length, 1);
      assert.deepEqual(notificationCalls, [
        {
          couponId: 9401,
          dispatchType: 'payment_on_time_recovery',
        },
      ]);
    } finally {
      CouponRegistrationService.runInTransaction = originalRunInTransaction;
      CouponRegistrationEventService.assignPendingEventsToUser = originalAssignPendingEventsToUser;
      CouponService.assignPendingCouponsToUser = originalAssignPendingCouponsToUser;
      CouponService.assignPaymentOnTimeCouponsByInstallments =
        originalAssignPaymentOnTimeCouponsByInstallments;
      PaymentOnTimeCouponRepairService.getOwnedInstallmentsByKey =
        originalGetOwnedInstallmentsByKey;
      CouponService.hasSuccessfulDispatch = originalHasSuccessfulDispatch;
      BotNotificationService.sendTemplateMessage = originalSendTemplateMessage;
    }
  },
);
