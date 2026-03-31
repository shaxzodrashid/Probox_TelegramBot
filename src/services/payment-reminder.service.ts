import db from '../database/database';
import { SapService } from '../sap/sap-hana.service';
import { HanaService } from '../sap/hana.service';
import { formatDateForLocale, getTashkentDateKey } from '../utils/tashkent-time.util';
import { BotNotificationService } from './bot-notification.service';
import { CouponService } from './coupon.service';
import { IPurchaseInstallment } from '../interfaces/purchase.interface';
import { PromotionService } from './promotion.service';
import { UserService } from './user.service';
import { logger } from '../utils/logger';
import { bot } from '../bot';
import { getAdminMissingTemplateKeyboard } from '../keyboards/template.keyboards';

type ReminderType = 'd2' | 'd1' | 'd0';

type ReminderCandidate = {
  reminderType: ReminderType;
  installment: IPurchaseInstallment;
  userId: number;
  telegramId: number;
  locale: string;
  phoneNumber?: string;
  fullName: string;
};

export class PaymentReminderService {
  private static readonly sapService = new SapService(new HanaService());
  private static readonly reminderOffsets: Record<ReminderType, number> = {
    d2: 2,
    d1: 1,
    d0: 0,
  };

  private static getReminderTypeByDaysLeft(daysLeft: number): ReminderType | null {
    if (daysLeft === 2) return 'd2';
    if (daysLeft === 1) return 'd1';
    if (daysLeft === 0) return 'd0';
    return null;
  }

  private static toDayIndex(dateString: string): number {
    const date = new Date(dateString);
    return Math.floor(date.getTime() / 86_400_000);
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

  private static async upsertInstallmentState(installment: IPurchaseInstallment): Promise<void> {
    await db('payment_installment_state')
      .insert({
        sap_card_code: installment.CardCode,
        doc_entry: installment.DocEntry,
        installment_id: installment.InstlmntID,
        due_date: installment.InstDueDate,
        last_status: installment.InstStatus,
        last_paid_amount:
          typeof installment.InstPaidToDate === 'string'
            ? Number(installment.InstPaidToDate)
            : installment.InstPaidToDate,
        last_checked_at: new Date(),
      })
      .onConflict(['sap_card_code', 'doc_entry', 'installment_id'])
      .merge({
        due_date: installment.InstDueDate,
        last_status: installment.InstStatus,
        last_paid_amount:
          typeof installment.InstPaidToDate === 'string'
            ? Number(installment.InstPaidToDate)
            : installment.InstPaidToDate,
        last_checked_at: new Date(),
      });
  }

  private static async maybeIssueOnTimeReward(installment: IPurchaseInstallment): Promise<string | null> {
    const total = typeof installment.InstTotal === 'string' ? Number(installment.InstTotal) : installment.InstTotal;
    const paid =
      typeof installment.InstPaidToDate === 'string'
        ? Number(installment.InstPaidToDate)
        : installment.InstPaidToDate;

    if (paid < total) {
      return null;
    }

    const state = await db('payment_installment_state')
      .where({
        sap_card_code: installment.CardCode,
        doc_entry: installment.DocEntry,
        installment_id: installment.InstlmntID,
      })
      .first();

    if (state?.reward_issued_at) {
      return null;
    }

    const user = await UserService.getUserBySapCardCode(installment.CardCode);
    const promotion = await PromotionService.getCurrentPromotion();
    if (!user || !promotion) {
      return null;
    }

    const coupons = await CouponService.createCouponsForUser({
      userId: user.id,
      promotionId: promotion.id,
      sourceType: 'payment_on_time',
      phoneSnapshot: user.phone_number || '',
    });

    const firstCoupon = coupons[0];
    let missingTemplate: string | null = null;
    if (firstCoupon) {
      const result = await BotNotificationService.sendTemplateMessage({
        user,
        templateType: 'payment_paid_on_time',
        placeholders: {
          customer_name: [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Mijoz',
          coupon_code: firstCoupon.code,
          payment_due_date: formatDateForLocale(installment.InstDueDate, user.language_code || 'uz'),
          product_name: installment.itemsPairs || '',
          referrer_name: '',
          prize_name: '',
        },
        couponId: firstCoupon.id,
        dispatchType: 'payment_on_time',
      });

      if (!result.delivered && result.error?.includes('Template not found')) {
        missingTemplate = 'payment_paid_on_time';
      }
    }

    await db('payment_installment_state')
      .where({
        sap_card_code: installment.CardCode,
        doc_entry: installment.DocEntry,
        installment_id: installment.InstlmntID,
      })
      .update({
        reward_issued_at: new Date(),
        last_checked_at: new Date(),
      });

    return missingTemplate;
  }

  static async run(): Promise<{
    checkedCardCodes: number;
    fetchedInstallments: number;
    remindersSent: number;
  }> {
    await CouponService.expireStaleCoupons();

    const users = await UserService.getUsersWithSapCardCode();
    const uniqueCardCodes = Array.from(new Set(users.map((user) => user.sap_card_code).filter(Boolean))) as string[];

    if (uniqueCardCodes.length === 0) {
      return { checkedCardCodes: 0, fetchedInstallments: 0, remindersSent: 0 };
    }

    const installments = await this.sapService.getBatchPurchasesByCardCodes(uniqueCardCodes);
    const todayIndex = this.toDayIndex(getTashkentDateKey(new Date()));
    let remindersSent = 0;
    const missingTemplates = new Set<string>();

    for (const installment of installments) {
      await this.upsertInstallmentState(installment);
      const missing = await this.maybeIssueOnTimeReward(installment);
      if (missing) missingTemplates.add(missing);

      const user = users.find((candidate) => candidate.sap_card_code === installment.CardCode);
      if (!user) {
        continue;
      }

      const daysLeft = this.toDayIndex(installment.InstDueDate) - todayIndex;
      const reminderType = this.getReminderTypeByDaysLeft(daysLeft);
      if (!reminderType) {
        continue;
      }

      const alreadySent = await this.hasReminderBeenSent(
        user.id,
        installment.DocEntry,
        installment.InstlmntID,
        reminderType,
      );
      if (alreadySent) {
        continue;
      }

      const templateType = `payment_reminder_${reminderType}` as const;
      const result = await BotNotificationService.sendTemplateMessage({
        user,
        templateType,
        placeholders: {
          customer_name: [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Mijoz',
          coupon_code: '',
          payment_due_date: formatDateForLocale(installment.InstDueDate, user.language_code || 'uz'),
          product_name: installment.itemsPairs || '',
          referrer_name: '',
          prize_name: '',
        },
        dispatchType: templateType,
      });

      if (!result.delivered && result.error?.includes('Template not found')) {
        missingTemplates.add(templateType);
      }

      await this.logReminder({
        userId: user.id,
        sapCardCode: installment.CardCode,
        docEntry: installment.DocEntry,
        installmentId: installment.InstlmntID,
        reminderType,
        dueDate: installment.InstDueDate,
        status: result.delivered ? 'sent' : 'failed',
        errorMessage: result.error,
      });

      if (result.delivered) {
        remindersSent += 1;
      }
    }

    if (missingTemplates.size > 0) {
      const admins = await UserService.getAdmins();
      const templateList = Array.from(missingTemplates).join(', ');
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
        } catch (err) {
          logger.error(`Failed to send missing template warning to admin ${admin.telegram_id}`, err);
        }
      }
    }

    return {
      checkedCardCodes: uniqueCardCodes.length,
      fetchedInstallments: installments.length,
      remindersSent,
    };
  }
}
