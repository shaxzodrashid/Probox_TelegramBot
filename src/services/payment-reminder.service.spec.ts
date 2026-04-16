import assert from 'node:assert/strict';
import test from 'node:test';
import { BotNotificationService } from './bot-notification.service';
import { CouponService } from './coupon.service';
import { PaymentReminderService } from './payment-reminder.service';
import { PromotionService } from './promotion.service';
import { UserService } from './user.service';

test(
  'PaymentReminderService rewards April on-time payments for linked and unlinked SAP customers',
  { concurrency: false },
  async () => {
    const serviceClass = PaymentReminderService as unknown as {
      fetchInstallments: (window: { dueDateFrom: string; dueDateTo: string }) => Promise<unknown[]>;
      findExistingRewardCoupon: () => Promise<undefined>;
      hasReminderBeenSent: () => Promise<boolean>;
      logReminder: () => Promise<void>;
    };
    const originalFetchInstallments = serviceClass.fetchInstallments;
    const originalFindExistingRewardCoupon = serviceClass.findExistingRewardCoupon;
    const originalHasReminderBeenSent = serviceClass.hasReminderBeenSent;
    const originalLogReminder = serviceClass.logReminder;
    const originalExpireCoupons = CouponService.expireStaleCoupons;
    const originalCreateCoupons = CouponService.createCouponsForUser;
    const originalGetUsersWithSapCardCode = UserService.getUsersWithSapCardCode;
    const originalGetCurrentPromotion = PromotionService.getCurrentPromotion;
    const originalSendTemplateMessage = BotNotificationService.sendTemplateMessage;

    try {
      const createdCoupons: Array<{ userId?: number | null; phoneSnapshot: string }> = [];
      const notifications: Array<{ telegramId: number; dispatchType: string }> = [];

      serviceClass.fetchInstallments = async () => [
        {
          DocEntry: 101,
          DocNum: 5001,
          CardCode: 'C001',
          CardName: 'Linked Customer',
          DocDate: '2026-04-01',
          DocDueDate: '2026-04-08',
          DocCur: 'UZS',
          Total: 1000000,
          TotalPaid: 1000000,
          InstlmntID: 1,
          InstDueDate: '2026-04-08',
          InstTotal: 1000000,
          InstPaidToDate: 1000000,
          InstStatus: 'C',
          InstActualPaymentDate: '2026-04-08',
          itemsPairs: 'TV01::TV::1000000',
        },
        {
          DocEntry: 102,
          DocNum: 5002,
          CardCode: 'C002',
          CardName: 'SAP Only Customer',
          Phone1: '90 123 45 67',
          DocDate: '2026-04-01',
          DocDueDate: '2026-04-05',
          DocCur: 'UZS',
          Total: 800000,
          TotalPaid: 800000,
          InstlmntID: 1,
          InstDueDate: '2026-04-05',
          InstTotal: 800000,
          InstPaidToDate: 800000,
          InstStatus: 'C',
          InstActualPaymentDate: '2026-04-04',
          itemsPairs: 'WM01::Washing Machine::800000',
        },
      ];
      serviceClass.findExistingRewardCoupon = async () => undefined;
      serviceClass.hasReminderBeenSent = async () => false;
      serviceClass.logReminder = async () => undefined;
      CouponService.expireStaleCoupons = async () => 0;
      CouponService.createCouponsForUser = async (params) => {
        createdCoupons.push({
          userId: params.userId,
          phoneSnapshot: params.phoneSnapshot,
        });

        return [
          {
            id: createdCoupons.length,
            code: `PROTEST${createdCoupons.length}`,
            promotion_id: params.promotionId || null,
            registration_event_id: null,
            source_type: 'payment_on_time',
            status: 'active',
            issued_phone_snapshot: params.phoneSnapshot,
            sap_doc_entry: params.sapDocEntry || null,
            sap_installment_id: params.sapInstallmentId || null,
            expires_at: new Date('2026-05-10T00:00:00.000Z'),
            is_active: true,
            created_at: new Date('2026-04-10T00:00:00.000Z'),
            updated_at: new Date('2026-04-10T00:00:00.000Z'),
          },
        ];
      };
      UserService.getUsersWithSapCardCode = async () => [
        {
          id: 11,
          telegram_id: 998901234,
          first_name: 'Ali',
          last_name: 'Valiyev',
          phone_number: '+998901112233',
          sap_card_code: 'C001',
          language_code: 'uz',
          is_admin: false,
          created_at: new Date('2026-01-01T00:00:00.000Z'),
          updated_at: new Date('2026-01-01T00:00:00.000Z'),
        },
      ];
      PromotionService.getCurrentPromotion = async () => ({
        id: 77,
        slug: 'april',
        title_uz: 'Aprel',
        title_ru: 'Aprel',
        about_uz: 'Campaign',
        about_ru: 'Campaign',
        is_active: true,
        assign_coupons: true,
        created_at: new Date('2026-04-01T00:00:00.000Z'),
        updated_at: new Date('2026-04-01T00:00:00.000Z'),
      });
      BotNotificationService.sendTemplateMessage = async ({ user, dispatchType }) => {
        notifications.push({ telegramId: user.telegram_id, dispatchType });
        return { delivered: true };
      };

      const result = await PaymentReminderService.run({
        now: new Date('2026-04-10T09:00:00.000Z'),
        rewardMonth: '2026-04',
      });

      assert.equal(result.checkedCardCodes, 2);
      assert.equal(result.fetchedInstallments, 2);
      assert.equal(result.rewardCouponsIssued, 2);
      assert.equal(result.unlinkedRewardCouponsIssued, 1);
      assert.equal(result.rewardNotificationsSent, 1);
      assert.equal(result.reminderNotificationsSent, 0);
      assert.equal(result.remindersSent, 1);
      assert.equal(createdCoupons.length, 2);
      assert.equal(createdCoupons[0].userId, 11);
      assert.equal(createdCoupons[1].userId, undefined);
      assert.equal(createdCoupons[1].phoneSnapshot, '+998901234567');
      assert.deepEqual(notifications, [{ telegramId: 998901234, dispatchType: 'payment_on_time' }]);
    } finally {
      serviceClass.fetchInstallments = originalFetchInstallments;
      serviceClass.findExistingRewardCoupon = originalFindExistingRewardCoupon;
      serviceClass.hasReminderBeenSent = originalHasReminderBeenSent;
      serviceClass.logReminder = originalLogReminder;
      CouponService.expireStaleCoupons = originalExpireCoupons;
      CouponService.createCouponsForUser = originalCreateCoupons;
      UserService.getUsersWithSapCardCode = originalGetUsersWithSapCardCode;
      PromotionService.getCurrentPromotion = originalGetCurrentPromotion;
      BotNotificationService.sendTemplateMessage = originalSendTemplateMessage;
    }
  },
);

test(
  'PaymentReminderService falls back to DocDate when InstActualPaymentDate is missing',
  { concurrency: false },
  async () => {
    const serviceClass = PaymentReminderService as unknown as {
      fetchInstallments: (window: { dueDateFrom: string; dueDateTo: string }) => Promise<unknown[]>;
      findExistingRewardCoupon: () => Promise<undefined>;
      hasReminderBeenSent: () => Promise<boolean>;
      logReminder: () => Promise<void>;
    };
    const originalFetchInstallments = serviceClass.fetchInstallments;
    const originalFindExistingRewardCoupon = serviceClass.findExistingRewardCoupon;
    const originalHasReminderBeenSent = serviceClass.hasReminderBeenSent;
    const originalLogReminder = serviceClass.logReminder;
    const originalExpireCoupons = CouponService.expireStaleCoupons;
    const originalCreateCoupons = CouponService.createCouponsForUser;
    const originalGetUsersWithSapCardCode = UserService.getUsersWithSapCardCode;
    const originalGetCurrentPromotion = PromotionService.getCurrentPromotion;
    const originalSendTemplateMessage = BotNotificationService.sendTemplateMessage;

    try {
      const notifications: string[] = [];

      serviceClass.fetchInstallments = async () => [
        {
          DocEntry: 111,
          DocNum: 5101,
          CardCode: 'C010',
          CardName: 'DocDate Customer',
          DocDate: '2026-04-05',
          DocDueDate: '2026-04-08',
          DocCur: 'UZS',
          Total: 300000,
          TotalPaid: 300000,
          InstlmntID: 1,
          InstDueDate: '2026-04-08',
          InstTotal: 300000,
          InstPaidToDate: 300000,
          InstStatus: 'C',
          InstActualPaymentDate: undefined,
          itemsPairs: 'PH01::Phone::300000',
        },
      ];
      serviceClass.findExistingRewardCoupon = async () => undefined;
      serviceClass.hasReminderBeenSent = async () => false;
      serviceClass.logReminder = async () => undefined;
      CouponService.expireStaleCoupons = async () => 0;
      CouponService.createCouponsForUser = async () => [
        {
          id: 1,
          code: 'PRODOC1',
          promotion_id: 88,
          registration_event_id: null,
          source_type: 'payment_on_time',
          status: 'active',
          issued_phone_snapshot: '+998901112233',
          sap_doc_entry: 111,
          sap_installment_id: 1,
          expires_at: new Date('2026-05-10T00:00:00.000Z'),
          is_active: true,
          created_at: new Date('2026-04-10T00:00:00.000Z'),
          updated_at: new Date('2026-04-10T00:00:00.000Z'),
        },
      ];
      UserService.getUsersWithSapCardCode = async () => [
        {
          id: 12,
          telegram_id: 998901236,
          first_name: 'Sardor',
          last_name: 'Karimov',
          phone_number: '+998901112233',
          sap_card_code: 'C010',
          language_code: 'uz',
          is_admin: false,
          created_at: new Date('2026-01-01T00:00:00.000Z'),
          updated_at: new Date('2026-01-01T00:00:00.000Z'),
        },
      ];
      PromotionService.getCurrentPromotion = async () => ({
        id: 88,
        slug: 'april',
        title_uz: 'Aprel',
        title_ru: 'Aprel',
        about_uz: 'Campaign',
        about_ru: 'Campaign',
        is_active: true,
        assign_coupons: true,
        created_at: new Date('2026-04-01T00:00:00.000Z'),
        updated_at: new Date('2026-04-01T00:00:00.000Z'),
      });
      BotNotificationService.sendTemplateMessage = async ({ dispatchType }) => {
        notifications.push(dispatchType);
        return { delivered: true };
      };

      const result = await PaymentReminderService.run({
        now: new Date('2026-04-10T09:00:00.000Z'),
        rewardMonth: '2026-04',
      });

      assert.equal(result.rewardCouponsIssued, 1);
      assert.equal(result.rewardNotificationsSent, 1);
      assert.equal(result.reminderNotificationsSent, 0);
      assert.deepEqual(notifications, ['payment_on_time']);
    } finally {
      serviceClass.fetchInstallments = originalFetchInstallments;
      serviceClass.findExistingRewardCoupon = originalFindExistingRewardCoupon;
      serviceClass.hasReminderBeenSent = originalHasReminderBeenSent;
      serviceClass.logReminder = originalLogReminder;
      CouponService.expireStaleCoupons = originalExpireCoupons;
      CouponService.createCouponsForUser = originalCreateCoupons;
      UserService.getUsersWithSapCardCode = originalGetUsersWithSapCardCode;
      PromotionService.getCurrentPromotion = originalGetCurrentPromotion;
      BotNotificationService.sendTemplateMessage = originalSendTemplateMessage;
    }
  },
);

test(
  'PaymentReminderService sends reminder notifications only to linked Telegram users',
  { concurrency: false },
  async () => {
    const serviceClass = PaymentReminderService as unknown as {
      fetchInstallments: () => Promise<unknown[]>;
      findExistingRewardCoupon: () => Promise<undefined>;
      hasReminderBeenSent: () => Promise<boolean>;
      logReminder: (params: { reminderType: string }) => Promise<void>;
    };
    const originalFetchInstallments = serviceClass.fetchInstallments;
    const originalFindExistingRewardCoupon = serviceClass.findExistingRewardCoupon;
    const originalHasReminderBeenSent = serviceClass.hasReminderBeenSent;
    const originalLogReminder = serviceClass.logReminder;
    const originalExpireCoupons = CouponService.expireStaleCoupons;
    const originalCreateCoupons = CouponService.createCouponsForUser;
    const originalGetUsersWithSapCardCode = UserService.getUsersWithSapCardCode;
    const originalGetCurrentPromotion = PromotionService.getCurrentPromotion;
    const originalSendTemplateMessage = BotNotificationService.sendTemplateMessage;

    try {
      const loggedReminders: string[] = [];
      const notifications: string[] = [];

      serviceClass.fetchInstallments = async () => [
        {
          DocEntry: 201,
          DocNum: 6001,
          CardCode: 'C100',
          CardName: 'Linked Reminder Customer',
          DocDate: '2026-04-01',
          DocDueDate: '2026-04-11',
          DocCur: 'UZS',
          Total: 1000000,
          TotalPaid: 0,
          InstlmntID: 1,
          InstDueDate: '2026-04-11',
          InstTotal: 1000000,
          InstPaidToDate: 0,
          InstStatus: 'O',
          itemsPairs: 'TV02::TV::1000000',
        },
        {
          DocEntry: 202,
          DocNum: 6002,
          CardCode: 'C101',
          CardName: 'Unlinked Reminder Customer',
          Phone1: '90 555 66 77',
          DocDate: '2026-04-01',
          DocDueDate: '2026-04-11',
          DocCur: 'UZS',
          Total: 500000,
          TotalPaid: 0,
          InstlmntID: 1,
          InstDueDate: '2026-04-11',
          InstTotal: 500000,
          InstPaidToDate: 0,
          InstStatus: 'O',
          itemsPairs: 'AC01::AC::500000',
        },
        {
          DocEntry: 203,
          DocNum: 6003,
          CardCode: 'C100',
          CardName: 'Linked Reminder Customer',
          DocDate: '2026-04-01',
          DocDueDate: '2026-04-07',
          DocCur: 'UZS',
          Total: 400000,
          TotalPaid: 400000,
          InstlmntID: 2,
          InstDueDate: '2026-04-07',
          InstTotal: 400000,
          InstPaidToDate: 400000,
          InstStatus: 'C',
          InstActualPaymentDate: '2026-04-09',
          itemsPairs: 'SP01::Speaker::400000',
        },
      ];
      serviceClass.findExistingRewardCoupon = async () => undefined;
      serviceClass.hasReminderBeenSent = async () => false;
      serviceClass.logReminder = async ({ reminderType }) => {
        loggedReminders.push(reminderType);
      };
      CouponService.expireStaleCoupons = async () => 0;
      CouponService.createCouponsForUser = async () => [];
      UserService.getUsersWithSapCardCode = async () => [
        {
          id: 25,
          telegram_id: 998901235,
          first_name: 'Laylo',
          last_name: 'Karimova',
          phone_number: '+998909998877',
          sap_card_code: 'C100',
          language_code: 'uz',
          is_admin: false,
          created_at: new Date('2026-01-01T00:00:00.000Z'),
          updated_at: new Date('2026-01-01T00:00:00.000Z'),
        },
      ];
      PromotionService.getCurrentPromotion = async () => null;
      BotNotificationService.sendTemplateMessage = async ({ dispatchType }) => {
        notifications.push(dispatchType);
        return { delivered: true };
      };

      const result = await PaymentReminderService.run({
        now: new Date('2026-04-10T09:00:00.000Z'),
        rewardMonth: '2026-04',
      });

      assert.equal(result.rewardCouponsIssued, 0);
      assert.equal(result.rewardNotificationsSent, 0);
      assert.equal(result.reminderNotificationsSent, 2);
      assert.equal(result.remindersSent, 2);
      assert.deepEqual(notifications, ['payment_reminder_d1', 'payment_paid_late']);
      assert.deepEqual(loggedReminders, ['d1', 'paid_late']);
    } finally {
      serviceClass.fetchInstallments = originalFetchInstallments;
      serviceClass.findExistingRewardCoupon = originalFindExistingRewardCoupon;
      serviceClass.hasReminderBeenSent = originalHasReminderBeenSent;
      serviceClass.logReminder = originalLogReminder;
      CouponService.expireStaleCoupons = originalExpireCoupons;
      CouponService.createCouponsForUser = originalCreateCoupons;
      UserService.getUsersWithSapCardCode = originalGetUsersWithSapCardCode;
      PromotionService.getCurrentPromotion = originalGetCurrentPromotion;
      BotNotificationService.sendTemplateMessage = originalSendTemplateMessage;
    }
  },
);

test(
  'PaymentReminderService scopes on-time rewards to the configured reward month',
  { concurrency: false },
  async () => {
    const serviceClass = PaymentReminderService as unknown as {
      fetchInstallments: () => Promise<unknown[]>;
      findExistingRewardCoupon: () => Promise<undefined>;
    };
    const originalFetchInstallments = serviceClass.fetchInstallments;
    const originalFindExistingRewardCoupon = serviceClass.findExistingRewardCoupon;
    const originalGetUsersWithSapCardCode = UserService.getUsersWithSapCardCode;
    const originalGetCurrentPromotion = PromotionService.getCurrentPromotion;

    try {
      serviceClass.fetchInstallments = async () => [
        {
          DocEntry: 301,
          DocNum: 7001,
          CardCode: 'C300',
          CardName: 'March Customer',
          DocDate: '2026-03-01',
          DocDueDate: '2026-03-31',
          DocCur: 'UZS',
          Total: 700000,
          TotalPaid: 700000,
          InstlmntID: 1,
          InstDueDate: '2026-03-31',
          InstTotal: 700000,
          InstPaidToDate: 700000,
          InstStatus: 'C',
          InstActualPaymentDate: '2026-03-30',
          itemsPairs: 'FR01::Fridge::700000',
        },
      ];
      serviceClass.findExistingRewardCoupon = async () => undefined;
      UserService.getUsersWithSapCardCode = async () => [];
      PromotionService.getCurrentPromotion = async () => ({
        id: 78,
        slug: 'april',
        title_uz: 'Aprel',
        title_ru: 'Aprel',
        about_uz: 'Campaign',
        about_ru: 'Campaign',
        is_active: true,
        assign_coupons: true,
        created_at: new Date('2026-04-01T00:00:00.000Z'),
        updated_at: new Date('2026-04-01T00:00:00.000Z'),
      });

      const result = await PaymentReminderService.run({
        now: new Date('2026-04-10T09:00:00.000Z'),
        rewardMonth: '2026-04',
        dryRun: true,
      });

      assert.equal(result.rewardCouponsIssued, 0);
      assert.equal(result.rewardNotificationsSent, 0);
      assert.equal(result.checkedCardCodes, 1);
    } finally {
      serviceClass.fetchInstallments = originalFetchInstallments;
      serviceClass.findExistingRewardCoupon = originalFindExistingRewardCoupon;
      UserService.getUsersWithSapCardCode = originalGetUsersWithSapCardCode;
      PromotionService.getCurrentPromotion = originalGetCurrentPromotion;
    }
  },
);
