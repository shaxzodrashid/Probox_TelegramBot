import { logger } from './utils/logger';
import { bootstrap } from './app/bootstrap';

async function main() {
  const runtime = await bootstrap();

  const shutdown = async () => {
    try {
      await runtime.close();
      process.exit(0);
    } catch (error) {
      logger.error('Failed to shut down cleanly', error);
      process.exit(1);
    }
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error('Failed to start application', err);
  process.exit(1);
});
