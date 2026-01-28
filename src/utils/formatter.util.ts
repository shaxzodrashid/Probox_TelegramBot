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
    maximumFractionDigits: 2
  }).format(num);
  
  return `${formattedNum} ${currency}`;
};
