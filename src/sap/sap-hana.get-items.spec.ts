import assert from 'node:assert/strict';
import test from 'node:test';

import { ISapItem } from '../interfaces/item.interface';
import { SapCacheStore, SapService } from './sap-hana.service';

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

class MockCacheStore implements SapCacheStore {
  public readonly getCalls: string[] = [];
  public readonly setCalls: Array<{ key: string; value: unknown; expireTime?: number }> = [];
  private readonly values = new Map<string, unknown>();

  constructor(private readonly fallbackValue?: unknown) {}

  async get<T>(key: string): Promise<T | null> {
    this.getCalls.push(key);

    if (this.fallbackValue !== undefined) {
      return this.fallbackValue as T;
    }

    return this.values.has(key) ? (this.values.get(key) as T) : null;
  }

  async set(key: string, value: unknown, expireTime?: number): Promise<'OK'> {
    this.setCalls.push({ key, value, expireTime });
    this.values.set(key, value);
    return 'OK';
  }
}

const createCacheEnvelope = <T>(value: T) => ({
  value,
  cachedAt: '2026-04-30T00:00:00.000Z',
  ttlSeconds: 3600,
});

const getItemQueries = (hana: MockHanaService) => {
  assert.equal(hana.calls.length, 2);
  return {
    dataQuery: hana.calls[0].query,
    countQuery: hana.calls[1].query,
  };
};

const createService = (resolver?: ConstructorParameters<typeof MockHanaService>[0]) => {
  const hana = new MockHanaService(resolver);
  return {
    hana,
    service: new SapService(hana),
  };
};

const createQueuedResolver = (...responses: unknown[][]) => {
  let index = 0;

  return async () => {
    const response = responses[index];
    index += 1;
    return response || [];
  };
};

const itemSearchScenarios = [
  {
    name: 'treats plain iPhone model searches as base models',
    params: { search: '  iPhOnE 17  ', groupByWarehouse: true },
    expectedPatterns: [
      /LOWER\(TRIM\(COALESCE\(T1\."U_Model", ''\)\)\) = 'iphone 17'/,
      /\(T1\."U_DeviceType" IS NULL OR TRIM\(T1\."U_DeviceType"\) = '' OR TRIM\(T1\."U_DeviceType"\) = '-' OR LOWER\(TRIM\(T1\."U_DeviceType"\)\) = 'null'\)/,
      /CASE WHEN LOWER\(TRIM\(COALESCE\(MAX\(T1\."U_Model"\), ''\)\)\) = 'iphone 17' THEN 0 ELSE 1 END/,
    ],
  },
  {
    name: 'maps iPhone Pro Max searches to U_Model plus U_DeviceType',
    params: { search: 'iPhone 17 Pro Max', groupByWarehouse: true },
    expectedPatterns: [
      /LOWER\(TRIM\(COALESCE\(T1\."U_Model", ''\)\)\) = 'iphone 17'/,
      /LOWER\(TRIM\(COALESCE\(T1\."U_DeviceType", ''\)\)\) = 'pro max'/,
      /CASE WHEN LOWER\(TRIM\(COALESCE\(MAX\(T1\."U_DeviceType"\), ''\)\)\) = 'pro max' THEN 0 ELSE 1 END/,
    ],
  },
  {
    name: 'maps iPhone Pro searches to the Pro device type',
    params: { search: 'iphone 16 pro', groupByWarehouse: true },
    expectedPatterns: [
      /LOWER\(TRIM\(COALESCE\(T1\."U_Model", ''\)\)\) = 'iphone 16'/,
      /LOWER\(TRIM\(COALESCE\(T1\."U_DeviceType", ''\)\)\) = 'pro'/,
    ],
  },
  {
    name: 'normalizes used-condition search aliases to B/U',
    params: { search: 'iPhone 17 used', groupByWarehouse: true },
    expectedPatterns: [
      /LOWER\(TRIM\(COALESCE\(T1\."U_Model", ''\)\)\) = 'iphone 17'/,
      /LOWER\(TRIM\(COALESCE\(T1\."U_PROD_CONDITION", ''\)\)\) = 'b\/u'/,
      /CASE WHEN LOWER\(TRIM\(COALESCE\(MAX\(T1\."U_PROD_CONDITION"\), ''\)\)\) = 'b\/u' THEN 0 ELSE 1 END/,
    ],
  },
  {
    name: 'normalizes new-condition search aliases to Yangi',
    params: { search: 'iphone 17 new', groupByWarehouse: true },
    expectedPatterns: [/LOWER\(TRIM\(COALESCE\(T1\."U_PROD_CONDITION", ''\)\)\) = 'yangi'/],
  },
  {
    name: 'supports compact b/u aliases in the search text',
    params: { search: 'iphone 15 bu', groupByWarehouse: true },
    expectedPatterns: [/LOWER\(TRIM\(COALESCE\(T1\."U_PROD_CONDITION", ''\)\)\) = 'b\/u'/],
  },
  {
    name: 'keeps only the condition filter when the search text is just a condition alias',
    params: { search: 'used', groupByWarehouse: true },
    expectedPatterns: [/LOWER\(TRIM\(COALESCE\(T1\."U_PROD_CONDITION", ''\)\)\) = 'b\/u'/],
    unexpectedPatterns: [/LOWER\(COALESCE\(T1\."ItemName", ''\)\) LIKE/],
  },
  {
    name: 'adds a generic residual search clause when model queries include extra descriptors',
    params: { search: 'iphone 16 pro max 256 black', groupByWarehouse: true },
    expectedPatterns: [
      /LOWER\(TRIM\(COALESCE\(T1\."U_Model", ''\)\)\) = 'iphone 16'/,
      /LOWER\(TRIM\(COALESCE\(T1\."U_DeviceType", ''\)\)\) = 'pro max'/,
      /LOWER\(COALESCE\(T1\."U_Memory", ''\)\) LIKE '%256 black%' ESCAPE '\\'/,
    ],
  },
  {
    name: 'falls back to the generic text search for non-structured queries',
    params: { search: 'Galaxy S24', groupByWarehouse: true },
    expectedPatterns: [
      /LOWER\(COALESCE\(T1\."ItemName", ''\)\) LIKE '%galaxy s24%' ESCAPE '\\'/,
      /LOWER\(COALESCE\(T1\."U_Model", ''\)\) LIKE '%galaxy s24%' ESCAPE '\\'/,
      /CASE\s+WHEN LOWER\(T0\."ItemCode"\) = 'galaxy s24' THEN 0/,
    ],
    unexpectedPatterns: [/LOWER\(TRIM\(COALESCE\(T1\."U_Model", ''\)\)\) = 'galaxy s24'/],
  },
  {
    name: 'treats short numeric searches as generic text instead of IMEI lookups',
    params: { search: '123', groupByWarehouse: true },
    expectedPatterns: [/LOWER\(COALESCE\(T1\."ItemCode", ''\)\) LIKE '%123%' ESCAPE '\\'/],
    unexpectedPatterns: [/LEFT JOIN PROBOX_PROD_3\."OSRN" R/],
  },
];

for (const scenario of itemSearchScenarios) {
  test(`SapService getItems ${scenario.name}`, async () => {
    const { hana, service } = createService();

    await service.getItems(scenario.params as Parameters<SapService['getItems']>[0]);

    const { dataQuery } = getItemQueries(hana);

    for (const pattern of scenario.expectedPatterns) {
      assert.match(dataQuery, pattern);
    }

    for (const pattern of scenario.unexpectedPatterns || []) {
      assert.doesNotMatch(dataQuery, pattern);
    }
  });
}

test('SapService getItems normalizes device-type filters for blank base variants', async () => {
  const { hana, service } = createService();

  await service.getItems({
    filters: {
      model: 'IPHONE 17',
      deviceType: '-',
      condition: 'new',
    },
    groupByWarehouse: true,
  });

  const { dataQuery } = getItemQueries(hana);

  assert.match(dataQuery, /LOWER\(TRIM\(COALESCE\(T1\."U_Model", ''\)\)\) = 'iphone 17'/);
  assert.match(
    dataQuery,
    /\(T1\."U_DeviceType" IS NULL OR TRIM\(T1\."U_DeviceType"\) = '' OR TRIM\(T1\."U_DeviceType"\) = '-' OR LOWER\(TRIM\(T1\."U_DeviceType"\)\) = 'null'\)/,
  );
  assert.match(dataQuery, /LOWER\(TRIM\(COALESCE\(T1\."U_PROD_CONDITION", ''\)\)\) = 'yangi'/);
});

test('SapService getItems treats device-type aliases like standard and regular as blank base variants', async () => {
  const { hana, service } = createService();

  await service.getItems({
    filters: {
      deviceType: 'standard',
    },
  });

  const { dataQuery } = getItemQueries(hana);

  assert.match(
    dataQuery,
    /\(T1\."U_DeviceType" IS NULL OR TRIM\(T1\."U_DeviceType"\) = '' OR TRIM\(T1\."U_DeviceType"\) = '-' OR LOWER\(TRIM\(T1\."U_DeviceType"\)\) = 'null'\)/,
  );
});

test('SapService getItems normalizes Pro Max device-type filters', async () => {
  const { hana, service } = createService();

  await service.getItems({
    filters: {
      deviceType: 'pro-max',
    },
  });

  const { dataQuery } = getItemQueries(hana);

  assert.match(dataQuery, /LOWER\(TRIM\(COALESCE\(T1\."U_DeviceType", ''\)\)\) = 'pro max'/);
});

test('SapService getItems normalizes B/U condition aliases in filters', async () => {
  const { hana, service } = createService();

  await service.getItems({
    filters: {
      condition: 'bu',
    },
  });

  const { dataQuery } = getItemQueries(hana);

  assert.match(dataQuery, /LOWER\(TRIM\(COALESCE\(T1\."U_PROD_CONDITION", ''\)\)\) = 'b\/u'/);
});

test('SapService getItems applies exact-match filters for model, memory, sim type, color, and item group', async () => {
  const { hana, service } = createService();

  await service.getItems({
    filters: {
      model: 'iPhone 16',
      memory: '256GB',
      simType: 'eSIM',
      color: 'Black',
      itemGroupCode: 123,
    },
  });

  const { dataQuery } = getItemQueries(hana);

  assert.match(dataQuery, /LOWER\(TRIM\(COALESCE\(T1\."U_Model", ''\)\)\) = 'iphone 16'/);
  assert.match(dataQuery, /LOWER\(TRIM\(COALESCE\(T1\."U_Memory", ''\)\)\) = '256gb'/);
  assert.match(dataQuery, /LOWER\(TRIM\(COALESCE\(T1\."U_Sim_type", ''\)\)\) = 'esim'/);
  assert.match(dataQuery, /LOWER\(TRIM\(COALESCE\(T1\."U_Color", ''\)\)\) = 'black'/);
  assert.match(dataQuery, /T1\."ItmsGrpCod" = '123'/);
});

test('SapService getItems excludes zero stock by default and can include it when requested', async () => {
  const defaultRun = createService();
  await defaultRun.service.getItems({});
  assert.match(getItemQueries(defaultRun.hana).dataQuery, /T0\."OnHand" > 0/);
  assert.match(getItemQueries(defaultRun.hana).dataQuery, /COALESCE\(PR\."Price", 0\) > 0/);
  assert.match(getItemQueries(defaultRun.hana).dataQuery, /COALESCE\(RP\."CostTotal", 0\) > 0/);

  const includeZeroRun = createService();
  await includeZeroRun.service.getItems({ includeZeroOnHand: true });
  assert.doesNotMatch(getItemQueries(includeZeroRun.hana).dataQuery, /T0\."OnHand" > 0/);
  assert.match(getItemQueries(includeZeroRun.hana).dataQuery, /COALESCE\(PR\."Price", 0\) > 0/);
  assert.match(getItemQueries(includeZeroRun.hana).dataQuery, /COALESCE\(RP\."CostTotal", 0\) > 0/);
});

test('SapService getItems filters by warehouse code and normalized store name', async () => {
  const { hana, service } = createService();

  await service.getItems({
    storeName: 'Samarqand Darboza',
    whsCode: "WH'01",
  });

  const { dataQuery } = getItemQueries(hana);

  assert.match(dataQuery, /T0\."WhsCode" = 'WH''01'/);
  assert.match(
    dataQuery,
    /LOWER\(COALESCE\(T2\."WhsName", ''\)\) LIKE '%samarqand darboza%' ESCAPE '\\'/,
  );
});

test('SapService getItems escapes quotes and LIKE wildcards in search and store filters', async () => {
  const { hana, service } = createService();

  await service.getItems({
    search: "Kid's 100%_test\\case",
    storeName: "O'zbekiston 100%_\\",
  });

  const { dataQuery } = getItemQueries(hana);

  assert.match(dataQuery, /LIKE '%kid''s 100\\%\\_test\\\\case%' ESCAPE '\\'/);
  assert.match(dataQuery, /LIKE '%o''zbekiston 100\\%\\_\\\\%' ESCAPE '\\'/);
});

test('SapService getItems enables IMEI mode for numeric searches with four or more digits', async () => {
  const { hana, service } = createService();

  await service.getItems({
    search: '123456789012345',
    whsCode: 'WH01',
  });

  const { dataQuery, countQuery } = getItemQueries(hana);

  assert.match(dataQuery, /LEFT JOIN PROBOX_PROD_3\."OSRN" R/);
  assert.match(dataQuery, /LEFT JOIN PROBOX_PROD_3\."OSRQ" Q/);
  assert.match(dataQuery, /Q\."WhsCode" = 'WH01'/);
  assert.match(dataQuery, /R\."DistNumber" LIKE '%123456789012345%'/);
  assert.match(dataQuery, /Q\."Quantity" > 0/);
  assert.match(dataQuery, /R\."DistNumber" AS "IMEI"/);
  assert.match(dataQuery, /WHEN Q\."Quantity" > 0 THEN R\."CostTotal"/);
  assert.match(dataQuery, /AS "PurchasePrice"/);
  assert.match(dataQuery, /GROUP BY[\s\S]*R\."DistNumber"/);
  assert.match(countQuery, /COUNT\(DISTINCT R\."DistNumber"\) AS "total"/);
  assert.doesNotMatch(dataQuery, /MAX\(PR\."Price"\) DESC/);
});

test('SapService getItems returns effective UZS sale prices for new and used products', async () => {
  const { hana, service } = createService();

  await service.getItems({
    search: 'iphone 15 bu',
    groupByWarehouse: true,
  });

  const { dataQuery } = getItemQueries(hana);

  assert.match(
    dataQuery,
    /WHEN LOWER\(TRIM\(COALESCE\(MAX\(T1\."U_PROD_CONDITION"\), ''\)\)\) IN \('b\/u', 'b\\u'\)/,
  );
  assert.match(dataQuery, /SELECT MAX\(RP\."CostTotal"\)/);
  assert.match(dataQuery, /FROM PROBOX_PROD_3\."ORTT" RT/);
  assert.match(dataQuery, /WHERE RT\."Currency" = 'UZS'/);
  assert.match(dataQuery, /ELSE MAX\(PR\."Price"\)/);
  assert.match(dataQuery, /END\s+AS "SalePrice"/);
  assert.match(dataQuery, /QP\."WhsCode" = T0\."WhsCode"/);
});

test('SapService getItems respects pagination and warehouse grouping flags', async () => {
  const groupedRun = createService();
  await groupedRun.service.getItems({
    groupByWarehouse: true,
    limit: 7,
    offset: 14,
  });

  const groupedQueries = getItemQueries(groupedRun.hana);
  assert.match(groupedQueries.dataQuery, /T0\."WhsCode" AS "WhsCode"/);
  assert.match(groupedQueries.dataQuery, /GROUP BY[\s\S]*T1\."ItmsGrpCod", T0\."WhsCode"/);
  assert.match(
    groupedQueries.countQuery,
    /COUNT\(DISTINCT T0\."ItemCode" \|\| ':' \|\| T0\."WhsCode"\) AS "total"/,
  );
  assert.match(groupedQueries.dataQuery, /LIMIT 7/);
  assert.match(groupedQueries.dataQuery, /OFFSET 14/);

  const ungroupedRun = createService();
  await ungroupedRun.service.getItems({
    groupByWarehouse: false,
  });

  const ungroupedQueries = getItemQueries(ungroupedRun.hana);
  assert.match(ungroupedQueries.dataQuery, /MAX\(T0\."WhsCode"\) AS "WhsCode"/);
  assert.match(ungroupedQueries.countQuery, /COUNT\(DISTINCT T0\."ItemCode"\) AS "total"/);
});

test('SapService getItems uses fallback ranking and default condition ordering for generic searches', async () => {
  const { hana, service } = createService();

  await service.getItems({
    search: 'iphone',
  });

  const { dataQuery } = getItemQueries(hana);

  assert.match(dataQuery, /CASE\s+WHEN LOWER\(T0\."ItemCode"\) = 'iphone' THEN 0/);
  assert.match(
    dataQuery,
    /WHEN LOWER\(TRIM\(COALESCE\(MAX\(T1\."U_PROD_CONDITION"\), ''\)\)\) = 'yangi' THEN 0/,
  );
  assert.match(
    dataQuery,
    /WHEN LOWER\(TRIM\(COALESCE\(MAX\(T1\."U_PROD_CONDITION"\), ''\)\)\) = 'b\/u' THEN 1/,
  );
  assert.match(dataQuery, /END DESC, MAX\(T1\."ItemName"\) ASC/);
});

test('SapService getItems returns SAP rows together with the parsed total', async () => {
  const items: ISapItem[] = [
    {
      ItemCode: 'IP16',
      WhsCode: 'W01',
      OnHand: 3,
      ItemName: 'iPhone 16',
      ItemGroupCode: 10,
      ItemGroupName: 'Phones',
      WhsName: 'Nurafshon',
      SalePrice: 12_000_000,
    },
  ];

  const { service } = createService(createQueuedResolver(items, [{ total: '4' }]));

  const result = await service.getItems({
    search: 'iphone 16',
  });

  assert.deepEqual(result, {
    data: items,
    total: 4,
  });
});

test('SapService getItems returns a valuable Redis result without hitting SAP', async () => {
  const cachedItems: ISapItem[] = [
    {
      ItemCode: 'IP16',
      WhsCode: 'W01',
      OnHand: 3,
      ItemName: 'iPhone 16',
      ItemGroupCode: 10,
      ItemGroupName: 'Phones',
      WhsName: 'Nurafshon',
      SalePrice: 12_000_000,
    },
  ];
  const cache = new MockCacheStore(
    createCacheEnvelope({
      data: cachedItems,
      total: 1,
    }),
  );
  const hana = new MockHanaService(async () => {
    throw new Error('SAP should not be queried for a useful cache hit');
  });
  const service = new SapService(hana, cache, {
    cachePrefix: 'test:sap',
  });

  const result = await service.getItems({ search: 'iphone 16' });

  assert.deepEqual(result, {
    data: cachedItems,
    total: 1,
  });
  assert.equal(hana.calls.length, 0);
  assert.equal(cache.getCalls.length, 1);
  assert.equal(cache.setCalls.length, 0);
});

test('SapService getItems refreshes from SAP when Redis only has an empty result', async () => {
  const items: ISapItem[] = [
    {
      ItemCode: 'IP16',
      WhsCode: 'W01',
      OnHand: 3,
      ItemName: 'iPhone 16',
      ItemGroupCode: 10,
      ItemGroupName: 'Phones',
      WhsName: 'Nurafshon',
      SalePrice: 12_000_000,
    },
  ];
  const cache = new MockCacheStore(
    createCacheEnvelope({
      data: [],
      total: 0,
    }),
  );
  const hana = new MockHanaService(createQueuedResolver(items, [{ total: '1' }]));
  const service = new SapService(hana, cache, {
    cachePrefix: 'test:sap',
    cacheTtlSeconds: 42,
  });

  const result = await service.getItems({ search: 'iphone 16' });

  assert.deepEqual(result, {
    data: items,
    total: 1,
  });
  assert.equal(hana.calls.length, 2);
  assert.equal(cache.getCalls.length, 1);
  assert.equal(cache.setCalls.length, 1);
  assert.equal(cache.setCalls[0].expireTime, 42);
});

test('SapService getItems wraps HANA failures with a stable error message', async () => {
  const { service } = createService(async (query) => {
    if (query.includes('COUNT(DISTINCT')) {
      return [{ total: 0 }];
    }

    throw new Error('boom');
  });

  await assert.rejects(
    () => service.getItems({ search: 'iphone 16' }),
    /SAP query failed \(getItems\)/,
  );
});
