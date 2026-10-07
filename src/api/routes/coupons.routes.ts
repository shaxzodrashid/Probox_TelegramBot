import type { FastifyInstance } from 'fastify';
import { registerCoupon } from '../controllers/coupons.controller';

export const couponRoutes = async (app: FastifyInstance): Promise<void> => {
  app.post('/', registerCoupon);
};
