import { PaymentReminderService } from '../services/payment/payment-reminder.service';
import { logger } from '../utils/logger';

async function main(): Promise<void> {
  const nowInput = process.env.PAYMENT_REMINDER_TEST_NOW;
  const now = nowInput ? new Date(nowInput) : new Date();

  if (Number.isNaN(now.getTime())) {
    throw new Error(`Invalid PAYMENT_REMINDER_TEST_NOW value: ${nowInput}`);
  }

  const result = await PaymentReminderService.run({
    now,
    dryRun: true,
  });

  logger.info(`[PAYMENT_REMINDER_TEST] Dry run summary: ${JSON.stringify(result)}`);
}

main().catch((error) => {
  logger.error('[PAYMENT_REMINDER_TEST] Dry run failed', error);
  process.exitCode = 1;
});
