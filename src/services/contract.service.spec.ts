import assert from 'node:assert/strict';
import test from 'node:test';
import { ContractService } from './contract.service';

test('ContractService converts USD contracts to UZS display amounts', { concurrency: false }, async () => {
  const contractServiceClass = ContractService as unknown as {
    sapService: {
      getBPpurchasesByCardCode: (cardCode: string) => Promise<unknown[]>;
      getLatestExchangeRate: (currency?: string) => Promise<number | null>;
    };
  };
  const originalGetPurchases = contractServiceClass.sapService.getBPpurchasesByCardCode;
  const originalGetLatestExchangeRate = contractServiceClass.sapService.getLatestExchangeRate;

  try {
    contractServiceClass.sapService.getBPpurchasesByCardCode = async () => [
      {
        DocEntry: 20,
        DocNum: 6020,
        CardCode: 'C010',
        CardName: 'Contract Buyer',
        DocDate: '2026-04-01',
        DocDueDate: '2026-05-01',
        DocCur: 'USD',
        Total: 200,
        TotalPaid: 50,
        InstlmntID: 1,
        InstDueDate: '2026-05-01',
        InstTotal: 200,
        InstPaidToDate: 50,
        InstStatus: 'O',
        itemsPairs: 'IP15::iPhone 15::200',
      },
    ];
    contractServiceClass.sapService.getLatestExchangeRate = async () => 12_500;

    const contracts = await ContractService.getContractsByCardCode('C010');

    assert.equal(contracts.length, 1);
    assert.equal(contracts[0].currency, 'UZS');
    assert.equal(contracts[0].displayCurrency, 'UZS');
    assert.equal(contracts[0].sourceCurrency, 'USD');
    assert.equal(contracts[0].totalAmount, 2_500_000);
    assert.equal(contracts[0].totalPaid, 625_000);
    assert.equal(contracts[0].installments[0].total, 2_500_000);
    assert.equal(contracts[0].installments[0].paid, 625_000);
  } finally {
    contractServiceClass.sapService.getBPpurchasesByCardCode = originalGetPurchases;
    contractServiceClass.sapService.getLatestExchangeRate = originalGetLatestExchangeRate;
  }
});

test('ContractService keeps original currency when exchange rate is unavailable', { concurrency: false }, async () => {
  const contractServiceClass = ContractService as unknown as {
    sapService: {
      getBPpurchasesByCardCode: (cardCode: string) => Promise<unknown[]>;
      getLatestExchangeRate: (currency?: string) => Promise<number | null>;
    };
  };
  const originalGetPurchases = contractServiceClass.sapService.getBPpurchasesByCardCode;
  const originalGetLatestExchangeRate = contractServiceClass.sapService.getLatestExchangeRate;

  try {
    contractServiceClass.sapService.getBPpurchasesByCardCode = async () => [
      {
        DocEntry: 21,
        DocNum: 6021,
        CardCode: 'C011',
        CardName: 'Fallback Contract Buyer',
        DocDate: '2026-04-01',
        DocDueDate: '2026-05-01',
        DocCur: 'USD',
        Total: 200,
        TotalPaid: 0,
        InstlmntID: 1,
        InstDueDate: '2026-05-01',
        InstTotal: 200,
        InstPaidToDate: 0,
        InstStatus: 'O',
        itemsPairs: 'IP16::iPhone 16::200',
      },
    ];
    contractServiceClass.sapService.getLatestExchangeRate = async () => {
      throw new Error('ORTT unavailable');
    };

    const contracts = await ContractService.getContractsByCardCode('C011');

    assert.equal(contracts[0].currency, 'USD');
    assert.equal(contracts[0].displayCurrency, 'USD');
    assert.equal(contracts[0].totalAmount, 200);
    assert.equal(contracts[0].installments[0].total, 200);
  } finally {
    contractServiceClass.sapService.getBPpurchasesByCardCode = originalGetPurchases;
    contractServiceClass.sapService.getLatestExchangeRate = originalGetLatestExchangeRate;
  }
});

test('ContractService leaves non-USD contracts unchanged', { concurrency: false }, async () => {
  const contractServiceClass = ContractService as unknown as {
    sapService: {
      getBPpurchasesByCardCode: (cardCode: string) => Promise<unknown[]>;
      getLatestExchangeRate: (currency?: string) => Promise<number | null>;
    };
  };
  const originalGetPurchases = contractServiceClass.sapService.getBPpurchasesByCardCode;
  const originalGetLatestExchangeRate = contractServiceClass.sapService.getLatestExchangeRate;

  try {
    contractServiceClass.sapService.getBPpurchasesByCardCode = async () => [
      {
        DocEntry: 22,
        DocNum: 6022,
        CardCode: 'C012',
        CardName: 'UZS Contract Buyer',
        DocDate: '2026-04-01',
        DocDueDate: '2026-05-01',
        DocCur: 'UZS',
        Total: 700000,
        TotalPaid: 300000,
        InstlmntID: 1,
        InstDueDate: '2026-05-01',
        InstTotal: 700000,
        InstPaidToDate: 300000,
        InstStatus: 'O',
        itemsPairs: 'TV01::TV::700000',
      },
    ];
    contractServiceClass.sapService.getLatestExchangeRate = async () => 12_500;

    const contracts = await ContractService.getContractsByCardCode('C012');

    assert.equal(contracts[0].currency, 'UZS');
    assert.equal(contracts[0].displayCurrency, 'UZS');
    assert.equal(contracts[0].sourceCurrency, 'UZS');
    assert.equal(contracts[0].totalAmount, 700000);
    assert.equal(contracts[0].installments[0].paid, 300000);
  } finally {
    contractServiceClass.sapService.getBPpurchasesByCardCode = originalGetPurchases;
    contractServiceClass.sapService.getLatestExchangeRate = originalGetLatestExchangeRate;
  }
});
