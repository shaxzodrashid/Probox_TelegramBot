import type { FastifyInstance } from 'fastify';
import { registerCoupon } from '../controllers/coupons.controller';

const couponRegistrationBodySchema = {
  type: 'object',
  required: ['phone_number', 'full_name', 'lead_id', 'status'],
  allOf: [
    {
      if: {
        properties: {
          status: { const: 'Purchased' },
        },
      },
      then: {
        required: ['product_name'],
      },
    },
  ],
  properties: {
    phone_number: { type: 'string', pattern: '^(\\+?998)?\\d{9}$' },
    full_name: { type: 'string' },
    lead_id: { type: 'string', minLength: 1 },
    status: { type: 'string', enum: ['Purchased', 'VisitedStore'] },
    product_name: { type: 'string', minLength: 1 },
    referred_by: { type: 'string', pattern: '^(\\+?998)?\\d{9}$' },
  },
};

export const couponRoutes = async (app: FastifyInstance): Promise<void> => {
  app.post(
    '/',
    {
      schema: {
        body: couponRegistrationBodySchema,
      },
    },
    registerCoupon,
  );
};
