export interface DisplayAmount {
  amount: number;
  currency: string;
  converted: boolean;
}

export const parseNumericAmount = (amount: number | string | null | undefined): number => {
  if (typeof amount === 'number') {
    return Number.isFinite(amount) ? amount : 0;
  }

  if (typeof amount === 'string') {
    const parsed = parseFloat(amount);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
};

export const convertAmountForDisplay = (
  amount: number | string | null | undefined,
  sourceCurrency: string,
  usdToUzsRate?: number | null,
): DisplayAmount => {
  const numericAmount = parseNumericAmount(amount);
  const normalizedCurrency = sourceCurrency?.trim().toUpperCase() || 'UZS';

  if (normalizedCurrency !== 'USD') {
    return {
      amount: numericAmount,
      currency: normalizedCurrency,
      converted: false,
    };
  }

  const rate = parseNumericAmount(usdToUzsRate);
  if (rate <= 0) {
    return {
      amount: numericAmount,
      currency: normalizedCurrency,
      converted: false,
    };
  }

  return {
    amount: numericAmount * rate,
    currency: 'UZS',
    converted: true,
  };
};
