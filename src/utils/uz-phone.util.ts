export function extractDigits(value: string): string {
  return value.replace(/\D+/g, '');
}

export function normalizeUzPhone(phone: string): {
  raw: string;
  digits: string;
  last9: string;
} {
  const digits: string = extractDigits(phone);

  if (digits.length < 9) {
    throw new Error('Invalid phone number');
  }

  const last9 = digits.slice(-9);

  return {
    raw: phone,
    digits,
    last9,
  };
}

/**
 * Format phone number to +998XXXXXXXXX schema
 */
export function formatUzPhone(phone: string | null | undefined): string {
  if (!phone) return '-';

  const digits = extractDigits(phone);

  if (digits.length === 9) {
    return `+998${digits}`;
  }

  if (digits.length === 12 && digits.startsWith('998')) {
    return `+${digits}`;
  }

  // If it's already in some form but doesn't match above, just return as is but maybe with +
  if (digits.length > 0 && !phone.startsWith('+')) {
    return `+${digits}`;
  }

  return phone;
}
