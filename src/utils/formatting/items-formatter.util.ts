interface FormattedPaymentItem {
  code: string;
  name: string;
  price: number;
}

const PAIR_SEPARATOR = /\s*\|\|\s*/u;
const FIELD_SEPARATOR = /\s*:\s*:\s*/u;

function parsePrice(value?: string): number {
  if (!value) return 0;

  return Number.parseFloat(value.replace(',', '.')) || 0;
}

function parseItemPair(pair: string): FormattedPaymentItem {
  const parts = pair
    .normalize('NFKC')
    .split(FIELD_SEPARATOR)
    .map((part) => part.trim());

  if (parts.length >= 3) {
    return {
      code: parts[0] || '',
      name: parts.slice(1, -1).join('::').trim() || parts[0] || '',
      price: parsePrice(parts[parts.length - 1]),
    };
  }

  return {
    code: parts[0] || '',
    name: parts[1] || parts[0] || '',
    price: 0,
  };
}

/**
 * Formats a raw itemsPairs string from SAP into a human-readable product name.
 */
export function formatItemsList(itemsPairs: string): string {
  if (!itemsPairs) return '';

  const items = itemsPairs
    .split(PAIR_SEPARATOR)
    .map(parseItemPair)
    .filter((item) => item.name);

  if (items.length === 0) return '';

  const mostExpensive = items.reduce((prev, current) =>
    prev.price > current.price ? prev : current,
  );

  return mostExpensive.name;
}
