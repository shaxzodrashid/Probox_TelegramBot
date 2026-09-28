import { PaymentReminderService } from '../services/payment/payment-reminder.service';
import { logger } from '../utils/logger';

async function main(): Promise<void> {
  const nowInput = process.env.PAYMENT_REMINDER_RUN_NOW;
  const now = nowInput ? new Date(nowInput) : new Date();

  if (Number.isNaN(now.getTime())) {
    throw new Error(`Invalid PAYMENT_REMINDER_RUN_NOW value: ${nowInput}`);
  }

  const result = await PaymentReminderService.run({
    now,
  });

  logger.info(`[PAYMENT_REMINDER_RUN] Summary: ${JSON.stringify(result)}`);
}

main().catch((error) => {
  logger.error('[PAYMENT_REMINDER_RUN] Run failed', error);
  process.exitCode = 1;
});
