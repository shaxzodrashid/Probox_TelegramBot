import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { couponRoutes } from '../routes/coupons.routes';
import { registerApiErrorHandlers } from '../errors/error-handler';
import { requireApiKey } from '../middlewares/api-key.middleware';
import { config } from '../../config';

test('retired coupon API keeps authentication and returns 410 for legacy and empty payloads', async () => {
  const originalKey = config.API_KEY;
  config.API_KEY = 'retirement-test-key';
  const app = Fastify();
  registerApiErrorHandlers(app);
  app.addHook('preHandler', requireApiKey);
  await app.register(couponRoutes, { prefix: '/api/v1/coupons' });
  try {
    const unauthenticated = await app.inject({ method: 'POST', url: '/api/v1/coupons/' });
    assert.equal(unauthenticated.statusCode, 401);
    for (const payload of [
      {},
      {
        phone_number: '+998901234567',
        full_name: 'Test',
        lead_id: '1',
        status: 'Purchased',
        product_name: 'TV',
      },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/coupons/',
        headers: { 'x-api-key': config.API_KEY },
        payload,
      });
      assert.equal(response.statusCode, 410);
      assert.equal(response.json().code, 'COUPON_PROGRAM_RETIRED');
      assert.equal(response.json().message, 'The coupon program has ended.');
    }
  } finally {
    config.API_KEY = originalKey;
    await app.close();
  }
});
