import type { FastifyInstance } from 'fastify';
import type { Bot } from 'grammy';
import db from '../database/database';
import { validateDatabaseSchema } from '../database/schema-validation';
import { logger } from '../utils/logger';
import type { BotContext } from '../types/context';
import { startApi } from './start-api';
import { startBot } from './start-bot';
import { redisService } from '../redis/redis.service';
import { SapSyncCron } from '../cron/sap-sync.cron';
import { PaymentReminderCron } from '../cron/payment-reminder.cron';
import { ScheduledBroadcastCron } from '../cron/scheduled-broadcast.cron';
import { SapService } from '../sap/sap-hana.service';

type RuntimeResources = {
  apiServer: FastifyInstance | null;
  bot: Bot<BotContext> | null;
  close: () => Promise<void>;
};

export const bootstrap = async (): Promise<RuntimeResources> => {
  let apiServer: FastifyInstance | null = null;
  let bot: Bot<BotContext> | null = null;
  let isClosing = false;

  const close = async (): Promise<void> => {
    if (isClosing) {
      return;
    }

    isClosing = true;
    logger.info('Shutting down application...');

    if (apiServer) {
      await apiServer.close();
    }

    if (bot) {
      bot.stop();
    }

    await redisService.disconnect();
    await db.destroy();
  };

  try {
    SapService.configureDefaultCache(redisService);

    await validateDatabaseSchema();
    apiServer = await startApi();
    bot = await startBot();
    SapSyncCron.init();
    PaymentReminderCron.init();
    ScheduledBroadcastCron.init();

    return {
      apiServer,
      bot,
      close,
    };
  } catch (error) {
    await close().catch((shutdownError) => {
      logger.error('Failed during rollback after bootstrap error', shutdownError);
    });
    throw error;
  }
};
