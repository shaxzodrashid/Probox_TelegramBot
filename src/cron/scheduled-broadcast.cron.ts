import cron from 'node-cron';
import { BroadcastService } from '../services/broadcast.service';
import { logger } from '../utils/logger';

export class ScheduledBroadcastCron {
  static init(): void {
    const schedule = process.env.SCHEDULED_BROADCAST_CRON_SCHEDULE || '* * * * *';
    logger.info(`[CRON] Scheduled broadcast job scheduled: ${schedule} (Asia/Tashkent)`);

    cron.schedule(
      schedule,
      async () => {
        try {
          const result = await BroadcastService.processDueScheduledBroadcasts();
          if (result.checked > 0) {
            logger.info(
              `[CRON] Scheduled broadcasts complete. checked=${result.checked}, processed=${result.processed}, failed=${result.failed}`,
            );
          }
        } catch (error) {
          logger.error('[CRON] Scheduled broadcast job failed', error);
        }
      },
      {
        timezone: 'Asia/Tashkent',
      },
    );
  }
}
