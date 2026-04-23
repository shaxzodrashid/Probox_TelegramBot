import type { Knex } from 'knex';
import { IPurchaseInstallment } from '../../interfaces/purchase.interface';
import { SapService } from '../../sap/sap-hana.service';
import { HanaService } from '../../sap/hana.service';
import { formatItemsList } from '../../utils/formatting/items-formatter.util';
import { formatDateForLocale } from '../../utils/time/tashkent-time.util';
import { BotNotificationService } from '../bot-notification.service';
import { User, UserService } from '../user.service';
import {
  Coupon,
  CouponService,
  RepairablePaymentOnTimeCoupon,
} from './coupon.service';

type DbExecutor = Knex | Knex.Transaction;

export interface PaymentOnTimeCouponRepairDelivery {
  user_telegram_id: number;
  delivered: boolean;
  dispatch_type: string;
  error?: string;
}

export interface PaymentOnTimeCouponRepairSummary {
  scannedCoupons: number;
  missingInstallmentLinkCoupons: number;
  alreadyMappedCoupons: number;
  ambiguousCoupons: number;
  missingOwnershipCoupons: number;
  repairableCoupons: number;
  wouldRepairCoupons: number;
  repairedCoupons: number;
  skippedCoupons: number;
  notifiedCoupons: number;
  failedNotifications: number;
  sampleSkippedCoupons: Array<{
    couponCode: string;
    reason: string;
  }>;
}

interface InstallmentOwnership {
  installment: IPurchaseInstallment;
  user: User;
}

export class PaymentOnTimeCouponRepairService {
  private static readonly sapService = new SapService(new HanaService());
  private static readonly RECOVERY_DISPATCH_TYPE = 'payment_on_time_recovery';
  private static readonly SUCCESSFUL_DISPATCH_TYPES = ['payment_on_time', 'payment_on_time_recovery'];
  private static readonly SAMPLE_LIMIT = 20;

  static buildInstallmentKey(
    docEntry: number | string | null | undefined,
    installmentId: number | string | null | undefined,
  ): string | null {
    if (docEntry === null || docEntry === undefined || installmentId === null || installmentId === undefined) {
      return null;
    }

    return `${docEntry}:${installmentId}`;
  }

  static async getOwnedInstallmentsByKey(
    sapCardCode: string,
  ): Promise<Map<string, IPurchaseInstallment>> {
    if (!sapCardCode) {
      return new Map();
    }

    const installments = await this.sapService.getBPpurchasesByCardCode(sapCardCode);
    return this.buildInstallmentsByKey(installments);
  }

  static async assignOwnedCouponsToUser(
    params: {
      user: User;
      installmentsByKey: Map<string, IPurchaseInstallment>;
      executor?: DbExecutor;
    },
  ): Promise<Coupon[]> {
    if (params.installmentsByKey.size === 0) {
      return [];
    }

    const installmentPairs = Array.from(params.installmentsByKey.values()).map((installment) => ({
      docEntry: installment.DocEntry,
      installmentId: installment.InstlmntID,
    }));

    return CouponService.assignPaymentOnTimeCouponsByInstallments(
      {
        userId: params.user.id,
        installmentPairs,
        phoneNumber: params.user.phone_number,
      },
      params.executor,
    );
  }

  static async sendRecoveryNotificationsForUser(params: {
    user: User;
    coupons: Coupon[];
    installmentsByKey: Map<string, IPurchaseInstallment>;
  }): Promise<PaymentOnTimeCouponRepairDelivery[]> {
    const delivery: PaymentOnTimeCouponRepairDelivery[] = [];

    for (const coupon of params.coupons) {
      if (coupon.source_type !== 'payment_on_time' || coupon.status !== 'active') {
        continue;
      }

      const installmentKey = this.buildInstallmentKey(
        coupon.sap_doc_entry,
        coupon.sap_installment_id,
      );
      if (!installmentKey) {
        continue;
      }

      const installment = params.installmentsByKey.get(installmentKey);
      if (!installment) {
        continue;
      }

      const alreadyDelivered = await CouponService.hasSuccessfulDispatch(
        coupon.id,
        this.SUCCESSFUL_DISPATCH_TYPES,
      );
      if (alreadyDelivered) {
        continue;
      }

      const result = await this.sendRecoveryNotification({
        user: params.user,
        coupon,
        installment,
      });

      delivery.push({
        user_telegram_id: params.user.telegram_id,
        delivered: result.delivered,
        dispatch_type: this.RECOVERY_DISPATCH_TYPE,
        error: result.error,
      });
    }

    return delivery;
  }

  static async repairHistoricalCoupons(options: {
    dryRun: boolean;
    notify: boolean;
  }): Promise<PaymentOnTimeCouponRepairSummary> {
    const summary: PaymentOnTimeCouponRepairSummary = {
      scannedCoupons: 0,
      missingInstallmentLinkCoupons: 0,
      alreadyMappedCoupons: 0,
      ambiguousCoupons: 0,
      missingOwnershipCoupons: 0,
      repairableCoupons: 0,
      wouldRepairCoupons: 0,
      repairedCoupons: 0,
      skippedCoupons: 0,
      notifiedCoupons: 0,
      failedNotifications: 0,
      sampleSkippedCoupons: [],
    };

    const [users, coupons] = await Promise.all([
      UserService.getUsersWithSapCardCode(),
      CouponService.listPaymentOnTimeCouponsForRepair(),
    ]);

    summary.scannedCoupons = coupons.length;

    const usersByCardCode = this.buildUsersByCardCode(users);
    const uniqueCardCodes = Array.from(usersByCardCode.keys());
    const installments = await this.fetchInstallmentsForCardCodes(uniqueCardCodes);
    const { ownershipByKey, ambiguousKeys } = this.buildOwnershipIndex(installments, usersByCardCode);

    for (const coupon of coupons) {
      const installmentKey = this.buildInstallmentKey(
        coupon.sap_doc_entry,
        coupon.sap_installment_id,
      );

      if (!installmentKey) {
        summary.missingInstallmentLinkCoupons += 1;
        this.addSample(summary, coupon, 'missing_installment_link');
        continue;
      }

      if (coupon.user_id) {
        summary.alreadyMappedCoupons += 1;
        continue;
      }

      if (ambiguousKeys.has(installmentKey)) {
        summary.ambiguousCoupons += 1;
        this.addSample(summary, coupon, 'ambiguous_owner');
        continue;
      }

      const ownership = ownershipByKey.get(installmentKey);
      if (!ownership) {
        summary.missingOwnershipCoupons += 1;
        this.addSample(summary, coupon, 'missing_owner');
        continue;
      }

      summary.repairableCoupons += 1;

      if (options.dryRun) {
        summary.wouldRepairCoupons += 1;
        continue;
      }

      const attachResult = await CouponService.attachCouponToUser({
        couponId: coupon.id,
        userId: ownership.user.id,
        phoneNumber: ownership.user.phone_number,
      });

      if (!attachResult.attached) {
        summary.skippedCoupons += 1;
        this.addSample(summary, coupon, 'mapping_conflict');
        continue;
      }

      summary.repairedCoupons += 1;

      if (!options.notify || coupon.status !== 'active') {
        continue;
      }

      const alreadyDelivered = await CouponService.hasSuccessfulDispatch(
        coupon.id,
        this.SUCCESSFUL_DISPATCH_TYPES,
      );
      if (alreadyDelivered) {
        continue;
      }

      const result = await this.sendRecoveryNotification({
        user: ownership.user,
        coupon: attachResult.coupon || coupon,
        installment: ownership.installment,
      });

      if (result.delivered) {
        summary.notifiedCoupons += 1;
      } else {
        summary.failedNotifications += 1;
      }
    }

    return summary;
  }

  private static buildUsersByCardCode(users: User[]): Map<string, User[]> {
    const usersByCardCode = new Map<string, User[]>();

    for (const user of users) {
      const sapCardCode = user.sap_card_code?.trim();
      if (!sapCardCode) {
        continue;
      }

      const existing = usersByCardCode.get(sapCardCode) || [];
      existing.push(user);
      usersByCardCode.set(sapCardCode, existing);
    }

    return usersByCardCode;
  }

  private static async fetchInstallmentsForCardCodes(
    cardCodes: string[],
  ): Promise<IPurchaseInstallment[]> {
    if (cardCodes.length === 0) {
      return [];
    }

    const installments: IPurchaseInstallment[] = [];
    const chunkSize = 200;

    for (let index = 0; index < cardCodes.length; index += chunkSize) {
      const chunk = cardCodes.slice(index, index + chunkSize);
      const chunkInstallments = await this.sapService.getBatchPurchasesByCardCodes(chunk);
      installments.push(...chunkInstallments);
    }

    return installments;
  }

  private static buildOwnershipIndex(
    installments: IPurchaseInstallment[],
    usersByCardCode: Map<string, User[]>,
  ): {
    ownershipByKey: Map<string, InstallmentOwnership>;
    ambiguousKeys: Set<string>;
  } {
    const ownershipByKey = new Map<string, InstallmentOwnership>();
    const ambiguousKeys = new Set<string>();

    for (const installment of installments) {
      const installmentKey = this.buildInstallmentKey(
        installment.DocEntry,
        installment.InstlmntID,
      );
      if (!installmentKey) {
        continue;
      }

      const candidateUsers = usersByCardCode.get(installment.CardCode) || [];
      if (candidateUsers.length !== 1) {
        ambiguousKeys.add(installmentKey);
        ownershipByKey.delete(installmentKey);
        continue;
      }

      const candidateUser = candidateUsers[0];
      const existing = ownershipByKey.get(installmentKey);

      if (existing && existing.user.id !== candidateUser.id) {
        ambiguousKeys.add(installmentKey);
        ownershipByKey.delete(installmentKey);
        continue;
      }

      if (!ambiguousKeys.has(installmentKey)) {
        ownershipByKey.set(installmentKey, {
          installment,
          user: candidateUser,
        });
      }
    }

    return {
      ownershipByKey,
      ambiguousKeys,
    };
  }

  private static buildInstallmentsByKey(
    installments: IPurchaseInstallment[],
  ): Map<string, IPurchaseInstallment> {
    const installmentsByKey = new Map<string, IPurchaseInstallment>();

    for (const installment of installments) {
      const installmentKey = this.buildInstallmentKey(
        installment.DocEntry,
        installment.InstlmntID,
      );
      if (!installmentKey) {
        continue;
      }

      installmentsByKey.set(installmentKey, installment);
    }

    return installmentsByKey;
  }

  private static buildUserDisplayName(user: User): string {
    return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.phone_number || 'Mijoz';
  }

  private static async sendRecoveryNotification(params: {
    user: User;
    coupon: Coupon;
    installment: IPurchaseInstallment;
  }): Promise<{
    delivered: boolean;
    error?: string;
  }> {
    return BotNotificationService.sendTemplateMessage({
      user: params.user,
      templateType: 'payment_paid_on_time',
      placeholders: {
        customer_name: this.buildUserDisplayName(params.user),
        coupon_code: params.coupon.code,
        payment_due_date: formatDateForLocale(
          params.installment.InstDueDate,
          params.user.language_code || 'uz',
        ),
        product_name: formatItemsList(params.installment.itemsPairs) || '',
        referrer_name: '',
        prize_name: '',
      },
      couponId: params.coupon.id,
      dispatchType: this.RECOVERY_DISPATCH_TYPE,
    });
  }

  private static addSample(
    summary: PaymentOnTimeCouponRepairSummary,
    coupon: Pick<RepairablePaymentOnTimeCoupon, 'code'>,
    reason: string,
  ): void {
    if (summary.sampleSkippedCoupons.length >= this.SAMPLE_LIMIT) {
      return;
    }

    summary.sampleSkippedCoupons.push({
      couponCode: coupon.code,
      reason,
    });
  }
}
