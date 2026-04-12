import type { Bot } from 'grammy';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { BotContext } from '../types/context';
import { bot } from '../bot';

type StartableBot = Pick<Bot<BotContext>, 'start'>;

export const launchBotPolling = async (
  botInstance: StartableBot,
  onStarted: (botInfo: { username: string }) => void,
): Promise<void> => {
  let settled = false;

  await new Promise<void>((resolve, reject) => {
    const resolveOnce = () => {
      if (settled) {
        return;
      }

      settled = true;
      resolve();
    };

    const rejectOnce = (error: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      reject(error);
    };

    void botInstance
      .start({
        onStart: (botInfo: { username: string }) => {
          onStarted(botInfo);
          resolveOnce();
        },
      })
      .catch((error) => {
        logger.error('Telegram bot polling stopped with error', error);
        rejectOnce(error);
      });
  });
};

export const startBot = async (): Promise<Bot<BotContext> | null> => {
  if (!config.BOT_ENABLED) {
    logger.info('Telegram bot startup skipped because BOT_ENABLED=false');
    return null;
  }

  logger.info('Starting Telegram bot...');
  await launchBotPolling(bot, (botInfo) => {
    logger.info(`Bot @${botInfo.username} started!`);
  });

  return bot;
};
