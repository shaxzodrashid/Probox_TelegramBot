import type { FastifyInstance } from 'fastify';
import { BotController } from '../controllers/bot.controller';

export const botRoutes = async (app: FastifyInstance): Promise<void> => {
  app.post('/send-message', BotController.sendMessage);
};
