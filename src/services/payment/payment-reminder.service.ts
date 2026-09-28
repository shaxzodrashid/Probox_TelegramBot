import { MessageTemplate, MessageTemplateService } from '../message-template.service';
import db from '../../database/database';
import { IPurchaseInstallment } from '../../interfaces/purchase.interface';
import { redisService } from '../../redis/redis.service';
import { SapService } from '../../sap/sap-hana.service';
import { HanaService } from '../../sap/hana.service';
import { getAdminMissingTemplateKeyboard } from '../../keyboards/template.keyboards';
import { formatDateForLocale, getTashkentDateKey } from '../../utils/time/tashkent-time.util';
import { logger } from '../../utils/logger';
import { BotNotificationService } from '../bot-notification.service';
import { User, UserService } from '../user.service';
import { formatItemsList } from '../../utils/formatting/items-formatter.util';

type ReminderType = 'd2' | 'd1' | 'd0' | 'overdue' | 'paid_late';

interface ProcessingWindow {
  dueDateFrom: string;
  dueDateTo: string;
  processingMonth: string;
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
  /** Legacy summary fields retained for consumers; rewards are permanently disabled. */
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
      throw new Error(`Processing month must use YYYY-MM format. Received: ${monthKey}`);
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

  private static buildProcessingWindow(now: Date): ProcessingWindow {
    const todayKey = getTashkentDateKey(now);
    const todayIndex = this.toDayIndex(todayKey);
    const processingMonth = this.toMonthKey(now);
    const monthBounds = this.getMonthBounds(processingMonth);
    const reminderWindowStart = this.addDays(todayKey, -1);
    const reminderWindowEnd = this.addDays(todayKey, 2);

    return {
      dueDateFrom:
        monthBounds.start < reminderWindowStart ? monthBounds.start : reminderWindowStart,
      dueDateTo: monthBounds.end > reminderWindowEnd ? monthBounds.end : reminderWindowEnd,
      processingMonth,
      todayIndex,
    };
  }

  private static isInstallmentFullyPaid(installment: IPurchaseInstallment): boolean {
    const total =
      typeof installment.InstTotal === 'string'
        ? Number(installment.InstTotal)
        : installment.InstTotal;
    const rawPaid = installment.InstPaidToDate ?? installment.InstPaidSys ?? 0;
    const paid = typeof rawPaid === 'string' ? Number(rawPaid) : rawPaid;

    return paid >= total;
  }

  private static getDateKey(value: string | Date | null | undefined): string | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        return null;
      }

      return value.toISOString().slice(0, 10);
    }

    const rawDate = value.trim();
    const dateKeyMatch = rawDate.match(/^(\d{4}-\d{2}-\d{2})/);
    if (dateKeyMatch) {
      return dateKeyMatch[1];
    }

    const parsedDate = new Date(rawDate);
    if (Number.isNaN(parsedDate.getTime())) {
      return null;
    }

    return parsedDate.toISOString().slice(0, 10);
  }

  private static getInstallmentFullyPaidDateKey(installment: IPurchaseInstallment): string | null {
    return this.getDateKey(installment.InstFullyPaidDate);
  }

  private static isPaidLate(installment: IPurchaseInstallment): boolean {
    const paymentDateKey = this.getInstallmentFullyPaidDateKey(installment);
    const dueDateKey = this.getDateKey(installment.InstDueDate);
    if (!paymentDateKey || !dueDateKey) {
      return false;
    }

    return paymentDateKey > dueDateKey;
  }

  private static buildLinkedUserMap(users: User[]): Map<string, LinkedUserContext> {
    const map = new Map<string, LinkedUserContext>();

    for (const user of users) {
      if (!user.sap_card_code || map.has(user.sap_card_code)) {
        continue;
      }

      map.set(user.sap_card_code, {
        user,
        fullName:
          [user.first_name, user.last_name].filter(Boolean).join(' ') ||
          user.phone_number ||
          'Mijoz',
        locale: user.language_code || 'uz',
      });
    }

    return map;
  }

  private static async fetchInstallments(
    window: ProcessingWindow,
  ): Promise<IPurchaseInstallment[]> {
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

  private static async notifyAdminsAboutMissingTemplates(
    missingTemplates: Set<string>,
  ): Promise<void> {
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
        logger.error(
          `Failed to send missing template warning to admin ${admin.telegram_id}`,
          error,
        );
      }
    }
  }

  private static async processPaidLateReminder(params: {
    installment: IPurchaseInstallment;
    linkedUser: LinkedUserContext;
    dryRun: boolean;
    missingTemplates: Set<string>;
    sentRemindersSet?: Set<string>;
    deliveredMessagesSet?: Set<string>;
    activeTemplatesMap?: Map<string, MessageTemplate>;
  }): Promise<boolean> {
    const {
      installment,
      linkedUser,
      dryRun,
      missingTemplates,
      sentRemindersSet,
      deliveredMessagesSet,
      activeTemplatesMap,
    } = params;
    const alreadySent = sentRemindersSet
      ? sentRemindersSet.has(
          `${linkedUser.user.id}:${installment.DocEntry}:${installment.InstlmntID}:paid_late`,
        )
      : await this.hasReminderBeenSent(
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

    const alreadyDelivered = deliveredMessagesSet?.has(`${linkedUser.user.id}:payment_paid_late`);
    if (alreadyDelivered) {
      return false;
    }

    const result = await BotNotificationService.sendTemplateMessage({
      user: linkedUser.user,
      templateType: 'payment_paid_late',
      template: activeTemplatesMap?.get('payment_paid_late'),
      placeholders: {
        customer_name: linkedUser.fullName,
        payment_due_date: formatDateForLocale(installment.InstDueDate, linkedUser.locale),
        product_name: formatItemsList(installment.itemsPairs) || '',
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
    sentRemindersSet?: Set<string>;
    deliveredMessagesSet?: Set<string>;
    activeTemplatesMap?: Map<string, MessageTemplate>;
  }): Promise<boolean> {
    const {
      installment,
      linkedUser,
      reminderType,
      dryRun,
      missingTemplates,
      sentRemindersSet,
      deliveredMessagesSet,
      activeTemplatesMap,
    } = params;
    const alreadySent = sentRemindersSet
      ? sentRemindersSet.has(
          `${linkedUser.user.id}:${installment.DocEntry}:${installment.InstlmntID}:${reminderType}`,
        )
      : await this.hasReminderBeenSent(
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

    const templateType =
      reminderType === 'overdue' ? 'payment_overdue' : `payment_reminder_${reminderType}`;

    const alreadyDelivered = deliveredMessagesSet?.has(`${linkedUser.user.id}:${templateType}`);
    if (alreadyDelivered) {
      return false;
    }

    const result = await BotNotificationService.sendTemplateMessage({
      user: linkedUser.user,
      templateType: templateType as
        | 'payment_overdue'
        | 'payment_reminder_d2'
        | 'payment_reminder_d1'
        | 'payment_reminder_d0',
      template: activeTemplatesMap?.get(templateType),
      placeholders: {
        customer_name: linkedUser.fullName,
        payment_due_date: formatDateForLocale(installment.InstDueDate, linkedUser.locale),
        product_name: formatItemsList(installment.itemsPairs) || '',
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

  private static async loadReminderState(
    installments: IPurchaseInstallment[],
    linkedUsersByCardCode: Map<string, LinkedUserContext>,
  ): Promise<{ sentRemindersSet: Set<string>; deliveredMessagesSet: Set<string> }> {
    const logLookupTuples: [number, number, number][] = [];
    const userIds: number[] = [];

    for (const installment of installments) {
      const linkedUser = linkedUsersByCardCode.get(installment.CardCode);

      if (linkedUser) {
        logLookupTuples.push([linkedUser.user.id, installment.DocEntry, installment.InstlmntID]);
        userIds.push(linkedUser.user.id);
      }
    }

    const [existingLogs, deliveredLogs] = await Promise.all([
      logLookupTuples.length > 0
        ? db('payment_reminder_logs').whereIn(
            ['user_id', 'doc_entry', 'installment_id'],
            logLookupTuples,
          )
        : [],
      userIds.length > 0
        ? db('message_dispatch_logs')
            .whereIn('user_id', userIds)
            .whereIn('dispatch_type', [
              'payment_paid_late',
              'payment_overdue',
              'payment_reminder_d2',
              'payment_reminder_d1',
              'payment_reminder_d0',
            ])
            .where('status', 'sent')
        : [],
    ]);

    const sentRemindersSet = new Set(
      existingLogs.map(
        (log) => `${log.user_id}:${log.doc_entry}:${log.installment_id}:${log.reminder_type}`,
      ),
    );

    const deliveredMessagesSet = new Set(
      deliveredLogs.map((log) => `${log.user_id}:${log.dispatch_type}`),
    );

    return { sentRemindersSet, deliveredMessagesSet };
  }

  static async run(options?: { now?: Date; dryRun?: boolean }): Promise<PaymentReminderRunResult> {
    const runLockToken = await this.acquireRunLock();
    const now = options?.now || new Date();
    const dryRun = options?.dryRun || false;
    const window = this.buildProcessingWindow(now);

    try {
      logger.info(
        `[PAYMENT_REMINDER] Starting run. dryRun=${dryRun} processingMonth=${window.processingMonth} dueDateFrom=${window.dueDateFrom} dueDateTo=${window.dueDateTo}`,
      );

      const [users, installments, allTemplates] = await Promise.all([
        UserService.getUsersWithSapCardCode(),
        this.fetchInstallments(window),
        MessageTemplateService.listTemplates(),
      ]);

      const linkedUsersByCardCode = this.buildLinkedUserMap(users);

      const activeTemplatesMap = new Map<string, MessageTemplate>(
        allTemplates
          .filter((t) => t.is_active && t.channel === 'telegram_bot')
          .map((t) => [t.template_type, t]),
      );

      const { sentRemindersSet, deliveredMessagesSet } = await this.loadReminderState(
        installments,
        linkedUsersByCardCode,
      );

      const checkedCardCodes = new Set(installments.map((installment) => installment.CardCode))
        .size;
      const missingTemplates = new Set<string>();

      const rewardCouponsIssued = 0;
      const rewardNotificationsSent = 0;
      let reminderNotificationsSent = 0;
      const unlinkedRewardCouponsIssued = 0;

      for (const installment of installments) {
        const linkedUser = linkedUsersByCardCode.get(installment.CardCode);

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
              sentRemindersSet,
              deliveredMessagesSet,
              activeTemplatesMap,
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
          sentRemindersSet,
          deliveredMessagesSet,
          activeTemplatesMap,
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
        rewardTargetMonth: window.processingMonth,
        dueDateFrom: window.dueDateFrom,
        dueDateTo: window.dueDateTo,
      };
    } finally {
      await this.releaseRunLock(runLockToken);
    }
  }
}
