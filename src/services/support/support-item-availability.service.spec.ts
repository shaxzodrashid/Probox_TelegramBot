import assert from 'node:assert/strict';
import test from 'node:test';

import { SupportItemAvailabilityService } from './support-item-availability.service';

test('SupportItemAvailabilityService trims input, clamps limits, normalizes items, and sorts by stock', async () => {
  const availabilityServiceClass = SupportItemAvailabilityService as any;
  const originalGetItems = availabilityServiceClass.sapService.getItems;

  let capturedParams: Record<string, unknown> | null = null;

  availabilityServiceClass.sapService.getItems = async (params: Record<string, unknown>) => {
    capturedParams = params;

    return {
      total: 3,
      data: [
        {
          ItemCode: 'IP16',
          ItemName: 'iPhone 16',
          WhsCode: 'W01',
          WhsName: 'Nurafshon',
          OnHand: '2',
          SalePrice: '12000000',
          ItemGroupName: 'Phones',
          U_Model: 'iPhone 16',
          U_Color: 'Black',
          U_Memory: '128GB',
          U_PROD_CONDITION: 'Yangi',
          U_Sim_type: 'eSIM',
        },
        {
          ItemCode: 'IP16PM',
          ItemName: 'iPhone 16 Pro Max',
          WhsCode: 'W02',
          WhsName: 'Samarqand Darvoza',
          OnHand: 7,
          SalePrice: 18000000,
          ItemGroupName: 'Phones',
          U_Model: 'iPhone 16',
          U_Color: 'Natural',
          U_Memory: '256GB',
          U_Condition: 'B/U',
          U_Sim_type: 'Physical SIM',
        },
      ],
    };
  };

  try {
    const result = await SupportItemAvailabilityService.lookupAvailableItems({
      query: '  iphone 16  ',
      store: '  Nurafshon  ',
      limit: 99,
    });

    assert.deepEqual(capturedParams, {
      search: 'iphone 16',
      limit: 10,
      offset: 0,
      includeZeroOnHand: false,
      storeName: 'Nurafshon',
      groupByWarehouse: true,
    });

    assert.deepEqual(result, {
      ok: true,
      search: 'iphone 16',
      query: 'iphone 16',
      store: 'Nurafshon',
      requested_filters: {
        model: null,
        device_type: null,
        memory: null,
        color: null,
        sim_type: null,
        condition: null,
      },
      exact_match: true,
      no_exact_match: false,
      no_exact_match_message: null,
      total_matches: 3,
      returned_matches: 2,
      items: [
        {
          item_code: 'IP16PM',
          item_name: 'iPhone 16 Pro Max',
          store_code: 'W02',
          store_name: 'Samarqand Darvoza',
          on_hand: 7,
          sale_price: 18000000,
          item_group_name: 'Phones',
          model: 'iPhone 16',
          device_type: null,
          color: 'Natural',
          memory: '256GB',
          condition: 'B/U',
          sim_type: 'Physical SIM',
        },
        {
          item_code: 'IP16',
          item_name: 'iPhone 16',
          store_code: 'W01',
          store_name: 'Nurafshon',
          on_hand: 2,
          sale_price: 12000000,
          item_group_name: 'Phones',
          model: 'iPhone 16',
          device_type: null,
          color: 'Black',
          memory: '128GB',
          condition: 'Yangi',
          sim_type: 'eSIM',
        },
      ],
      suggestions: null,
    });
  } finally {
    availabilityServiceClass.sapService.getItems = originalGetItems;
  }
});

test('SupportItemAvailabilityService falls back to the default limit and omits blank stores', async () => {
  const availabilityServiceClass = SupportItemAvailabilityService as any;
  const originalGetItems = availabilityServiceClass.sapService.getItems;

  let capturedParams: Record<string, unknown> | null = null;

  availabilityServiceClass.sapService.getItems = async (params: Record<string, unknown>) => {
    capturedParams = params;
    return { total: 0, data: [] };
  };

  try {
    await SupportItemAvailabilityService.lookupAvailableItems({
      query: 'galaxy',
      store: '   ',
      limit: Number.NaN,
    });

    assert.deepEqual(capturedParams, {
      search: 'galaxy',
      limit: 5,
      offset: 0,
      includeZeroOnHand: false,
      storeName: undefined,
      groupByWarehouse: true,
    });
  } finally {
    availabilityServiceClass.sapService.getItems = originalGetItems;
  }
});

test('SupportItemAvailabilityService normalizes unofficial product naming before SAP lookup', async () => {
  const availabilityServiceClass = SupportItemAvailabilityService as any;
  const originalGetItems = availabilityServiceClass.sapService.getItems;

  let capturedParams: Record<string, unknown> | null = null;

  availabilityServiceClass.sapService.getItems = async (params: Record<string, unknown>) => {
    capturedParams = params;
    return { total: 0, data: [] };
  };

  try {
    const result = await SupportItemAvailabilityService.lookupAvailableItems({
      query: ' Ayfon 15 yengisi ',
    });

    assert.deepEqual(capturedParams, {
      search: 'iphone 15 new',
      limit: 5,
      offset: 0,
      includeZeroOnHand: false,
      storeName: undefined,
      groupByWarehouse: true,
    });

    assert.equal(result.query, 'iphone 15 new');
  } finally {
    availabilityServiceClass.sapService.getItems = originalGetItems;
  }
});

test('SupportItemAvailabilityService rejects blank search queries', async () => {
  await assert.rejects(
    () =>
      SupportItemAvailabilityService.lookupAvailableItems({
        query: '   ',
      }),
    /Item search query is required/,
  );
});

test('SupportItemAvailabilityService groups available device names into new and used lists', async () => {
  const availabilityServiceClass = SupportItemAvailabilityService as any;
  const originalGetAvailableDeviceNames = availabilityServiceClass.sapService.getAvailableDeviceNames;

  availabilityServiceClass.sapService.getAvailableDeviceNames = async () => ({
    newDevices: [' iPhone 15 ', 'iPhone 16 Pro', 'iPhone 15'],
    usedDevices: ['iPhone 14 Pro Max', 'iPhone 15', ''],
  });

  try {
    const result = await SupportItemAvailabilityService.lookupAvailableDevices();

    assert.deepEqual(result, {
      ok: true,
      new_devices: ['iPhone 15', 'iPhone 16 Pro'],
      used_devices: ['iPhone 14 Pro Max', 'iPhone 15'],
    });
  } finally {
    availabilityServiceClass.sapService.getAvailableDeviceNames = originalGetAvailableDeviceNames;
  }
});

test('SupportItemAvailabilityService filters out items without settled sale prices', async () => {
  const availabilityServiceClass = SupportItemAvailabilityService as any;
  const originalGetItems = availabilityServiceClass.sapService.getItems;

  availabilityServiceClass.sapService.getItems = async () => ({
    total: 3,
    data: [
      {
        ItemCode: 'IP16',
        ItemName: 'iPhone 16',
        WhsCode: 'W01',
        WhsName: 'Nurafshon',
        OnHand: 2,
        SalePrice: 12000000,
        ItemGroupName: 'Phones',
      },
      {
        ItemCode: 'IP16NP',
        ItemName: 'iPhone 16 No Price',
        WhsCode: 'W02',
        WhsName: 'Samarqand Darvoza',
        OnHand: 3,
        SalePrice: null,
        ItemGroupName: 'Phones',
      },
      {
        ItemCode: 'IP16ZERO',
        ItemName: 'iPhone 16 Zero Price',
        WhsCode: 'W03',
        WhsName: 'Chilonzor',
        OnHand: 1,
        SalePrice: 0,
        ItemGroupName: 'Phones',
      },
    ],
  });

  try {
    const result = await SupportItemAvailabilityService.lookupAvailableItems({
      query: 'iphone 16',
    });

    assert.equal(result.returned_matches, 1);
    assert.deepEqual(
      result.items.map((item) => item.item_code),
      ['IP16'],
    );
  } finally {
    availabilityServiceClass.sapService.getItems = originalGetItems;
  }
});

test('SupportItemAvailabilityService returns same model suggestions when exact option filters miss', async () => {
  const availabilityServiceClass = SupportItemAvailabilityService as any;
  const originalGetItems = availabilityServiceClass.sapService.getItems;

  const capturedParams: Record<string, unknown>[] = [];

  availabilityServiceClass.sapService.getItems = async (params: Record<string, unknown>) => {
    capturedParams.push(params);

    if (capturedParams.length === 1) {
      return { total: 0, data: [] };
    }

    return {
      total: 2,
      data: [
        {
          ItemCode: 'IP17PM256BLUE',
          ItemName: 'iPhone 17 Pro Max 256GB Deep Blue nano-SIM Yangi',
          WhsCode: '04',
          WhsName: 'Samarqand darboza sklad',
          OnHand: 14,
          SalePrice: 19886000,
          ItemGroupName: 'iPhone',
          U_Model: 'iPhone 17',
          U_DeviceType: 'Pro Max',
          U_Color: 'Deep Blue',
          U_Memory: '256GB',
          U_PROD_CONDITION: 'Yangi',
          U_Sim_type: 'nano-SIM',
        },
        {
          ItemCode: 'IP17PM256SILVER',
          ItemName: 'iPhone 17 Pro Max 256GB Silver nano-SIM Yangi',
          WhsCode: '02',
          WhsName: 'Samarqand darboza sklad',
          OnHand: 10,
          SalePrice: 20190000,
          ItemGroupName: 'iPhone',
          U_Model: 'iPhone 17',
          U_DeviceType: 'Pro Max',
          U_Color: 'Silver',
          U_Memory: '256GB',
          U_PROD_CONDITION: 'Yangi',
          U_Sim_type: 'nano-SIM',
        },
      ],
    };
  };

  try {
    const result = await SupportItemAvailabilityService.lookupAvailableItems({
      query: '',
      model: 'iPhone 17',
      deviceType: 'Pro Max',
      memory: '512GB',
      color: 'Deep Blue',
      simType: 'eSIM',
      condition: 'Yangi',
    });

    assert.deepEqual(capturedParams[0], {
      search: undefined,
      filters: {
        model: 'iPhone 17',
        deviceType: 'Pro Max',
        memory: '512GB',
        color: 'Deep Blue',
        simType: 'eSIM',
        condition: 'Yangi',
      },
      limit: 5,
      offset: 0,
      includeZeroOnHand: false,
      storeName: undefined,
      groupByWarehouse: true,
    });
    assert.deepEqual(capturedParams[1], {
      filters: {
        model: 'iPhone 17',
        deviceType: 'Pro Max',
        condition: 'Yangi',
      },
      limit: 10,
      offset: 0,
      includeZeroOnHand: false,
      storeName: undefined,
      groupByWarehouse: true,
    });
    assert.equal(result.exact_match, false);
    assert.equal(result.no_exact_match, true);
    assert.match(result.no_exact_match_message || '', /No exact matching item/i);
    assert.deepEqual(result.suggestions?.available_options, {
      memories: ['256GB'],
      colors: ['Deep Blue', 'Silver'],
      sim_types: ['nano-SIM'],
      conditions: ['Yangi'],
    });
    assert.deepEqual(
      result.suggestions?.items.map((item) => ({
        item_code: item.item_code,
        device_type: item.device_type,
        memory: item.memory,
        color: item.color,
        sim_type: item.sim_type,
      })),
      [
        {
          item_code: 'IP17PM256BLUE',
          device_type: 'Pro Max',
          memory: '256GB',
          color: 'Deep Blue',
          sim_type: 'nano-SIM',
        },
        {
          item_code: 'IP17PM256SILVER',
          device_type: 'Pro Max',
          memory: '256GB',
          color: 'Silver',
          sim_type: 'nano-SIM',
        },
      ],
    );
  } finally {
    availabilityServiceClass.sapService.getItems = originalGetItems;
  }
});
