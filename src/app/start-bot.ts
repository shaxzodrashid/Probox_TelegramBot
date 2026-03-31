import type { Bot } from 'grammy';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { BotContext } from '../types/context';
import { bot } from '../bot';

export const startBot = async (): Promise<Bot<BotContext> | null> => {
  if (!config.BOT_ENABLED) {
    logger.info('Telegram bot startup skipped because BOT_ENABLED=false');
    return null;
  }


  // Use the statically imported bot

  logger.info('Starting Telegram bot...');
  await bot.start({
    onStart: (botInfo: { username: string }) => {
      logger.info(`Bot @${botInfo.username} started!`);
    },
  });

  return bot;
};
