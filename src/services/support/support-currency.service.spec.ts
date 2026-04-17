import assert from 'node:assert/strict';
import test from 'node:test';

import { SupportCurrencyService } from './support-currency.service';

test('SupportCurrencyService returns normalized latest exchange-rate data', async () => {
  const supportCurrencyServiceClass = SupportCurrencyService as any;

  const originalGetLatestExchangeRateInfo =
    supportCurrencyServiceClass.sapService.getLatestExchangeRateInfo;

  supportCurrencyServiceClass.sapService.getLatestExchangeRateInfo = async (currency: string) => ({
    currency,
    rate: 12_650,
    rateDate: '2026-04-12T00:00:00.000Z',
  });

  try {
    const result = await SupportCurrencyService.lookupExchangeRate({ currency: ' usd ' });

    assert.deepEqual(result, {
      ok: true,
      currency: 'USD',
      rate: 12_650,
      rate_date: '2026-04-12',
      base_currency: 'UZS',
    });
  } finally {
    supportCurrencyServiceClass.sapService.getLatestExchangeRateInfo =
      originalGetLatestExchangeRateInfo;
  }
});

test('SupportCurrencyService returns null rate when SAP has no data', async () => {
  const supportCurrencyServiceClass = SupportCurrencyService as any;

  const originalGetLatestExchangeRateInfo =
    supportCurrencyServiceClass.sapService.getLatestExchangeRateInfo;

  supportCurrencyServiceClass.sapService.getLatestExchangeRateInfo = async () => null;

  try {
    const result = await SupportCurrencyService.lookupExchangeRate({ currency: 'eur' });

    assert.deepEqual(result, {
      ok: true,
      currency: 'EUR',
      rate: null,
      rate_date: null,
      base_currency: 'UZS',
    });
  } finally {
    supportCurrencyServiceClass.sapService.getLatestExchangeRateInfo =
      originalGetLatestExchangeRateInfo;
  }
});

test('SupportCurrencyService normalizes common currency aliases', async () => {
  const supportCurrencyServiceClass = SupportCurrencyService as any;

  const originalGetLatestExchangeRateInfo =
    supportCurrencyServiceClass.sapService.getLatestExchangeRateInfo;

  let requestedCurrency = '';
  supportCurrencyServiceClass.sapService.getLatestExchangeRateInfo = async (currency: string) => {
    requestedCurrency = currency;
    return {
      currency,
      rate: 12_500,
      rateDate: '2026-04-12T00:00:00.000Z',
    };
  };

  try {
    const result = await SupportCurrencyService.lookupExchangeRate({ currency: 'dollarda' });

    assert.equal(requestedCurrency, 'USD');
    assert.equal(result.currency, 'USD');
    assert.equal(result.rate, 12_500);
  } finally {
    supportCurrencyServiceClass.sapService.getLatestExchangeRateInfo =
      originalGetLatestExchangeRateInfo;
  }
});

test('SupportCurrencyService converts UZS amounts to USD using the latest USD rate', async () => {
  const supportCurrencyServiceClass = SupportCurrencyService as any;

  const originalGetLatestExchangeRateInfo =
    supportCurrencyServiceClass.sapService.getLatestExchangeRateInfo;

  supportCurrencyServiceClass.sapService.getLatestExchangeRateInfo = async () => ({
    currency: 'USD',
    rate: 12_500,
    rateDate: '2026-04-12T00:00:00.000Z',
  });

  try {
    const result = await SupportCurrencyService.convertAmount({
      amount: 18_467_000,
      fromCurrency: 'so\'m',
      toCurrency: 'dollar',
    });

    assert.deepEqual(result, {
      ok: true,
      original_amount: 18_467_000,
      from_currency: 'UZS',
      to_currency: 'USD',
      converted_amount: 1477.36,
      rate: 12_500,
      rate_date: '2026-04-12',
      base_currency: 'UZS',
    });
  } finally {
    supportCurrencyServiceClass.sapService.getLatestExchangeRateInfo =
      originalGetLatestExchangeRateInfo;
  }
});
