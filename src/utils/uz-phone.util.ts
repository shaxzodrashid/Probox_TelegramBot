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
