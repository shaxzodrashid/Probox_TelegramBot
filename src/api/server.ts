import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { config, isLoopbackApiHost } from '../config';
import { logger } from '../utils/logger';
import { registerApiErrorHandlers } from './errors/error-handler';
import { requireApiKey } from './middlewares/api-key.middleware';
import { couponRoutes } from './routes/coupons.routes';
import { purchasePdfDeliveryRoutes } from './routes/purchase-pdf-delivery.routes';

const parseCorsOrigin = (value: string): true | string[] | undefined => {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  if (trimmed === '*') {
    return true;
  }

  return trimmed
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

export const createApiServer = async (): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: false,
    disableRequestLogging: true,
  });

  const corsOrigin = parseCorsOrigin(config.API_CORS_ORIGIN);
  if (corsOrigin) {
    await app.register(cors, {
      origin: corsOrigin,
      credentials: true,
    });
  }

  registerApiErrorHandlers(app);

  await app.register(
    async (versionedApi) => {
      await versionedApi.register(async (protectedApi) => {
        protectedApi.addHook('preHandler', requireApiKey);

        await protectedApi.register(couponRoutes, { prefix: '/coupons' });
        await protectedApi.register(purchasePdfDeliveryRoutes, { prefix: '/purchase-pdfs' });
      });
    },
    { prefix: config.API_PREFIX },
  );

  app.addHook('onReady', async () => {
    if (!config.API_KEY && isLoopbackApiHost) {
      logger.warn(
        'API is running without an API key. Set API_KEY in the environment to protect non-health endpoints.',
      );
    }
  });

  return app;
};
