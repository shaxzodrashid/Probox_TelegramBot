import { NextFunction } from 'grammy';
import { BotContext } from '../types/context';
import { logger } from '../utils/logger';
import { config } from '../config';

export const loggerMiddleware = async (ctx: BotContext, next: NextFunction) => {
  const start = Date.now();
  
  if (config.LOG_LEVEL === 'extra-high') {
    logger.debug(`Incoming update ${ctx.update.update_id}:`, ctx.update);
  }

  await next();
  const ms = Date.now() - start;
  logger.info(`Update ${ctx.update.update_id} processed in ${ms}ms`);
};
