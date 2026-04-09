import type { FastifyInstance } from 'fastify';
import { deliverPurchasePdf } from '../controllers/purchase-pdf-delivery.controller';

export const purchasePdfDeliveryRoutes = async (app: FastifyInstance): Promise<void> => {
  app.post('/deliver', deliverPurchasePdf);
};
