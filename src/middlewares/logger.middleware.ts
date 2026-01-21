import { NextFunction } from 'grammy';
import { BotContext } from '../types/context';
import { logger } from '../utils/logger';

export const loggerMiddleware = async (ctx: BotContext, next: NextFunction) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  logger.info(`Update ${ctx.update.update_id} processed in ${ms}ms`);
};
