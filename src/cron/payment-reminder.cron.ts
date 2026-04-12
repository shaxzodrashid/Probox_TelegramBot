import cron from 'node-cron';
import { logger } from '../utils/logger';
import {
  PaymentReminderRunAlreadyInProgressError,
  PaymentReminderService,
} from '../services/payment-reminder.service';

export class PaymentReminderCron {
  static init(): void {
    const schedule = process.env.PAYMENT_REMINDER_CRON_SCHEDULE || '1 12 * * *';
    logger.info(`[CRON] Payment reminder job scheduled: ${schedule} (Asia/Tashkent)`);

    cron.schedule(
      schedule,
      async () => {
        try {
          const result = await PaymentReminderService.run();
          logger.info(
            `[CRON] Payment reminders complete. rewardMonth=${result.rewardTargetMonth}, dueDateFrom=${result.dueDateFrom}, dueDateTo=${result.dueDateTo}, cardCodes=${result.checkedCardCodes}, installments=${result.fetchedInstallments}, rewardCouponsIssued=${result.rewardCouponsIssued}, unlinkedRewardCouponsIssued=${result.unlinkedRewardCouponsIssued}, rewardNotificationsSent=${result.rewardNotificationsSent}, reminderNotificationsSent=${result.reminderNotificationsSent}, remindersSent=${result.remindersSent}`,
          );
        } catch (error) {
          if (error instanceof PaymentReminderRunAlreadyInProgressError) {
            logger.warn('[CRON] Payment reminder job skipped because another run is already in progress');
            return;
          }

          logger.error('[CRON] Payment reminder job failed', error);
        }
      },
      {
        timezone: 'Asia/Tashkent',
      },
    );
  }
}
