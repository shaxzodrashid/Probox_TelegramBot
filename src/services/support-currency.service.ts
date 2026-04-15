import { HanaService } from '../sap/hana.service';
import { SapService } from '../sap/sap-hana.service';

const CURRENCY_ALIASES: Record<string, string> = {
  USD: 'USD',
  '$': 'USD',
  DOLLAR: 'USD',
  DOLLARS: 'USD',
  USDT: 'USD',
  DOLLARDA: 'USD',
  DOLLARGA: 'USD',
  DOLLARNI: 'USD',
  DOLLARNIY: 'USD',
  ДОЛЛАР: 'USD',
  ДОЛЛАРАХ: 'USD',
  ДОЛЛАРАХДА: 'USD',
  UZS: 'UZS',
  UZSDA: 'UZS',
  SUM: 'UZS',
  SOM: 'UZS',
  "SO'M": 'UZS',
  'SO‘M': 'UZS',
  'SO`M': 'UZS',
  SODM: 'UZS',
  СУМ: 'UZS',
  РУБ: 'RUB',
  RUB: 'RUB',
  EUR: 'EUR',
  EURO: 'EUR',
  ЕВРО: 'EUR',
};

const normalizeCurrencyCode = (value: string): string => {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[ʻʼ’‘`´]/g, "'")
    .replace(/\s+/g, '');

  return CURRENCY_ALIASES[normalized] || normalized;
};

const formatRateDate = (value: string | Date): string => {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return trimmed;
  }

  return parsed.toISOString().slice(0, 10);
};

export class SupportCurrencyService {
  private static readonly sapService = new SapService(new HanaService());

  static async lookupExchangeRate(params: { currency: string }): Promise<{
    ok: boolean;
    currency: string;
    rate: number | null;
    rate_date: string | null;
    base_currency: string;
  }> {
    const currency = normalizeCurrencyCode(params.currency);
    if (!currency) {
      throw new Error('Currency is required');
    }

    const result = await this.sapService.getLatestExchangeRateInfo(currency);

    return {
      ok: true,
      currency,
      rate: result?.rate ?? null,
      rate_date: result?.rateDate ? formatRateDate(result.rateDate) : null,
      base_currency: 'UZS',
    };
  }

  static async convertAmount(params: {
    amount: number;
    fromCurrency: string;
    toCurrency: string;
  }): Promise<{
    ok: boolean;
    original_amount: number;
    from_currency: string;
    to_currency: string;
    converted_amount: number | null;
    rate: number | null;
    rate_date: string | null;
    base_currency: string;
  }> {
    const amount = Number(params.amount);
    if (!Number.isFinite(amount)) {
      throw new Error('Amount must be a finite number');
    }

    const fromCurrency = normalizeCurrencyCode(params.fromCurrency);
    const toCurrency = normalizeCurrencyCode(params.toCurrency);

    if (!fromCurrency || !toCurrency) {
      throw new Error('Both source and target currencies are required');
    }

    if (fromCurrency === toCurrency) {
      return {
        ok: true,
        original_amount: amount,
        from_currency: fromCurrency,
        to_currency: toCurrency,
        converted_amount: amount,
        rate: 1,
        rate_date: null,
        base_currency: 'UZS',
      };
    }

    if (!['USD', 'UZS'].includes(fromCurrency) || !['USD', 'UZS'].includes(toCurrency)) {
      throw new Error(`Unsupported currency pair: ${fromCurrency} -> ${toCurrency}`);
    }

    const rateInfo = await this.lookupExchangeRate({ currency: 'USD' });
    const rate = rateInfo.rate;

    if (!Number.isFinite(rate) || !rate || rate <= 0) {
      return {
        ok: true,
        original_amount: amount,
        from_currency: fromCurrency,
        to_currency: toCurrency,
        converted_amount: null,
        rate: null,
        rate_date: rateInfo.rate_date,
        base_currency: rateInfo.base_currency,
      };
    }

    const convertedAmount =
      fromCurrency === 'UZS' && toCurrency === 'USD'
        ? amount / rate
        : amount * rate;

    return {
      ok: true,
      original_amount: amount,
      from_currency: fromCurrency,
      to_currency: toCurrency,
      converted_amount: convertedAmount,
      rate,
      rate_date: rateInfo.rate_date,
      base_currency: rateInfo.base_currency,
    };
  }
}
