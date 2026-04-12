import { PaymentReminderService } from '../services/payment-reminder.service';
import { logger } from '../utils/logger';

async function main(): Promise<void> {
  const nowInput = process.env.PAYMENT_REMINDER_RUN_NOW;
  const rewardMonth = process.env.PAYMENT_REWARD_TARGET_MONTH;
  const now = nowInput ? new Date(nowInput) : new Date();

  if (Number.isNaN(now.getTime())) {
    throw new Error(`Invalid PAYMENT_REMINDER_RUN_NOW value: ${nowInput}`);
  }

  const result = await PaymentReminderService.run({
    now,
    rewardMonth,
  });

  logger.info(`[PAYMENT_REMINDER_RUN] Summary: ${JSON.stringify(result)}`);
}

main().catch((error) => {
  logger.error('[PAYMENT_REMINDER_RUN] Run failed', error);
  process.exitCode = 1;
});
