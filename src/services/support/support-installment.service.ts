import { HanaService } from '../../sap/hana.service';
import { SapInstallmentItemLookupRow, SapService } from '../../sap/sap-hana.service';
import { logger } from '../../utils/logger';

export interface CalculateInstallmentParams {
  imei?: string | null;
  itemCode?: string | null;
  months: number;
  downPayment?: number | null;
}

export const MIN_INSTALLMENT_DOWN_PAYMENT_UZS = 1_000_000;

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/\s+/g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const normalizeOptionalText = (value: unknown): string | null => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const normalized = String(value).replace(/\s+/g, ' ').trim();
  return normalized || null;
};

const roundMoney = (value: number): number => Math.round(value);

const getUsedProductPriceAdjustmentPercentage = (priceUsd: number): number => {
  if (priceUsd <= 500) {
    return 10;
  }

  if (priceUsd <= 1000) {
    return 6;
  }

  return 3;
};

const normalizeCondition = (value: string | null): 'new' | 'used' | 'unknown' => {
  const normalized = (value || '').toLowerCase().replace(/\\/g, '/').replace(/\s+/g, '').trim();

  if (normalized === 'yangi' || normalized === 'new') {
    return 'new';
  }

  if (normalized === 'b/u' || normalized === 'bu' || normalized === 'used') {
    return 'used';
  }

  return 'unknown';
};

const normalizeSapItem = (item: SapInstallmentItemLookupRow) => ({
  imei: item.IMEI || null,
  item_code: item.ItemCode,
  item_name: item.ItemName,
  store_code: item.WhsCode,
  store_name: item.WhsName,
  on_hand: toFiniteNumber(item.OnHand) || 0,
  sale_price: toFiniteNumber(item.SalePrice) || 0,
  purchase_price: toFiniteNumber(item.PurchasePrice),
  model: item.U_Model || null,
  device_type: item.U_DeviceType || null,
  memory: item.U_Memory || null,
  color: item.U_Color || null,
  sim_type: item.U_Sim_type || null,
  condition: item.U_PROD_CONDITION || null,
});

export class SupportInstallmentService {
  private static readonly sapService = new SapService(new HanaService());

  static async calculateMonthlyInstallment(params: CalculateInstallmentParams): Promise<{
    ok: boolean;
    error: string | null;
    lookup: {
      imei: string | null;
      item_code: string | null;
      used: 'imei' | 'item_code' | null;
    };
    months: number;
    down_payment: number;
    product: ReturnType<typeof normalizeSapItem> | null;
    percentage: number | null;
    sale_price: number | null;
    purchase_price: number | null;
    actual_price: number | null;
    price_source: 'SalePrice' | 'PurchasePrice' | null;
    financed_amount: number | null;
    monthly_installment: number | null;
  }> {
    const imei = normalizeOptionalText(params.imei);
    const itemCode = normalizeOptionalText(params.itemCode);
    const months = Math.trunc(params.months);
    const rawDownPayment = toFiniteNumber(params.downPayment);
    const downPayment =
      rawDownPayment === null || rawDownPayment === 0
        ? MIN_INSTALLMENT_DOWN_PAYMENT_UZS
        : Math.max(rawDownPayment, MIN_INSTALLMENT_DOWN_PAYMENT_UZS);

    const baseResult = {
      lookup: {
        imei,
        item_code: itemCode,
        used: null as 'imei' | 'item_code' | null,
      },
      months: Number.isFinite(months) ? months : 0,
      down_payment: downPayment,
      product: null,
      percentage: null,
      sale_price: null,
      purchase_price: null,
      actual_price: null,
      price_source: null,
      financed_amount: null,
      monthly_installment: null,
    };

    if (!imei && !itemCode) {
      return {
        ok: false,
        error: 'imei_or_item_code_required',
        ...baseResult,
      };
    }

    if (!Number.isFinite(months) || months <= 0) {
      return {
        ok: false,
        error: 'valid_months_required',
        ...baseResult,
      };
    }

    if (rawDownPayment !== null && rawDownPayment < 0) {
      return {
        ok: false,
        error: 'valid_down_payment_required',
        ...baseResult,
      };
    }

    logger.info('[SUPPORT_INSTALLMENT] Calculating monthly installment', {
      hasImei: Boolean(imei),
      itemCode,
      months,
      downPayment,
    });

    const [item, percentageRow] = await Promise.all([
      this.sapService.getInstallmentItemByImeiOrItemCode({
        imei,
        itemCode,
      }),
      this.sapService.getInstallmentPercentageForMonths(months),
    ]);

    if (!item) {
      return {
        ok: false,
        error: 'product_not_found',
        ...baseResult,
      };
    }

    if (!percentageRow) {
      return {
        ok: false,
        error: 'percentage_not_found_for_months',
        ...baseResult,
      };
    }

    const product = normalizeSapItem(item);
    const salePrice = product.sale_price;
    const purchasePrice = product.purchase_price;
    const condition = normalizeCondition(product.condition);
    const priceSource = condition === 'used' ? 'PurchasePrice' : 'SalePrice';
    let actualPrice = priceSource === 'PurchasePrice' ? purchasePrice : salePrice;

    if (condition === 'unknown') {
      return {
        ok: false,
        error: 'product_condition_not_supported',
        ...baseResult,
        product,
      };
    }

    if (!Number.isFinite(actualPrice) || !actualPrice || actualPrice <= 0) {
      return {
        ok: false,
        error:
          priceSource === 'PurchasePrice'
            ? 'purchase_price_not_found_for_used_product'
            : 'sale_price_not_found_for_new_product',
        ...baseResult,
        product,
        sale_price: salePrice,
        purchase_price: purchasePrice,
        price_source: priceSource,
      };
    }

    if (priceSource === 'PurchasePrice') {
      const usdToUzsRate = await this.getUsdToUzsRate();

      if (!Number.isFinite(usdToUzsRate) || !usdToUzsRate || usdToUzsRate <= 0) {
        return {
          ok: false,
          error: 'usd_exchange_rate_not_found_for_used_product',
          ...baseResult,
          product,
          sale_price: salePrice,
          purchase_price: purchasePrice,
          actual_price: actualPrice,
          price_source: priceSource,
          percentage: percentageRow.percentage,
        };
      }

      const adjustmentPercentage = getUsedProductPriceAdjustmentPercentage(actualPrice);
      const adjustedPriceUsd = actualPrice * (1 + adjustmentPercentage / 100);
      actualPrice = adjustedPriceUsd * usdToUzsRate;
    }

    if (downPayment > actualPrice) {
      return {
        ok: false,
        error: 'down_payment_exceeds_sale_price',
        ...baseResult,
        product,
        sale_price: salePrice,
        purchase_price: purchasePrice,
        actual_price: actualPrice,
        price_source: priceSource,
        percentage: percentageRow.percentage,
      };
    }

    const financedAmount = actualPrice - downPayment;
    const interestAmount = financedAmount * (percentageRow.percentage / 100);
    const totalAfterPercentage = financedAmount + interestAmount;
    const monthlyInstallment = totalAfterPercentage / months;
    const lookupUsed = item.IMEI ? 'imei' : 'item_code';

    return {
      ok: true,
      error: null,
      lookup: {
        imei,
        item_code: itemCode,
        used: lookupUsed,
      },
      months,
      down_payment: downPayment,
      product,
      percentage: percentageRow.percentage,
      sale_price: salePrice,
      purchase_price: purchasePrice,
      actual_price: actualPrice,
      price_source: priceSource,
      financed_amount: roundMoney(financedAmount),
      monthly_installment: roundMoney(monthlyInstallment),
    };
  }

  private static async getUsdToUzsRate(): Promise<number | null> {
    try {
      return await this.sapService.getLatestExchangeRate('USD');
    } catch (error) {
      logger.warn(
        '[SUPPORT_INSTALLMENT] Unable to fetch USD exchange rate for used-product installment',
        error,
      );
      return null;
    }
  }
}
