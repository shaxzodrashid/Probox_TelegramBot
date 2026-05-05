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

export const LOCAL_CURRENCY = 'UZS';

export const normalizeCurrencyCode = (currency: string | null | undefined): string =>
  currency?.trim().toUpperCase() || LOCAL_CURRENCY;

export const getInstallmentDisplayCurrency = (
  documentCurrency: string,
  installmentAmount?: number | string | null,
  documentAmount?: number | string | null,
): string => {
  const normalizedCurrency = normalizeCurrencyCode(documentCurrency);
  if (normalizedCurrency === LOCAL_CURRENCY) {
    return LOCAL_CURRENCY;
  }

  const installment = parseNumericAmount(installmentAmount);
  const documentTotal = parseNumericAmount(documentAmount);
  if (documentTotal > 0 && installment > documentTotal) {
    return LOCAL_CURRENCY;
  }

  return normalizedCurrency;
};
