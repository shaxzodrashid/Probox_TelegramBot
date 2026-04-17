import assert from 'node:assert/strict';
import test from 'node:test';
import { PaymentService } from './payment.service';

test(
  'PaymentService converts USD contracts to UZS display amounts',
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
      assert.equal(payments[0].currency, 'UZS');
      assert.equal(payments[0].displayCurrency, 'UZS');
      assert.equal(payments[0].sourceCurrency, 'USD');
      assert.equal(payments[0].total, 1_250_000);
      assert.equal(payments[0].totalPaid, 312_500);
      assert.equal(payments[0].allItems[0].price, 1_250_000);
      assert.equal(payments[0].installments[0].total, 1_250_000);
      assert.equal(payments[0].installments[0].paid, 312_500);
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
          InstPaidToDate: 0,
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
        InstPaidToDate: 200000,
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
    assert.equal(payments[0].allItems[0].price, 500000);
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
            InstPaidToDate: 100000,
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
            InstPaidToDate: 300000,
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
