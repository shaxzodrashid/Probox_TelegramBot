/**
 * Utility functions for formatting data for display
 */

/**
 * Formats a date string from SAP to a user-friendly format (DD.MM.YYYY)
 * @param dateStr - Date string from SAP
 * @returns Formatted date string
 */
export const formatDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return `${day}.${month}.${year}`;
};

/**
 * Formats a number as currency with thousands separators
 * @param amount - Number to format
 * @param currency - Currency code (e.g., UZS, USD)
 * @returns Formatted currency string
 */
export const formatCurrency = (amount: number | string, currency: string = 'UZS'): string => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return `0 ${currency}`;

  // Use Russian locale for space as thousands separator
  const formattedNum = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);

  return `${formattedNum} ${currency}`;
};

/**
 * Normalizes integer UZS amounts embedded in rendered message text.
 *
 * Direct-message payloads can contain fixed-scale database values such as
 * `2753270.0000000 UZS`. Keep this boundary formatter intentionally narrow:
 * it only touches numeric tokens immediately followed by the UZS currency code.
 */
export const formatUzsAmountsInText = (text: string): string => {
  const uzsAmountPattern = /(?<![\d.,])(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:\.0+)?(?=\s+UZS\b)/g;

  return text.replace(uzsAmountPattern, (_match, amount: string) => {
    const integerDigits = amount.replace(/[.\s]/g, '');
    return integerDigits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  });
};

/**
 * Sanitizes a name by removing emojis and common symbols.
 * Returns null if the name is empty or contains no valid letters.
 * @param name - Raw name string
 * @returns Sanitized name or null
 */
export const sanitizeName = (name?: string | null): string | null => {
  if (!name) return null;

  const cleaned = name
    .normalize('NFKC')
    // Remove emojis
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    // Remove variation selectors and other invisibles
    .replace(/[\uFE0F\u200D\u200B\u200C]/g, '')
    .trim();

  // If the result doesn't contain at least one letter, it's invalid
  if (!/\p{L}/u.test(cleaned)) {
    return null;
  }

  // Remove leading/trailing non-alphanumeric noise (like dots, dashes at ends)
  // but keep what's in between (e.g., "O'Connor" or "Doe-Smith").
  const final = cleaned.replace(/^[^\p{L}0-9]+/u, '').replace(/[^\p{L}0-9]+$/u, '');

  return final || null;
};
