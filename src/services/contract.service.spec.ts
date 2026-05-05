import assert from 'node:assert/strict';
import test from 'node:test';
import { ContractService } from './contract.service';

test(
  'ContractService preserves USD display currency without exchange-rate conversion',
  { concurrency: false },
  async () => {
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
      assert.equal(contracts[0].currency, 'USD');
      assert.equal(contracts[0].displayCurrency, 'USD');
      assert.equal(contracts[0].sourceCurrency, 'USD');
      assert.equal(contracts[0].totalAmount, 200);
      assert.equal(contracts[0].totalPaid, 50);
      assert.equal(contracts[0].totalPaidCurrency, 'USD');
      assert.equal(contracts[0].installments[0].total, 200);
      assert.equal(contracts[0].installments[0].paid, 50);
      assert.equal(contracts[0].installments[0].currency, 'USD');
    } finally {
      contractServiceClass.sapService.getBPpurchasesByCardCode = originalGetPurchases;
      contractServiceClass.sapService.getLatestExchangeRate = originalGetLatestExchangeRate;
    }
  },
);

test(
  'ContractService keeps original currency when exchange rate is unavailable',
  { concurrency: false },
  async () => {
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
          InstPaidSys: 0,
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
  },
);

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
        InstPaidSys: 300000,
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
    assert.equal(contracts[0].totalPaidCurrency, 'UZS');
    assert.equal(contracts[0].installments[0].paid, 300000);
    assert.equal(contracts[0].installments[0].currency, 'UZS');
  } finally {
    contractServiceClass.sapService.getBPpurchasesByCardCode = originalGetPurchases;
    contractServiceClass.sapService.getLatestExchangeRate = originalGetLatestExchangeRate;
  }
});

test('ContractService chooses display total from DocTotalFC for UZS and DocTotal for USD', {
  concurrency: false,
}, async () => {
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
        DocEntry: 25,
        DocNum: 6025,
        CardCode: 'C012',
        CardName: 'UZS Contract Buyer',
        DocDate: '2026-04-01',
        DocDueDate: '2026-05-01',
        DocCur: 'UZS',
        DocTotal: 12_500_000,
        DocTotalFC: 1_000,
        Total: 12_500_000,
        TotalPaid: 0,
        InstlmntID: 1,
        InstDueDate: '2026-05-01',
        InstTotal: 1_000,
        InstPaidSys: 0,
        InstStatus: 'O',
        itemsPairs: 'TV01::TV::1000',
      },
      {
        DocEntry: 26,
        DocNum: 6026,
        CardCode: 'C012',
        CardName: 'USD Contract Buyer',
        DocDate: '2026-04-01',
        DocDueDate: '2026-05-01',
        DocCur: 'USD',
        DocTotal: 2_000,
        DocTotalFC: 25_000_000,
        Total: 25_000_000,
        TotalPaid: 0,
        InstlmntID: 1,
        InstDueDate: '2026-05-01',
        InstTotal: 2_000,
        InstPaidSys: 0,
        InstStatus: 'O',
        itemsPairs: 'TV02::TV::2000',
      },
    ];
    contractServiceClass.sapService.getLatestExchangeRate = async () => 12_500;

    const contracts = await ContractService.getContractsByCardCode('C012');
    const uzsContract = contracts.find((contract) => contract.id === '25');
    const usdContract = contracts.find((contract) => contract.id === '26');

    assert.equal(uzsContract?.totalAmount, 1_000);
    assert.equal(uzsContract?.currency, 'UZS');
    assert.equal(usdContract?.totalAmount, 2_000);
    assert.equal(usdContract?.currency, 'USD');
  } finally {
    contractServiceClass.sapService.getBPpurchasesByCardCode = originalGetPurchases;
    contractServiceClass.sapService.getLatestExchangeRate = originalGetLatestExchangeRate;
  }
});

test(
  'ContractService prefers jshshir lookup when it is available',
  { concurrency: false },
  async () => {
    const contractServiceClass = ContractService as unknown as {
      sapService: {
        getBusinessPartnerByJshshir: (jshshir: string) => Promise<Array<{ CardCode: string }>>;
        getBPpurchasesByCardCode: (cardCode: string) => Promise<unknown[]>;
        getLatestExchangeRate: (currency?: string) => Promise<number | null>;
      };
    };
    const originalGetPartnerByJshshir = contractServiceClass.sapService.getBusinessPartnerByJshshir;
    const originalGetPurchases = contractServiceClass.sapService.getBPpurchasesByCardCode;
    const originalGetLatestExchangeRate = contractServiceClass.sapService.getLatestExchangeRate;

    try {
      let requestedCardCode: string | null = null;

      contractServiceClass.sapService.getBusinessPartnerByJshshir = async () => [
        { CardCode: 'C777' },
      ];
      contractServiceClass.sapService.getBPpurchasesByCardCode = async (cardCode: string) => {
        requestedCardCode = cardCode;

        return [
          {
            DocEntry: 23,
            DocNum: 6023,
            CardCode: cardCode,
            CardName: 'JSHSHIR Buyer',
            DocDate: '2026-04-01',
            DocDueDate: '2026-05-01',
            DocCur: 'UZS',
            Total: 900000,
            TotalPaid: 100000,
            InstlmntID: 1,
            InstDueDate: '2026-05-01',
            InstTotal: 900000,
            InstPaidSys: 100000,
            InstStatus: 'O',
            itemsPairs: 'TV02::TV::900000',
          },
        ];
      };
      contractServiceClass.sapService.getLatestExchangeRate = async () => 12_500;

      const contracts = await ContractService.getContractsByIdentifiers({
        jshshir: '12345678901234',
        cardCode: 'C012',
      });

      assert.equal(requestedCardCode, 'C777');
      assert.equal(contracts.length, 1);
      assert.equal(contracts[0].id, '23');
    } finally {
      contractServiceClass.sapService.getBusinessPartnerByJshshir = originalGetPartnerByJshshir;
      contractServiceClass.sapService.getBPpurchasesByCardCode = originalGetPurchases;
      contractServiceClass.sapService.getLatestExchangeRate = originalGetLatestExchangeRate;
    }
  },
);

test(
  'ContractService falls back to CardCode when jshshir lookup does not match',
  { concurrency: false },
  async () => {
    const contractServiceClass = ContractService as unknown as {
      sapService: {
        getBusinessPartnerByJshshir: (jshshir: string) => Promise<Array<{ CardCode: string }>>;
        getBPpurchasesByCardCode: (cardCode: string) => Promise<unknown[]>;
        getLatestExchangeRate: (currency?: string) => Promise<number | null>;
      };
    };
    const originalGetPartnerByJshshir = contractServiceClass.sapService.getBusinessPartnerByJshshir;
    const originalGetPurchases = contractServiceClass.sapService.getBPpurchasesByCardCode;
    const originalGetLatestExchangeRate = contractServiceClass.sapService.getLatestExchangeRate;

    try {
      let requestedCardCode: string | null = null;

      contractServiceClass.sapService.getBusinessPartnerByJshshir = async () => [];
      contractServiceClass.sapService.getBPpurchasesByCardCode = async (cardCode: string) => {
        requestedCardCode = cardCode;

        return [
          {
            DocEntry: 24,
            DocNum: 6024,
            CardCode: cardCode,
            CardName: 'Fallback Buyer',
            DocDate: '2026-04-01',
            DocDueDate: '2026-05-01',
            DocCur: 'UZS',
            Total: 750000,
            TotalPaid: 250000,
            InstlmntID: 1,
            InstDueDate: '2026-05-01',
            InstTotal: 750000,
            InstPaidSys: 250000,
            InstStatus: 'O',
            itemsPairs: 'TV03::TV::750000',
          },
        ];
      };
      contractServiceClass.sapService.getLatestExchangeRate = async () => 12_500;

      const contracts = await ContractService.getContractsByIdentifiers({
        jshshir: '12345678901234',
        cardCode: 'C099',
      });

      assert.equal(requestedCardCode, 'C099');
      assert.equal(contracts.length, 1);
      assert.equal(contracts[0].id, '24');
    } finally {
      contractServiceClass.sapService.getBusinessPartnerByJshshir = originalGetPartnerByJshshir;
      contractServiceClass.sapService.getBPpurchasesByCardCode = originalGetPurchases;
      contractServiceClass.sapService.getLatestExchangeRate = originalGetLatestExchangeRate;
    }
  },
);
