import assert from 'node:assert/strict';
import test from 'node:test';

import { IBusinessPartner } from '../interfaces/business-partner.interface';
import { IPurchaseInstallment } from '../interfaces/purchase.interface';
import { SapService } from './sap-hana.service';

type ExecuteCall = {
  query: string;
  params: unknown[];
};

class MockHanaService {
  public readonly calls: ExecuteCall[] = [];

  constructor(
    private readonly resolver: (
      query: string,
      params: unknown[],
    ) => unknown[] | Promise<unknown[]> = (query) =>
      query.includes('COUNT(DISTINCT') ? [{ total: 0 }] : [],
  ) {}

  async executeOnce<T = Record<string, unknown>>(
    query: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    this.calls.push({ query, params });
    return (await this.resolver(query, params)) as T[];
  }
}

const createService = (resolver?: ConstructorParameters<typeof MockHanaService>[0]) => {
  const hana = new MockHanaService(resolver);
  return {
    hana,
    service: new SapService(hana as any),
  };
};

test('SapService getBusinessPartnerByPhone normalizes the phone and passes it twice to SAP', async () => {
  const partners: IBusinessPartner[] = [
    {
      CardCode: 'C001',
      CardName: 'Ali Valiyev',
      Phone1: '998901234567',
      Phone2: null as any,
    } as IBusinessPartner,
  ];

  const { hana, service } = createService(async () => partners);
  const result = await service.getBusinessPartnerByPhone('+998 (90) 123-45-67');

  assert.deepEqual(result, partners);
  assert.equal(hana.calls.length, 1);
  assert.deepEqual(hana.calls[0].params, ['998901234567', '998901234567']);
  assert.match(hana.calls[0].query, /PROBOX_PROD_3/);
});

test('SapService getBusinessPartnerByPhone wraps SAP failures', async () => {
  const { service } = createService(async () => {
    throw new Error('phone lookup failed');
  });

  await assert.rejects(
    () => service.getBusinessPartnerByPhone('+998901234567'),
    /SAP query failed \(getBusinessPartnerByPhone\)/,
  );
});

test('SapService getBusinessPartnerByJshshir trims the identifier before querying', async () => {
  const { hana, service } = createService(async () => []);

  await service.getBusinessPartnerByJshshir(' 12345678901234 ');

  assert.equal(hana.calls.length, 1);
  assert.deepEqual(hana.calls[0].params, ['12345678901234']);
});

test('SapService getBPpurchasesByCardCode forwards the card code to SAP', async () => {
  const purchases: IPurchaseInstallment[] = [
    {
      DocEntry: 1 as any,
      DocNum: 2 as any,
      CardCode: 'C001',
      CardName: 'Ali',
      itemsPairs: 'IP16::iPhone 16::100',
    } as IPurchaseInstallment,
  ];

  const { hana, service } = createService(async () => purchases);
  const result = await service.getBPpurchasesByCardCode('C001');

  assert.deepEqual(result, purchases);
  assert.deepEqual(hana.calls[0].params, ['C001']);
});

test('SapService getBusinessPartnersByPhones returns an empty array without hitting SAP when no phones are provided', async () => {
  const { hana, service } = createService(async () => {
    throw new Error('should not be called');
  });

  const result = await service.getBusinessPartnersByPhones([]);

  assert.deepEqual(result, []);
  assert.equal(hana.calls.length, 0);
});

test('SapService getBusinessPartnersByPhones normalizes every phone and duplicates the IN params', async () => {
  const { hana, service } = createService(async () => []);

  await service.getBusinessPartnersByPhones(['+998901234567', '90 765 43 21']);

  assert.equal(hana.calls.length, 1);
  assert.deepEqual(hana.calls[0].params, [
    '998901234567',
    '998907654321',
    '998901234567',
    '998907654321',
  ]);
});

test('SapService getBatchPurchasesByCardCodes returns an empty array without hitting SAP when no card codes are provided', async () => {
  const { hana, service } = createService(async () => {
    throw new Error('should not be called');
  });

  const result = await service.getBatchPurchasesByCardCodes([]);

  assert.deepEqual(result, []);
  assert.equal(hana.calls.length, 0);
});

test('SapService getBatchPurchasesByCardCodes forwards every card code to SAP', async () => {
  const { hana, service } = createService(async () => []);

  await service.getBatchPurchasesByCardCodes(['C001', 'C002']);

  assert.equal(hana.calls.length, 1);
  assert.deepEqual(hana.calls[0].params, ['C001', 'C002']);
});

test('SapService getPaymentReminderInstallments passes the due-date range to SAP', async () => {
  const { hana, service } = createService(async () => []);

  await service.getPaymentReminderInstallments({
    dueDateFrom: '2026-04-01',
    dueDateTo: '2026-04-30',
  });

  assert.equal(hana.calls.length, 1);
  assert.deepEqual(hana.calls[0].params, ['2026-04-01', '2026-04-30']);
});

test('SapService getLatestExchangeRateInfo parses string rates and normalizes the currency code', async () => {
  const { service } = createService(async () => [
    {
      Currency: ' usd ',
      Rate: '12650.5',
      RateDate: '2026-04-12T00:00:00.000Z',
    },
  ]);

  const result = await service.getLatestExchangeRateInfo(' usd ');

  assert.deepEqual(result, {
    currency: 'USD',
    rate: 12650.5,
    rateDate: '2026-04-12T00:00:00.000Z',
  });
});

test('SapService getLatestExchangeRateInfo returns null when SAP returns no rate', async () => {
  const { service } = createService(async () => [
    {
      Currency: 'USD',
      Rate: null,
      RateDate: '2026-04-12T00:00:00.000Z',
    },
  ]);

  const result = await service.getLatestExchangeRateInfo('USD');

  assert.equal(result, null);
});

test('SapService getLatestExchangeRateInfo returns null when SAP returns a non-numeric rate', async () => {
  const { service } = createService(async () => [
    {
      Currency: 'USD',
      Rate: 'not-a-number',
      RateDate: '2026-04-12T00:00:00.000Z',
    },
  ]);

  const result = await service.getLatestExchangeRateInfo('USD');

  assert.equal(result, null);
});

test('SapService getLatestExchangeRate returns only the numeric rate', async () => {
  const { service } = createService(async () => [
    {
      Currency: 'USD',
      Rate: 12_700,
      RateDate: '2026-04-12T00:00:00.000Z',
    },
  ]);

  const result = await service.getLatestExchangeRate('usd');

  assert.equal(result, 12_700);
});

test('SapService getLatestExchangeRateInfo wraps SAP failures', async () => {
  const { service } = createService(async () => {
    throw new Error('rate lookup failed');
  });

  await assert.rejects(
    () => service.getLatestExchangeRateInfo('USD'),
    /SAP query failed \(getLatestExchangeRateInfo\)/,
  );
});

test('SapService getAvailableDeviceNames groups full device names by new and used conditions', async () => {
  const { hana, service } = createService(async () => [
    { full_name: 'iPhone 16 Pro', condition: 'Yangi' },
    { full_name: 'iPhone 16 Pro', condition: 'new' },
    { full_name: 'iPhone 15 Pro Max', condition: 'B/U' },
    { full_name: 'iPhone 15', condition: 'used' },
    { full_name: 'iPhone 14', condition: 'unknown' },
    { full_name: '   ', condition: 'Yangi' },
  ]);

  const result = await service.getAvailableDeviceNames();

  assert.equal(hana.calls.length, 1);
  assert.match(hana.calls[0].query, /T0\."OnHand" > 0/);
  assert.match(hana.calls[0].query, /U_DeviceType/);
  assert.deepEqual(result, {
    newDevices: ['iPhone 16 Pro'],
    usedDevices: ['iPhone 15', 'iPhone 15 Pro Max'],
  });
});

test('SapService getAvailableDeviceNames wraps SAP failures', async () => {
  const { service } = createService(async () => {
    throw new Error('device lookup failed');
  });

  await assert.rejects(
    () => service.getAvailableDeviceNames(),
    /SAP query failed \(getAvailableDeviceNames\)/,
  );
});
