import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, test } from 'node:test';

process.env.BOT_ENABLED = 'false';
process.env.API_ENABLED = 'true';
process.env.API_KEY = 'test-api-key';
process.env.API_HOST = '127.0.0.1';

type AppModule = typeof import('../server');
type ServiceModule = typeof import('../../services/purchase-pdf-delivery.service');
type RedisModule = typeof import('../../redis/redis.service');

let appModulePromise: Promise<AppModule> | null = null;
let serviceModulePromise: Promise<ServiceModule> | null = null;
let redisModulePromise: Promise<RedisModule> | null = null;

const requireFromHere = createRequire(__filename);

const loadModule = async <T>(relativePath: string): Promise<T> => {
  return Promise.resolve(requireFromHere(relativePath) as T);
};

const getAppModule = async (): Promise<AppModule> => {
  if (!appModulePromise) {
    appModulePromise = loadModule<AppModule>('../server.ts');
  }

  return appModulePromise;
};

const getServiceModule = async (): Promise<ServiceModule> => {
  if (!serviceModulePromise) {
    serviceModulePromise = loadModule<ServiceModule>('../../services/purchase-pdf-delivery.service.ts');
  }

  return serviceModulePromise;
};

const getRedisModule = async (): Promise<RedisModule> => {
  if (!redisModulePromise) {
    redisModulePromise = loadModule<RedisModule>('../../redis/redis.service.ts');
  }

  return redisModulePromise;
};

after(async () => {
  const { redisService } = await getRedisModule();
  await redisService.disconnect().catch(() => undefined);
});

test('validatePurchasePdfDeliveryPayload requires at least one identifier', { concurrency: false }, async () => {
  const { validatePurchasePdfDeliveryPayload } = await loadModule<typeof import('./purchase-pdf-delivery.controller')>('./purchase-pdf-delivery.controller.ts');

  assert.throws(
    () =>
      validatePurchasePdfDeliveryPayload({
        pdfUrl: 'https://example.com/test.pdf',
      }),
    /Either jshshir or cardCode must be provided/,
  );
});

test('validatePurchasePdfDeliveryPayload requires a 14-digit jshshir', { concurrency: false }, async () => {
  const { validatePurchasePdfDeliveryPayload } = await loadModule<typeof import('./purchase-pdf-delivery.controller')>('./purchase-pdf-delivery.controller.ts');

  assert.throws(
    () =>
      validatePurchasePdfDeliveryPayload({
        jshshir: '123456',
        pdfUrl: 'https://example.com/test.pdf',
      }),
    /jshshir must contain exactly 14 digits/,
  );
});

test('POST /purchase-pdfs/deliver normalizes alias fields and returns service result', { concurrency: false }, async () => {
  const { createApiServer } = await getAppModule();
  const serviceModule = await getServiceModule();
  const originalProcess = serviceModule.PurchasePdfDeliveryService.process;

  let capturedPayload: unknown;

  serviceModule.PurchasePdfDeliveryService.process = async (payload) => {
    capturedPayload = payload;
    return {
      status: true,
      userFound: true,
      matchedBy: 'jshshir',
      userDelivered: true,
      adminGroupDelivered: true,
      fileName: 'purchase-777.pdf',
      identifiers: {
        jshshir: payload.jshshir,
        cardCode: payload.cardCode,
        docEntry: payload.docEntry,
      },
      user: {
        id: 12,
        telegramId: 998901234567,
        firstName: 'Ali',
        lastName: 'Valiyev',
        phoneNumber: '+998901234567',
        sapCardCode: payload.cardCode,
        jshshir: payload.jshshir,
      },
      errors: {},
    };
  };

  const app = await createApiServer();

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/purchase-pdfs/deliver',
      headers: {
        'x-api-key': 'test-api-key',
      },
      payload: {
        JSSHR: '1234 5678 9012 34',
        CardCode: 'C001',
        'pdf-url': 'https://example.com/purchase.pdf',
        docEntry: 777,
      },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(capturedPayload, {
      jshshir: '12345678901234',
      cardCode: 'C001',
      pdfUrl: 'https://example.com/purchase.pdf',
      fileName: undefined,
      docEntry: '777',
    });

    const body = response.json();
    assert.equal(body.status, true);
    assert.equal(body.userFound, true);
    assert.equal(body.adminGroupDelivered, true);
    assert.equal(body.identifiers.jshshir, '12345678901234');
    assert.equal(body.identifiers.cardCode, 'C001');
    assert.equal(body.identifiers.docEntry, '777');
  } finally {
    serviceModule.PurchasePdfDeliveryService.process = originalProcess;
    await app.close();
  }
});

test('POST /purchase-pdfs/deliver returns 502 when admin group delivery fails', { concurrency: false }, async () => {
  const { createApiServer } = await getAppModule();
  const serviceModule = await getServiceModule();
  const originalProcess = serviceModule.PurchasePdfDeliveryService.process;

  serviceModule.PurchasePdfDeliveryService.process = async (payload) => ({
    status: false,
    userFound: false,
    matchedBy: null,
    userDelivered: false,
    adminGroupDelivered: false,
    fileName: 'purchase.pdf',
    identifiers: {
      jshshir: payload.jshshir,
      cardCode: payload.cardCode,
      docEntry: payload.docEntry,
    },
    user: null,
    errors: {
      adminGroup: 'Admin group send failed',
    },
  });

  const app = await createApiServer();

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/purchase-pdfs/deliver',
      headers: {
        'x-api-key': 'test-api-key',
      },
      payload: {
        cardCode: 'C002',
        pdfUrl: 'https://example.com/purchase.pdf',
      },
    });

    assert.equal(response.statusCode, 502);
    const body = response.json();
    assert.equal(body.code, 'ADMIN_GROUP_SEND_FAILED');
    assert.equal(body.message, 'Admin group send failed');
    assert.equal(body.details.adminGroupDelivered, false);
    assert.equal(body.details.identifiers.cardCode, 'C002');
  } finally {
    serviceModule.PurchasePdfDeliveryService.process = originalProcess;
    await app.close();
  }
});
