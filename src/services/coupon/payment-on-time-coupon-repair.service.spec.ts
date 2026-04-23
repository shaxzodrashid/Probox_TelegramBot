import assert from 'node:assert/strict';
import test from 'node:test';
import { BotNotificationService } from '../bot-notification.service';
import { UserService } from '../user.service';
import { CouponService } from './coupon.service';
import {
  PaymentOnTimeCouponRepairService,
} from './payment-on-time-coupon-repair.service';

test(
  'PaymentOnTimeCouponRepairService repairs exact orphaned coupons and only notifies active ones',
  async () => {
    const repairServiceClass = PaymentOnTimeCouponRepairService as unknown as {
      sapService: {
        getBatchPurchasesByCardCodes: (cardCodes: string[]) => Promise<unknown[]>;
      };
    };
    const originalGetBatchPurchases =
      repairServiceClass.sapService.getBatchPurchasesByCardCodes;
    const originalGetUsersWithSapCardCode = UserService.getUsersWithSapCardCode;
    const originalListPaymentOnTimeCouponsForRepair =
      CouponService.listPaymentOnTimeCouponsForRepair;
    const originalAttachCouponToUser = CouponService.attachCouponToUser;
    const originalHasSuccessfulDispatch = CouponService.hasSuccessfulDispatch;
    const originalSendTemplateMessage = BotNotificationService.sendTemplateMessage;

    const attachedCouponIds: number[] = [];
    const notificationCalls: Array<{ couponId?: number; dispatchType: string }> = [];

    try {
      repairServiceClass.sapService.getBatchPurchasesByCardCodes = async () => [
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
      ];
      UserService.getUsersWithSapCardCode = async () => [
        {
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
        },
      ];
      CouponService.listPaymentOnTimeCouponsForRepair = async () => [
        {
          id: 9501,
          code: 'PRO9501234',
          promotion_id: 5,
          registration_event_id: null,
          source_type: 'payment_on_time',
          status: 'active',
          issued_phone_snapshot: '+1617845',
          customer_full_name: 'AMINJONOVA FERUZA',
          sap_doc_entry: 24708,
          sap_installment_id: 6,
          expires_at: new Date('2026-05-11T00:00:00.000Z'),
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
          user_id: null,
        },
        {
          id: 9502,
          code: 'PRO9502234',
          promotion_id: 5,
          registration_event_id: null,
          source_type: 'payment_on_time',
          status: 'won',
          issued_phone_snapshot: '+1617845',
          customer_full_name: 'AMINJONOVA FERUZA',
          sap_doc_entry: 24708,
          sap_installment_id: 6,
          expires_at: new Date('2026-05-11T00:00:00.000Z'),
          is_active: false,
          created_at: new Date(),
          updated_at: new Date(),
          user_id: null,
        },
      ];
      CouponService.attachCouponToUser = async ({ couponId }) => {
        attachedCouponIds.push(couponId);
        return {
          attached: true,
          existingUserId: 11,
          coupon: {
            id: couponId,
            code: couponId === 9501 ? 'PRO9501234' : 'PRO9502234',
            promotion_id: 5,
            registration_event_id: null,
            source_type: 'payment_on_time',
            status: couponId === 9501 ? 'active' : 'won',
            issued_phone_snapshot: '+998919791468',
            customer_full_name: 'AMINJONOVA FERUZA',
            sap_doc_entry: 24708,
            sap_installment_id: 6,
            expires_at: new Date('2026-05-11T00:00:00.000Z'),
            is_active: couponId === 9501,
            created_at: new Date(),
            updated_at: new Date(),
          },
        };
      };
      CouponService.hasSuccessfulDispatch = async () => false;
      BotNotificationService.sendTemplateMessage = async (params) => {
        notificationCalls.push({
          couponId: params.couponId,
          dispatchType: params.dispatchType,
        });
        return {
          delivered: true,
        };
      };

      const result = await PaymentOnTimeCouponRepairService.repairHistoricalCoupons({
        dryRun: false,
        notify: true,
      });

      assert.equal(result.scannedCoupons, 2);
      assert.equal(result.repairableCoupons, 2);
      assert.equal(result.repairedCoupons, 2);
      assert.equal(result.notifiedCoupons, 1);
      assert.deepEqual(attachedCouponIds, [9501, 9502]);
      assert.deepEqual(notificationCalls, [
        {
          couponId: 9501,
          dispatchType: 'payment_on_time_recovery',
        },
      ]);
    } finally {
      repairServiceClass.sapService.getBatchPurchasesByCardCodes =
        originalGetBatchPurchases;
      UserService.getUsersWithSapCardCode = originalGetUsersWithSapCardCode;
      CouponService.listPaymentOnTimeCouponsForRepair =
        originalListPaymentOnTimeCouponsForRepair;
      CouponService.attachCouponToUser = originalAttachCouponToUser;
      CouponService.hasSuccessfulDispatch = originalHasSuccessfulDispatch;
      BotNotificationService.sendTemplateMessage = originalSendTemplateMessage;
    }
  },
);

test(
  'PaymentOnTimeCouponRepairService skips ambiguous, already mapped, and missing-owner coupons during dry run',
  async () => {
    const repairServiceClass = PaymentOnTimeCouponRepairService as unknown as {
      sapService: {
        getBatchPurchasesByCardCodes: (cardCodes: string[]) => Promise<unknown[]>;
      };
    };
    const originalGetBatchPurchases =
      repairServiceClass.sapService.getBatchPurchasesByCardCodes;
    const originalGetUsersWithSapCardCode = UserService.getUsersWithSapCardCode;
    const originalListPaymentOnTimeCouponsForRepair =
      CouponService.listPaymentOnTimeCouponsForRepair;

    try {
      repairServiceClass.sapService.getBatchPurchasesByCardCodes = async () => [
        {
          DocEntry: 30001,
          DocNum: 30001,
          CardCode: 'DUPLICATE01',
          CardName: 'Ambiguous Customer',
          DocDate: '2026-04-01',
          DocDueDate: '2026-04-30',
          DocCur: 'UZS',
          Total: 100,
          TotalPaid: 100,
          InstlmntID: 1,
          InstDueDate: '2026-04-10',
          InstTotal: 10,
          InstPaidToDate: 10,
          InstStatus: 'C',
          itemsPairs: 'ITEM::Name::100',
        },
      ];
      UserService.getUsersWithSapCardCode = async () => [
        {
          id: 21,
          telegram_id: 2121,
          first_name: 'A',
          last_name: 'One',
          phone_number: '+998901111111',
          sap_card_code: 'DUPLICATE01',
          language_code: 'uz',
          is_admin: false,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 22,
          telegram_id: 2222,
          first_name: 'A',
          last_name: 'Two',
          phone_number: '+998902222222',
          sap_card_code: 'DUPLICATE01',
          language_code: 'uz',
          is_admin: false,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];
      CouponService.listPaymentOnTimeCouponsForRepair = async () => [
        {
          id: 9601,
          code: 'PRO9601234',
          promotion_id: 5,
          registration_event_id: null,
          source_type: 'payment_on_time',
          status: 'active',
          issued_phone_snapshot: '+111',
          sap_doc_entry: 30001,
          sap_installment_id: 1,
          expires_at: new Date(),
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
          user_id: null,
        },
        {
          id: 9602,
          code: 'PRO9602234',
          promotion_id: 5,
          registration_event_id: null,
          source_type: 'payment_on_time',
          status: 'active',
          issued_phone_snapshot: '+111',
          sap_doc_entry: 40001,
          sap_installment_id: 1,
          expires_at: new Date(),
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
          user_id: null,
        },
        {
          id: 9603,
          code: 'PRO9603234',
          promotion_id: 5,
          registration_event_id: null,
          source_type: 'payment_on_time',
          status: 'active',
          issued_phone_snapshot: '+111',
          sap_doc_entry: 30001,
          sap_installment_id: 1,
          expires_at: new Date(),
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
          user_id: 99,
        },
      ];

      const result = await PaymentOnTimeCouponRepairService.repairHistoricalCoupons({
        dryRun: true,
        notify: false,
      });

      assert.equal(result.scannedCoupons, 3);
      assert.equal(result.alreadyMappedCoupons, 1);
      assert.equal(result.ambiguousCoupons, 1);
      assert.equal(result.missingOwnershipCoupons, 1);
      assert.equal(result.wouldRepairCoupons, 0);
      assert.equal(result.repairedCoupons, 0);
    } finally {
      repairServiceClass.sapService.getBatchPurchasesByCardCodes =
        originalGetBatchPurchases;
      UserService.getUsersWithSapCardCode = originalGetUsersWithSapCardCode;
      CouponService.listPaymentOnTimeCouponsForRepair =
        originalListPaymentOnTimeCouponsForRepair;
    }
  },
);
