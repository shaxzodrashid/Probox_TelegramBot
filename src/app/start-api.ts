import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import { logger } from '../utils/logger';
import { createApiServer } from '../api/server';

export const startApi = async (): Promise<FastifyInstance | null> => {
  if (!config.API_ENABLED) {
    logger.info('HTTP API startup skipped because API_ENABLED=false');
    return null;
  }

  const apiServer = await createApiServer();
  const address = await apiServer.listen({
    host: config.API_HOST,
    port: config.API_PORT,
  });

  logger.info(`HTTP API listening on ${address}`);
  return apiServer;
};
