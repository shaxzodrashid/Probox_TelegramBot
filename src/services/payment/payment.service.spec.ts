import assert from 'node:assert/strict';
import test from 'node:test';
import { PaymentService } from './payment.service';

test(
  'PaymentService preserves USD display currency without exchange-rate conversion',
  { concurrency: false },
  async () => {
    const paymentServiceClass = PaymentService as unknown as {
      sapService: {
        getBPpurchasesByCardCode: (cardCode: string) => Promise<unknown[]>;
        getLatestExchangeRate: (currency?: string) => Promise<number | null>;
      };
    };
    const originalGetPurchases = paymentServiceClass.sapService.getBPpurchasesByCardCode;
    const originalGetLatestExchangeRate = paymentServiceClass.sapService.getLatestExchangeRate;

    try {
      paymentServiceClass.sapService.getBPpurchasesByCardCode = async () => [
        {
          DocEntry: 10,
          DocNum: 5010,
          CardCode: 'C001',
          CardName: 'USD Buyer',
          DocDate: '2026-04-01',
          DocDueDate: '2026-05-01',
          DocCur: 'USD',
          Total: 100,
          TotalPaid: 25,
          InstlmntID: 1,
          InstDueDate: '2026-05-01',
          InstTotal: 100,
          InstPaidToDate: 25,
          InstStatus: 'O',
          itemsPairs: 'IP15::iPhone 15::100',
        },
      ];
      paymentServiceClass.sapService.getLatestExchangeRate = async () => 12_500;

      const payments = await PaymentService.getPaymentsByCardCode('C001');

      assert.equal(payments.length, 1);
      assert.equal(payments[0].currency, 'USD');
      assert.equal(payments[0].displayCurrency, 'USD');
      assert.equal(payments[0].sourceCurrency, 'USD');
      assert.equal(payments[0].total, 100);
      assert.equal(payments[0].totalPaid, 25);
      assert.equal(payments[0].totalPaidCurrency, 'USD');
      assert.equal(payments[0].allItems[0].price, 100);
      assert.equal(payments[0].installments[0].total, 100);
      assert.equal(payments[0].installments[0].paid, 25);
      assert.equal(payments[0].installments[0].currency, 'USD');
    } finally {
      paymentServiceClass.sapService.getBPpurchasesByCardCode = originalGetPurchases;
      paymentServiceClass.sapService.getLatestExchangeRate = originalGetLatestExchangeRate;
    }
  },
);

test(
  'PaymentService keeps original currency when exchange rate is unavailable',
  { concurrency: false },
  async () => {
    const paymentServiceClass = PaymentService as unknown as {
      sapService: {
        getBPpurchasesByCardCode: (cardCode: string) => Promise<unknown[]>;
        getLatestExchangeRate: (currency?: string) => Promise<number | null>;
      };
    };
    const originalGetPurchases = paymentServiceClass.sapService.getBPpurchasesByCardCode;
    const originalGetLatestExchangeRate = paymentServiceClass.sapService.getLatestExchangeRate;

    try {
      paymentServiceClass.sapService.getBPpurchasesByCardCode = async () => [
        {
          DocEntry: 11,
          DocNum: 5011,
          CardCode: 'C002',
          CardName: 'Fallback Buyer',
          DocDate: '2026-04-01',
          DocDueDate: '2026-05-01',
          DocCur: 'USD',
          Total: 100,
          TotalPaid: 0,
          InstlmntID: 1,
          InstDueDate: '2026-05-01',
          InstTotal: 100,
          InstPaidSys: 0,
          InstStatus: 'O',
          itemsPairs: 'IP16::iPhone 16::100',
        },
      ];
      paymentServiceClass.sapService.getLatestExchangeRate = async () => {
        throw new Error('ORTT unavailable');
      };

      const payments = await PaymentService.getPaymentsByCardCode('C002');

      assert.equal(payments[0].currency, 'USD');
      assert.equal(payments[0].displayCurrency, 'USD');
      assert.equal(payments[0].total, 100);
      assert.equal(payments[0].allItems[0].price, 100);
    } finally {
      paymentServiceClass.sapService.getBPpurchasesByCardCode = originalGetPurchases;
      paymentServiceClass.sapService.getLatestExchangeRate = originalGetLatestExchangeRate;
    }
  },
);

test('PaymentService leaves non-USD contracts unchanged', { concurrency: false }, async () => {
  const paymentServiceClass = PaymentService as unknown as {
    sapService: {
      getBPpurchasesByCardCode: (cardCode: string) => Promise<unknown[]>;
      getLatestExchangeRate: (currency?: string) => Promise<number | null>;
    };
  };
  const originalGetPurchases = paymentServiceClass.sapService.getBPpurchasesByCardCode;
  const originalGetLatestExchangeRate = paymentServiceClass.sapService.getLatestExchangeRate;

  try {
    paymentServiceClass.sapService.getBPpurchasesByCardCode = async () => [
      {
        DocEntry: 12,
        DocNum: 5012,
        CardCode: 'C003',
        CardName: 'UZS Buyer',
        DocDate: '2026-04-01',
        DocDueDate: '2026-05-01',
        DocCur: 'UZS',
        Total: 500000,
        TotalPaid: 200000,
        InstlmntID: 1,
        InstDueDate: '2026-05-01',
        InstTotal: 500000,
        InstPaidSys: 200000,
        InstStatus: 'O',
        itemsPairs: 'TV01::TV::500000',
      },
    ];
    paymentServiceClass.sapService.getLatestExchangeRate = async () => 12_500;

    const payments = await PaymentService.getPaymentsByCardCode('C003');

    assert.equal(payments[0].currency, 'UZS');
    assert.equal(payments[0].displayCurrency, 'UZS');
    assert.equal(payments[0].sourceCurrency, 'UZS');
    assert.equal(payments[0].total, 500000);
    assert.equal(payments[0].totalPaidCurrency, 'UZS');
    assert.equal(payments[0].allItems[0].price, 500000);
    assert.equal(payments[0].installments[0].currency, 'UZS');
  } finally {
    paymentServiceClass.sapService.getBPpurchasesByCardCode = originalGetPurchases;
    paymentServiceClass.sapService.getLatestExchangeRate = originalGetLatestExchangeRate;
  }
});

test(
  'PaymentService prefers jshshir lookup when it is available',
  { concurrency: false },
  async () => {
    const paymentServiceClass = PaymentService as unknown as {
      sapService: {
        getBusinessPartnerByJshshir: (jshshir: string) => Promise<Array<{ CardCode: string }>>;
        getBPpurchasesByCardCode: (cardCode: string) => Promise<unknown[]>;
        getLatestExchangeRate: (currency?: string) => Promise<number | null>;
      };
    };
    const originalGetPartnerByJshshir = paymentServiceClass.sapService.getBusinessPartnerByJshshir;
    const originalGetPurchases = paymentServiceClass.sapService.getBPpurchasesByCardCode;
    const originalGetLatestExchangeRate = paymentServiceClass.sapService.getLatestExchangeRate;

    try {
      let requestedCardCode: string | null = null;

      paymentServiceClass.sapService.getBusinessPartnerByJshshir = async () => [
        { CardCode: 'C888' },
      ];
      paymentServiceClass.sapService.getBPpurchasesByCardCode = async (cardCode: string) => {
        requestedCardCode = cardCode;

        return [
          {
            DocEntry: 13,
            DocNum: 5013,
            CardCode: cardCode,
            CardName: 'JSHSHIR Buyer',
            DocDate: '2026-04-01',
            DocDueDate: '2026-05-01',
            DocCur: 'UZS',
            Total: 600000,
            TotalPaid: 100000,
            InstlmntID: 1,
            InstDueDate: '2026-05-01',
            InstTotal: 600000,
            InstPaidSys: 100000,
            InstStatus: 'O',
            itemsPairs: 'TV02::TV::600000',
          },
        ];
      };
      paymentServiceClass.sapService.getLatestExchangeRate = async () => 12_500;

      const payments = await PaymentService.getPaymentsByIdentifiers({
        jshshir: '12345678901234',
        cardCode: 'C003',
      });

      assert.equal(requestedCardCode, 'C888');
      assert.equal(payments.length, 1);
      assert.equal(payments[0].id, '13');
    } finally {
      paymentServiceClass.sapService.getBusinessPartnerByJshshir = originalGetPartnerByJshshir;
      paymentServiceClass.sapService.getBPpurchasesByCardCode = originalGetPurchases;
      paymentServiceClass.sapService.getLatestExchangeRate = originalGetLatestExchangeRate;
    }
  },
);

test(
  'PaymentService falls back to CardCode when jshshir lookup does not match',
  { concurrency: false },
  async () => {
    const paymentServiceClass = PaymentService as unknown as {
      sapService: {
        getBusinessPartnerByJshshir: (jshshir: string) => Promise<Array<{ CardCode: string }>>;
        getBPpurchasesByCardCode: (cardCode: string) => Promise<unknown[]>;
        getLatestExchangeRate: (currency?: string) => Promise<number | null>;
      };
    };
    const originalGetPartnerByJshshir = paymentServiceClass.sapService.getBusinessPartnerByJshshir;
    const originalGetPurchases = paymentServiceClass.sapService.getBPpurchasesByCardCode;
    const originalGetLatestExchangeRate = paymentServiceClass.sapService.getLatestExchangeRate;

    try {
      let requestedCardCode: string | null = null;

      paymentServiceClass.sapService.getBusinessPartnerByJshshir = async () => [];
      paymentServiceClass.sapService.getBPpurchasesByCardCode = async (cardCode: string) => {
        requestedCardCode = cardCode;

        return [
          {
            DocEntry: 14,
            DocNum: 5014,
            CardCode: cardCode,
            CardName: 'Fallback Buyer',
            DocDate: '2026-04-01',
            DocDueDate: '2026-05-01',
            DocCur: 'UZS',
            Total: 800000,
            TotalPaid: 300000,
            InstlmntID: 1,
            InstDueDate: '2026-05-01',
            InstTotal: 800000,
            InstPaidSys: 300000,
            InstStatus: 'O',
            itemsPairs: 'TV03::TV::800000',
          },
        ];
      };
      paymentServiceClass.sapService.getLatestExchangeRate = async () => 12_500;

      const payments = await PaymentService.getPaymentsByIdentifiers({
        jshshir: '12345678901234',
        cardCode: 'C009',
      });

      assert.equal(requestedCardCode, 'C009');
      assert.equal(payments.length, 1);
      assert.equal(payments[0].id, '14');
    } finally {
      paymentServiceClass.sapService.getBusinessPartnerByJshshir = originalGetPartnerByJshshir;
      paymentServiceClass.sapService.getBPpurchasesByCardCode = originalGetPurchases;
      paymentServiceClass.sapService.getLatestExchangeRate = originalGetLatestExchangeRate;
    }
  },
);

test('PaymentService maps docTotal and docTotalFC', { concurrency: false }, async () => {
  const paymentServiceClass = PaymentService as unknown as {
    sapService: {
      getBPpurchasesByCardCode: (cardCode: string) => Promise<unknown[]>;
      getLatestExchangeRate: (currency?: string) => Promise<number | null>;
    };
  };
  const originalGetPurchases = paymentServiceClass.sapService.getBPpurchasesByCardCode;
  const originalGetLatestExchangeRate = paymentServiceClass.sapService.getLatestExchangeRate;

  try {
    paymentServiceClass.sapService.getBPpurchasesByCardCode = async () => [
      {
        DocEntry: 100,
        DocNum: 900,
        CardCode: 'C001',
        CardName: 'Test Buyer',
        DocDate: '2026-04-01',
        DocDueDate: '2026-05-01',
        DocCur: 'USD',
        DocTotal: 1250000,
        DocTotalFC: 100,
        Total: 100,
        TotalPaid: 25,
        InstlmntID: 1,
        InstDueDate: '2026-05-01',
        InstTotal: 100,
        InstPaidSys: 25,
        InstStatus: 'O',
        itemsPairs: 'IT01::Item::100',
      },
    ];
    paymentServiceClass.sapService.getLatestExchangeRate = async () => 12500;

    const payments = await PaymentService.getPaymentsByCardCode('C001');

    assert.equal(payments[0].docTotal, 1250000);
    assert.equal(payments[0].docTotalFC, 100);
  } finally {
    paymentServiceClass.sapService.getBPpurchasesByCardCode = originalGetPurchases;
    paymentServiceClass.sapService.getLatestExchangeRate = originalGetLatestExchangeRate;
  }
});

test('PaymentService chooses display total from DocTotalFC for UZS and DocTotal for USD', {
  concurrency: false,
}, async () => {
  const paymentServiceClass = PaymentService as unknown as {
    sapService: {
      getBPpurchasesByCardCode: (cardCode: string) => Promise<unknown[]>;
      getLatestExchangeRate: (currency?: string) => Promise<number | null>;
    };
  };
  const originalGetPurchases = paymentServiceClass.sapService.getBPpurchasesByCardCode;
  const originalGetLatestExchangeRate = paymentServiceClass.sapService.getLatestExchangeRate;

  try {
    paymentServiceClass.sapService.getBPpurchasesByCardCode = async () => [
      {
        DocEntry: 101,
        DocNum: 901,
        CardCode: 'C001',
        CardName: 'UZS Buyer',
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
        itemsPairs: 'IT01::Item::1000',
      },
      {
        DocEntry: 102,
        DocNum: 902,
        CardCode: 'C001',
        CardName: 'USD Buyer',
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
        itemsPairs: 'IT02::Item::2000',
      },
    ];
    paymentServiceClass.sapService.getLatestExchangeRate = async () => 12_500;

    const payments = await PaymentService.getPaymentsByCardCode('C001');
    const uzsPayment = payments.find((payment) => payment.id === '101');
    const usdPayment = payments.find((payment) => payment.id === '102');

    assert.equal(uzsPayment?.total, 1_000);
    assert.equal(uzsPayment?.currency, 'UZS');
    assert.equal(usdPayment?.total, 2_000);
    assert.equal(usdPayment?.currency, 'USD');
  } finally {
    paymentServiceClass.sapService.getBPpurchasesByCardCode = originalGetPurchases;
    paymentServiceClass.sapService.getLatestExchangeRate = originalGetLatestExchangeRate;
  }
});

test(
  'PaymentService keeps USD contracts in SAP document currency for paid totals and installments',
  { concurrency: false },
  async () => {
    const paymentServiceClass = PaymentService as unknown as {
      sapService: {
        getBPpurchasesByCardCode: (cardCode: string) => Promise<unknown[]>;
        getLatestExchangeRate: (currency?: string) => Promise<number | null>;
      };
    };
    const originalGetPurchases = paymentServiceClass.sapService.getBPpurchasesByCardCode;
    const originalGetLatestExchangeRate = paymentServiceClass.sapService.getLatestExchangeRate;

    try {
      paymentServiceClass.sapService.getBPpurchasesByCardCode = async () => [
        {
          DocEntry: 18673,
          DocNum: 18673,
          CardCode: 'C001',
          CardName: 'Test Buyer',
          DocDate: '2025-06-25',
          DocDueDate: '2026-06-07',
          DocCur: 'USD',
          DocTotal: 1560,
          DocTotalFC: 0,
          Total: 1560,
          TotalPaid: 1430,
          InstlmntID: 1,
          InstDueDate: '2025-07-07',
          InstTotal: 130,
          InstPaidToDate: 130,
          InstPaidSys: 1625649.48,
          InstStatus: 'C',
          itemsPairs: 'MBP14::Macbook Pro M4 14-inch 16/512gb::1497.4',
        },
      ];
      paymentServiceClass.sapService.getLatestExchangeRate = async () => 12513.351818496061;

      const payments = await PaymentService.getPaymentsByCardCode('C001');

      assert.equal(payments[0].sourceCurrency, 'USD');
      assert.equal(payments[0].docTotal, 1560);
      assert.equal(payments[0].currency, 'USD');
      assert.equal(payments[0].displayCurrency, 'USD');
      assert.equal(payments[0].total, 1560);
      assert.equal(payments[0].totalPaid, 1430);
      assert.equal(payments[0].totalPaidCurrency, 'USD');
      assert.equal(payments[0].installments[0].total, 130);
      assert.equal(payments[0].installments[0].paid, 130);
      assert.equal(payments[0].installments[0].currency, 'USD');
      assert.equal(payments[0].allItems[0].price, 1497.4);
    } finally {
      paymentServiceClass.sapService.getBPpurchasesByCardCode = originalGetPurchases;
      paymentServiceClass.sapService.getLatestExchangeRate = originalGetLatestExchangeRate;
    }
  },
);
