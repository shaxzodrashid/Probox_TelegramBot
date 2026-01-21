import { bot } from './bot';
import { logger } from './utils/logger';

async function main() {
  logger.info('Starting bot...');
  
  // You can switch to webhook mode here if needed
  await bot.start({
    onStart: (botInfo) => {
      logger.info(`Bot @${botInfo.username} started!`);
    },
  });
}

main().catch((err) => {
  logger.error('Failed to start bot', err);
  process.exit(1);
});

// Handle graceful shutdown
process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());
