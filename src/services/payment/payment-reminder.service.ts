import db from '../../database/database';
import { IPurchaseInstallment } from '../../interfaces/purchase.interface';
import { redisService } from '../../redis/redis.service';
import { SapService } from '../../sap/sap-hana.service';
import { HanaService } from '../../sap/hana.service';
import { getAdminMissingTemplateKeyboard } from '../../keyboards/template.keyboards';
import { formatDateForLocale, getTashkentDateKey } from '../../utils/time/tashkent-time.util';
import { formatUzPhone } from '../../utils/uz-phone.util';
import { logger } from '../../utils/logger';
import { BotNotificationService } from '../bot-notification.service';
import { Coupon, CouponService } from '../coupon/coupon.service';
import { Promotion, PromotionService } from '../coupon/promotion.service';
import { User, UserService } from '../user.service';
import { formatItemsList } from '../../utils/formatting/items-formatter.util';

type ReminderType = 'd2' | 'd1' | 'd0' | 'overdue' | 'paid_late';

interface ProcessingWindow {
  dueDateFrom: string;
  dueDateTo: string;
  rewardMonth: string;
  rewardMonthStart: string;
  rewardMonthEnd: string;
  todayKey: string;
  todayIndex: number;
}

interface LinkedUserContext {
  user: User;
  fullName: string;
  locale: string;
}

export interface PaymentReminderRunResult {
  checkedCardCodes: number;
  fetchedInstallments: number;
  remindersSent: number;
  reminderNotificationsSent: number;
  rewardCouponsIssued: number;
  rewardNotificationsSent: number;
  unlinkedRewardCouponsIssued: number;
  rewardTargetMonth: string;
  dueDateFrom: string;
  dueDateTo: string;
}

export class PaymentReminderRunAlreadyInProgressError extends Error {
  constructor() {
    super('Payment reminder run is already in progress');
    this.name = 'PaymentReminderRunAlreadyInProgressError';
  }
}

export class PaymentReminderService {
  private static readonly sapService = new SapService(new HanaService());
  private static readonly RUN_LOCK_KEY = 'lock:payment-reminder:run';
  private static readonly RUN_LOCK_TTL_SECONDS = 30 * 60;

  private static async getBot() {
    const botModule = await import('../../bot.js');
    return botModule.bot;
  }

  private static buildRunLockToken(): string {
    return `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  }

  private static async acquireRunLock(): Promise<string> {
    const token = this.buildRunLockToken();
    const result = await redisService
      .getClient()
      .set(this.RUN_LOCK_KEY, token, 'EX', this.RUN_LOCK_TTL_SECONDS, 'NX');

    if (result !== 'OK') {
      throw new PaymentReminderRunAlreadyInProgressError();
    }

    return token;
  }

  private static async releaseRunLock(token: string): Promise<void> {
    const currentToken = await redisService.get<string>(this.RUN_LOCK_KEY);
    if (currentToken === token) {
      await redisService.delete(this.RUN_LOCK_KEY);
    }
  }

  private static getReminderTypeByDaysLeft(daysLeft: number): ReminderType | null {
    if (daysLeft === 2) return 'd2';
    if (daysLeft === 1) return 'd1';
    if (daysLeft === 0) return 'd0';
    if (daysLeft === -1) return 'overdue';
    return null;
  }

  private static toDayIndex(dateString: string): number {
    const date = new Date(dateString);
    return Math.floor(date.getTime() / 86_400_000);
  }

  private static toMonthKey(date: Date): string {
    return getTashkentDateKey(date).slice(0, 7);
  }

  private static getMonthBounds(monthKey: string): { start: string; end: string } {
    const match = monthKey.match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      throw new Error(`PAYMENT_REWARD_TARGET_MONTH must use YYYY-MM format. Received: ${monthKey}`);
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const start = `${match[1]}-${match[2]}-01`;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate().toString().padStart(2, '0');

    return {
      start,
      end: `${match[1]}-${match[2]}-${lastDay}`,
    };
  }

  private static addDays(dateKey: string, days: number): string {
    const date = new Date(`${dateKey}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  private static buildProcessingWindow(now: Date, rewardMonthOverride?: string): ProcessingWindow {
    const todayKey = getTashkentDateKey(now);
    const todayIndex = this.toDayIndex(todayKey);
    const rewardMonth = rewardMonthOverride || process.env.PAYMENT_REWARD_TARGET_MONTH || this.toMonthKey(now);
    const rewardBounds = this.getMonthBounds(rewardMonth);
    const reminderWindowStart = this.addDays(todayKey, -1);
    const reminderWindowEnd = this.addDays(todayKey, 2);

    return {
      dueDateFrom: rewardBounds.start < reminderWindowStart ? rewardBounds.start : reminderWindowStart,
      dueDateTo: rewardBounds.end > reminderWindowEnd ? rewardBounds.end : reminderWindowEnd,
      rewardMonth,
      rewardMonthStart: rewardBounds.start,
      rewardMonthEnd: rewardBounds.end,
      todayKey,
      todayIndex,
    };
  }

  private static isInstallmentFullyPaid(installment: IPurchaseInstallment): boolean {
    const total =
      typeof installment.InstTotal === 'string' ? Number(installment.InstTotal) : installment.InstTotal;
    const paid =
      typeof installment.InstPaidToDate === 'string'
        ? Number(installment.InstPaidToDate)
        : installment.InstPaidToDate;

    return paid >= total;
  }

  private static getInstallmentPaymentDate(installment: IPurchaseInstallment): Date | null {
    const rawDate = installment.InstActualPaymentDate || installment.DocDate;

    if (!rawDate) {
      return null;
    }

    const paymentDate = new Date(rawDate);
    if (Number.isNaN(paymentDate.getTime())) {
      return null;
    }

    paymentDate.setHours(0, 0, 0, 0);
    return paymentDate;
  }

  private static isPaidOnTime(installment: IPurchaseInstallment): boolean {
    const paymentDate = this.getInstallmentPaymentDate(installment);
    if (!paymentDate) {
      return false;
    }

    const dueDate = new Date(installment.InstDueDate);
    dueDate.setHours(0, 0, 0, 0);

    return paymentDate <= dueDate;
  }

  private static isPaidLate(installment: IPurchaseInstallment): boolean {
    const paymentDate = this.getInstallmentPaymentDate(installment);
    if (!paymentDate) {
      return false;
    }

    const dueDate = new Date(installment.InstDueDate);
    dueDate.setHours(0, 0, 0, 0);

    return paymentDate > dueDate;
  }

  private static isInstallmentInRewardMonth(
    installment: IPurchaseInstallment,
    window: ProcessingWindow,
  ): boolean {
    return installment.InstDueDate >= window.rewardMonthStart && installment.InstDueDate <= window.rewardMonthEnd;
  }

  private static buildLinkedUserMap(users: User[]): Map<string, LinkedUserContext> {
    const map = new Map<string, LinkedUserContext>();

    for (const user of users) {
      if (!user.sap_card_code || map.has(user.sap_card_code)) {
        continue;
      }

      map.set(user.sap_card_code, {
        user,
        fullName: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.phone_number || 'Mijoz',
        locale: user.language_code || 'uz',
      });
    }

    return map;
  }

  private static getPhoneSnapshot(
    installment: IPurchaseInstallment,
    linkedUser?: LinkedUserContext,
  ): string {
    const candidates = [
      linkedUser?.user.phone_number,
      installment.Cellular,
      installment.Phone1,
      installment.Phone2,
    ];

    for (const candidate of candidates) {
      const formatted = formatUzPhone(candidate);
      if (formatted !== '-') {
        return formatted;
      }
    }

    logger.warn(
      `[PAYMENT_REMINDER] Missing phone snapshot for CardCode ${installment.CardCode}, DocEntry ${installment.DocEntry}, installment ${installment.InstlmntID}`,
    );
    return '';
  }

  private static async fetchInstallments(window: ProcessingWindow): Promise<IPurchaseInstallment[]> {
    return this.sapService.getPaymentReminderInstallments({
      dueDateFrom: window.dueDateFrom,
      dueDateTo: window.dueDateTo,
    });
  }

  private static async hasReminderBeenSent(
    userId: number,
    docEntry: number,
    installmentId: number,
    reminderType: ReminderType,
  ): Promise<boolean> {
    const existing = await db('payment_reminder_logs')
      .where({
        user_id: userId,
        doc_entry: docEntry,
        installment_id: installmentId,
        reminder_type: reminderType,
      })
      .first();

    return Boolean(existing);
  }

  private static async logReminder(params: {
    userId: number;
    sapCardCode: string;
    docEntry: number;
    installmentId: number;
    reminderType: ReminderType;
    dueDate: string;
    status: string;
    errorMessage?: string;
  }): Promise<void> {
    await db('payment_reminder_logs').insert({
      user_id: params.userId,
      sap_card_code: params.sapCardCode,
      doc_entry: params.docEntry,
      installment_id: params.installmentId,
      reminder_type: params.reminderType,
      due_date: params.dueDate,
      sent_at: new Date(),
      status: params.status,
      error_message: params.errorMessage || null,
    });
  }

  private static async findExistingRewardCoupon(
    installment: IPurchaseInstallment,
  ): Promise<Coupon | undefined> {
    const existingCoupon = await db<Coupon>('coupons')
      .where('source_type', 'payment_on_time')
      .andWhere('sap_doc_entry', installment.DocEntry)
      .andWhere('sap_installment_id', installment.InstlmntID)
      .first();

    return existingCoupon || undefined;
  }

  private static async notifyAdminsAboutMissingTemplates(missingTemplates: Set<string>): Promise<void> {
    if (missingTemplates.size === 0) {
      return;
    }

    const admins = await UserService.getAdmins();
    const templateList = Array.from(missingTemplates).join(', ');
    const bot = await this.getBot();

    for (const admin of admins) {
      try {
        await bot.api.sendMessage(
          admin.telegram_id,
          `⚠️ <b>Внимание!</b>\n\nНе найдены активные шаблоны сообщений для CRON-задачи платежных напоминаний:\n<code>${templateList}</code>\n\nПожалуйста, создайте их в админ-панели.`,
          {
            parse_mode: 'HTML',
            reply_markup: getAdminMissingTemplateKeyboard(admin.language_code || 'uz'),
          },
        );
      } catch (error) {
        logger.error(`Failed to send missing template warning to admin ${admin.telegram_id}`, error);
      }
    }
  }

  private static async issueOnTimeReward(params: {
    installment: IPurchaseInstallment;
    linkedUser?: LinkedUserContext;
    promotion: Promotion | null;
    window: ProcessingWindow;
    dryRun: boolean;
    missingTemplates: Set<string>;
  }): Promise<{ couponIssued: boolean; notificationSent: boolean }> {
    const { installment, linkedUser, promotion, window, dryRun, missingTemplates } = params;

    if (!this.isInstallmentInRewardMonth(installment, window)) {
      return { couponIssued: false, notificationSent: false };
    }

    if (!this.isInstallmentFullyPaid(installment) || !this.isPaidOnTime(installment)) {
      return { couponIssued: false, notificationSent: false };
    }

    const existingCoupon = await this.findExistingRewardCoupon(installment);
    if (existingCoupon) {
      return { couponIssued: false, notificationSent: false };
    }

    if (!promotion) {
      logger.warn(
        `[PAYMENT_REMINDER] No active promotion configured for on-time payment reward. Skipping DocEntry ${installment.DocEntry}, installment ${installment.InstlmntID}`,
      );
      return { couponIssued: false, notificationSent: false };
    }

    if (dryRun) {
      return { couponIssued: true, notificationSent: Boolean(linkedUser) };
    }

    const coupons = await CouponService.createCouponsForUser({
      userId: linkedUser?.user.id,
      promotionId: promotion.id,
      sourceType: 'payment_on_time',
      phoneSnapshot: this.getPhoneSnapshot(installment, linkedUser),
      customerFullName: linkedUser?.fullName || installment.CardName,
      sapDocEntry: installment.DocEntry,
      sapInstallmentId: installment.InstlmntID,
    });

    const firstCoupon = coupons[0];
    if (!linkedUser || !firstCoupon) {
      return { couponIssued: coupons.length > 0, notificationSent: false };
    }

    const result = await BotNotificationService.sendTemplateMessage({
      user: linkedUser.user,
      templateType: 'payment_paid_on_time',
      placeholders: {
        customer_name: linkedUser.fullName,
        coupon_code: firstCoupon.code,
        payment_due_date: formatDateForLocale(installment.InstDueDate, linkedUser.locale),
        product_name: formatItemsList(installment.itemsPairs) || '',
        referrer_name: '',
        prize_name: '',
      },
      couponId: firstCoupon.id,
      dispatchType: 'payment_on_time',
    });

    if (!result.delivered && result.error?.includes('Template not found')) {
      missingTemplates.add('payment_paid_on_time');
    }

    return { couponIssued: coupons.length > 0, notificationSent: result.delivered };
  }

  private static async processPaidLateReminder(params: {
    installment: IPurchaseInstallment;
    linkedUser: LinkedUserContext;
    dryRun: boolean;
    missingTemplates: Set<string>;
  }): Promise<boolean> {
    const { installment, linkedUser, dryRun, missingTemplates } = params;
    const alreadySent = await this.hasReminderBeenSent(
      linkedUser.user.id,
      installment.DocEntry,
      installment.InstlmntID,
      'paid_late',
    );

    if (alreadySent) {
      return false;
    }

    if (dryRun) {
      return true;
    }

    const result = await BotNotificationService.sendTemplateMessage({
      user: linkedUser.user,
      templateType: 'payment_paid_late',
      placeholders: {
        customer_name: linkedUser.fullName,
        coupon_code: '',
        payment_due_date: formatDateForLocale(installment.InstDueDate, linkedUser.locale),
        product_name: formatItemsList(installment.itemsPairs) || '',
        referrer_name: '',
        prize_name: '',
      },
      dispatchType: 'payment_paid_late',
    });

    if (!result.delivered && result.error?.includes('Template not found')) {
      missingTemplates.add('payment_paid_late');
    }

    await this.logReminder({
      userId: linkedUser.user.id,
      sapCardCode: installment.CardCode,
      docEntry: installment.DocEntry,
      installmentId: installment.InstlmntID,
      reminderType: 'paid_late',
      dueDate: installment.InstDueDate,
      status: result.delivered ? 'sent' : 'failed',
      errorMessage: result.error,
    });

    return result.delivered;
  }

  private static async processUnpaidReminder(params: {
    installment: IPurchaseInstallment;
    linkedUser: LinkedUserContext;
    reminderType: ReminderType;
    dryRun: boolean;
    missingTemplates: Set<string>;
  }): Promise<boolean> {
    const { installment, linkedUser, reminderType, dryRun, missingTemplates } = params;
    const alreadySent = await this.hasReminderBeenSent(
      linkedUser.user.id,
      installment.DocEntry,
      installment.InstlmntID,
      reminderType,
    );

    if (alreadySent) {
      return false;
    }

    if (dryRun) {
      return true;
    }

    const templateType = reminderType === 'overdue' ? 'payment_overdue' : `payment_reminder_${reminderType}`;
    const result = await BotNotificationService.sendTemplateMessage({
      user: linkedUser.user,
      templateType: templateType as 'payment_overdue' | 'payment_reminder_d2' | 'payment_reminder_d1' | 'payment_reminder_d0',
      placeholders: {
        customer_name: linkedUser.fullName,
        coupon_code: '',
        payment_due_date: formatDateForLocale(installment.InstDueDate, linkedUser.locale),
        product_name: formatItemsList(installment.itemsPairs) || '',
        referrer_name: '',
        prize_name: '',
      },
      dispatchType: templateType,
    });

    if (!result.delivered && result.error?.includes('Template not found')) {
      missingTemplates.add(templateType);
    }

    await this.logReminder({
      userId: linkedUser.user.id,
      sapCardCode: installment.CardCode,
      docEntry: installment.DocEntry,
      installmentId: installment.InstlmntID,
      reminderType,
      dueDate: installment.InstDueDate,
      status: result.delivered ? 'sent' : 'failed',
      errorMessage: result.error,
    });

    return result.delivered;
  }

  static async run(options?: {
    now?: Date;
    dryRun?: boolean;
    rewardMonth?: string;
  }): Promise<PaymentReminderRunResult> {
    const runLockToken = await this.acquireRunLock();
    const now = options?.now || new Date();
    const dryRun = options?.dryRun || false;
    const window = this.buildProcessingWindow(now, options?.rewardMonth);

    try {
      logger.info(
        `[PAYMENT_REMINDER] Starting run. dryRun=${dryRun} rewardMonth=${window.rewardMonth} dueDateFrom=${window.dueDateFrom} dueDateTo=${window.dueDateTo}`,
      );

      if (!dryRun) {
        await CouponService.expireStaleCoupons();
      }

      const [users, promotion, installments] = await Promise.all([
        UserService.getUsersWithSapCardCode(),
        PromotionService.getCurrentPromotion(now),
        this.fetchInstallments(window),
      ]);

      const linkedUsersByCardCode = this.buildLinkedUserMap(users);
      const checkedCardCodes = new Set(installments.map((installment) => installment.CardCode)).size;
      const missingTemplates = new Set<string>();

      let rewardCouponsIssued = 0;
      let rewardNotificationsSent = 0;
      let reminderNotificationsSent = 0;
      let unlinkedRewardCouponsIssued = 0;

      for (const installment of installments) {
        const linkedUser = linkedUsersByCardCode.get(installment.CardCode);

        if (this.isInstallmentInRewardMonth(installment, window)) {
          const rewardResult = await this.issueOnTimeReward({
            installment,
            linkedUser,
            promotion,
            window,
            dryRun,
            missingTemplates,
          });

          if (rewardResult.couponIssued) {
            rewardCouponsIssued += 1;
            if (!linkedUser) {
              unlinkedRewardCouponsIssued += 1;
            }
          }

          if (rewardResult.notificationSent) {
            rewardNotificationsSent += 1;
          }
        }

        if (!linkedUser) {
          continue;
        }

        if (this.isInstallmentFullyPaid(installment)) {
          if (this.isPaidLate(installment)) {
            const delivered = await this.processPaidLateReminder({
              installment,
              linkedUser,
              dryRun,
              missingTemplates,
            });

            if (delivered) {
              reminderNotificationsSent += 1;
            }
          }

          continue;
        }

        const daysLeft = this.toDayIndex(installment.InstDueDate) - window.todayIndex;
        const reminderType = this.getReminderTypeByDaysLeft(daysLeft);
        if (!reminderType) {
          continue;
        }

        const delivered = await this.processUnpaidReminder({
          installment,
          linkedUser,
          reminderType,
          dryRun,
          missingTemplates,
        });

        if (delivered) {
          reminderNotificationsSent += 1;
        }
      }

      if (!dryRun) {
        await this.notifyAdminsAboutMissingTemplates(missingTemplates);
      }

      return {
        checkedCardCodes,
        fetchedInstallments: installments.length,
        remindersSent: rewardNotificationsSent + reminderNotificationsSent,
        reminderNotificationsSent,
        rewardCouponsIssued,
        rewardNotificationsSent,
        unlinkedRewardCouponsIssued,
        rewardTargetMonth: window.rewardMonth,
        dueDateFrom: window.dueDateFrom,
        dueDateTo: window.dueDateTo,
      };
    } finally {
      await this.releaseRunLock(runLockToken);
    }
  }
}
