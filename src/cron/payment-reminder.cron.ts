import cron from 'node-cron';
import { logger } from '../utils/logger';
import { PaymentReminderService } from '../services/payment-reminder.service';

export class PaymentReminderCron {
  static init(): void {
    const schedule = process.env.PAYMENT_REMINDER_CRON_SCHEDULE || '5 18 * * *';
    logger.info(`[CRON] Payment reminder job scheduled: ${schedule} (Asia/Tashkent)`);

    cron.schedule(
      schedule,
      async () => {
        try {
          const result = await PaymentReminderService.run();
          logger.info(
            `[CRON] Payment reminders complete. cardCodes=${result.checkedCardCodes}, installments=${result.fetchedInstallments}, remindersSent=${result.remindersSent}`,
          );
        } catch (error) {
          logger.error('[CRON] Payment reminder job failed', error);
        }
      },
      {
        timezone: 'Asia/Tashkent',
      },
    );
  }
}
