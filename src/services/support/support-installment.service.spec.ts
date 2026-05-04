import test from 'node:test';
import assert from 'node:assert/strict';

import { SupportInstallmentService } from './support-installment.service';

const makeSapItem = (overrides: Record<string, unknown> = {}) => ({
  IMEI: '123456789012345',
  ItemCode: 'IP16',
  ItemName: 'iPhone 16',
  WhsCode: 'W01',
  WhsName: 'Nurafshon',
  OnHand: '1',
  SalePrice: '12000000',
  PurchasePrice: '9000000',
  U_Model: 'iPhone 16',
  U_DeviceType: null,
  U_Memory: '128GB',
  U_Color: 'Black',
  U_Sim_type: 'eSIM',
  U_PROD_CONDITION: 'Yangi',
  ...overrides,
});

const withMockSapService = async (
  mockSapService: Record<string, unknown>,
  testBody: () => Promise<void>,
) => {
  const target = SupportInstallmentService as unknown as { sapService: unknown };
  const originalSapService = target.sapService;

  target.sapService = mockSapService;

  try {
    await testBody();
  } finally {
    target.sapService = originalSapService;
  }
};

test('SupportInstallmentService calculates new-product monthly installment from SalePrice', async () => {
  await withMockSapService(
    {
      getInstallmentItemByImeiOrItemCode: async () => makeSapItem(),
      getInstallmentPercentageForMonths: async () => ({ month: 12, percentage: 63 }),
    },
    async () => {
      const result = await SupportInstallmentService.calculateMonthlyInstallment({
        imei: '123456789012345',
        itemCode: 'IP16',
        months: 12,
        downPayment: 2_000_000,
      });

      assert.equal(result.ok, true);
      assert.equal(result.price_source, 'SalePrice');
      assert.equal(result.actual_price, 12_000_000);
      assert.equal(result.financed_amount, 10_000_000);
      assert.equal(result.monthly_installment, 1_358_000);
      assert.equal('total_after_percentage' in result, false);
    },
  );
});

test('SupportInstallmentService calculates used-product monthly installment from PurchasePrice', async () => {
  await withMockSapService(
    {
      getInstallmentItemByImeiOrItemCode: async () =>
        makeSapItem({
          U_PROD_CONDITION: 'B\\U',
          SalePrice: '12000000',
          PurchasePrice: '900',
        }),
      getInstallmentPercentageForMonths: async () => ({ month: 6, percentage: 38 }),
      getLatestExchangeRate: async () => 12_500,
    },
    async () => {
      const result = await SupportInstallmentService.calculateMonthlyInstallment({
        imei: '123456789012345',
        itemCode: 'IP16',
        months: 6,
        downPayment: null,
      });

      assert.equal(result.ok, true);
      assert.equal(result.price_source, 'PurchasePrice');
      assert.equal(result.actual_price, 11_925_000);
      assert.equal(result.down_payment, 1_000_000);
      assert.equal(result.financed_amount, 10_925_000);
      assert.equal(result.monthly_installment, 2_513_000);
      assert.equal('total_after_percentage' in result, false);
    },
  );
});

test('SupportInstallmentService defaults missing or zero down payment to minimum required amount', async () => {
  await withMockSapService(
    {
      getInstallmentItemByImeiOrItemCode: async () => makeSapItem(),
      getInstallmentPercentageForMonths: async () => ({ month: 12, percentage: 63 }),
    },
    async () => {
      const missingResult = await SupportInstallmentService.calculateMonthlyInstallment({
        itemCode: 'IP16',
        months: 12,
      });
      const zeroResult = await SupportInstallmentService.calculateMonthlyInstallment({
        itemCode: 'IP16',
        months: 12,
        downPayment: 0,
      });
      const smallResult = await SupportInstallmentService.calculateMonthlyInstallment({
        itemCode: 'IP16',
        months: 12,
        downPayment: 500_000,
      });

      assert.equal(missingResult.ok, true);
      assert.equal(missingResult.down_payment, 1_000_000);
      assert.equal(zeroResult.ok, true);
      assert.equal(zeroResult.down_payment, 1_000_000);
      assert.equal(smallResult.ok, true);
      assert.equal(smallResult.down_payment, 1_000_000);
    },
  );
});

test('SupportInstallmentService applies used-product USD adjustment tiers before UZS conversion', async () => {
  const cases = [
    { purchasePrice: '500', expectedActualPrice: 6_875_000, expectedMonthly: 5_875_000 },
    { purchasePrice: '1000', expectedActualPrice: 13_250_000, expectedMonthly: 12_250_000 },
    { purchasePrice: '1001', expectedActualPrice: 12_887_875, expectedMonthly: 11_888_000 },
  ];

  for (const item of cases) {
    await withMockSapService(
      {
        getInstallmentItemByImeiOrItemCode: async () =>
          makeSapItem({
            U_PROD_CONDITION: 'B/U',
            PurchasePrice: item.purchasePrice,
          }),
        getInstallmentPercentageForMonths: async () => ({ month: 1, percentage: 0 }),
        getLatestExchangeRate: async () => 12_500,
      },
      async () => {
        const result = await SupportInstallmentService.calculateMonthlyInstallment({
          itemCode: 'IP16',
          months: 1,
        });

        assert.equal(result.ok, true);
        assert.equal(result.actual_price, item.expectedActualPrice);
        assert.equal(result.down_payment, 1_000_000);
        assert.equal(result.monthly_installment, item.expectedMonthly);
      },
    );
  }
});

test('SupportInstallmentService requires USD exchange rate for used products', async () => {
  await withMockSapService(
    {
      getInstallmentItemByImeiOrItemCode: async () =>
        makeSapItem({
          U_PROD_CONDITION: 'B/U',
          PurchasePrice: '900',
        }),
      getInstallmentPercentageForMonths: async () => ({ month: 6, percentage: 38 }),
      getLatestExchangeRate: async () => null,
    },
    async () => {
      const result = await SupportInstallmentService.calculateMonthlyInstallment({
        itemCode: 'IP16',
        months: 6,
      });

      assert.equal(result.ok, false);
      assert.equal(result.error, 'usd_exchange_rate_not_found_for_used_product');
      assert.equal(result.price_source, 'PurchasePrice');
    },
  );
});

test('SupportInstallmentService requires PurchasePrice for used products', async () => {
  await withMockSapService(
    {
      getInstallmentItemByImeiOrItemCode: async () =>
        makeSapItem({
          U_PROD_CONDITION: 'B/U',
          PurchasePrice: null,
        }),
      getInstallmentPercentageForMonths: async () => ({ month: 6, percentage: 38 }),
    },
    async () => {
      const result = await SupportInstallmentService.calculateMonthlyInstallment({
        itemCode: 'IP16',
        months: 6,
      });

      assert.equal(result.ok, false);
      assert.equal(result.error, 'purchase_price_not_found_for_used_product');
      assert.equal(result.price_source, 'PurchasePrice');
    },
  );
});
