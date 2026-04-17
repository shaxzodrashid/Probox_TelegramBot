import { FaqQuestionVariants } from '../../types/faq.types';

const INVENTORY_INTENT_REGEX =
  /\b(bormi|mavjud\w*|ombor\w*|sklad\w*|filial\w*|stock|available|availability|bor\b|yo['’`]?q\w*|model\w*|seriya\w*|variant\w*)\b/i;

const PRODUCT_SIGNAL_REGEX =
  /\b(iphone|ipad|macbook|airpods?|watch|telefon\w*|phone\w*|smartfon\w*|smartphone\w*|смартфон\w*|телефон\w*|qurilma\w*|device\w*|model\w*|modellar\w*|ассортимент\w*|turdagi)\b/i;

const STOCK_CHECK_FAQ_REGEX =
  /\b(sotuvda|mavjud|in stock|currently in stock|availability|налич\w*|ассортимент\w*|specific model|type of phone|modellar\w*|turdagi telefon\w*)\b/i;

export const normalizeInventoryText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

export const extractInventoryLookupQuery = (message: string): string | null => {
  const normalized = normalizeInventoryText(message);

  const iPhoneMatch = normalized.match(/\biphone\s*(\d{1,2}|air|se)\b/);
  if (iPhoneMatch) {
    let query = `iphone ${iPhoneMatch[1]}`;

    if (/\bpro[\s-]*max\b/.test(normalized)) {
      query += ' pro max';
    } else if (/\bpro\b/.test(normalized)) {
      query += ' pro';
    } else if (/\bplus\b/.test(normalized)) {
      query += ' plus';
    } else if (/\bmini\b/.test(normalized)) {
      query += ' mini';
    }

    const memoryMatch = normalized.match(/\b(\d+)\s*(gb|tb)\b/);
    if (memoryMatch) {
      query += ` ${memoryMatch[1]}${memoryMatch[2]}`;
    }

    return query;
  }

  const airPodsMatch = normalized.match(/\bairpods?\b(?:\s+pro)?(?:\s+\d+)?/);
  if (airPodsMatch) {
    return airPodsMatch[0].trim();
  }

  const watchMatch = normalized.match(/\bapple\s+watch\b(?:\s+\d{1,2})?(?:\s+\d{2}mm)?/);
  if (watchMatch) {
    return watchMatch[0].trim();
  }

  const genericIPhoneMatch = normalized.match(/\biphone(?:lar\w*|s)?\b/);
  if (genericIPhoneMatch) {
    return 'iphone';
  }

  const genericAirPodsMatch = normalized.match(/\bairpods?(?:lar\w*|s)?\b/);
  if (genericAirPodsMatch) {
    return 'airpods';
  }

  const genericWatchMatch = normalized.match(/\bapple\s+watch(?:lar\w*|es)?\b/);
  if (genericWatchMatch) {
    return 'apple watch';
  }

  return null;
};

export const hasDirectInventoryIntent = (message: string): boolean => {
  const normalized = normalizeInventoryText(message);
  return INVENTORY_INTENT_REGEX.test(normalized) || Boolean(extractInventoryLookupQuery(message));
};

export const isStockCheckQuestion = (message: string): boolean => {
  const normalized = normalizeInventoryText(message);
  const hasAvailabilitySignal = /\b(bormi|mavjud\w*|sotuvda|stock|available|availability|bor\b|есть|налич\w*)\b/i.test(normalized);
  const hasProductSignal = PRODUCT_SIGNAL_REGEX.test(normalized) || Boolean(extractInventoryLookupQuery(message));

  return hasAvailabilitySignal && hasProductSignal;
};

export const faqLooksLikeStockCheck = (faq: FaqQuestionVariants): boolean => {
  const combinedText = [faq.question_uz, faq.question_ru, faq.question_en]
    .filter(Boolean)
    .join('\n');
  const normalized = normalizeInventoryText(combinedText);

  return (
    isStockCheckQuestion(combinedText) ||
    (PRODUCT_SIGNAL_REGEX.test(normalized) && STOCK_CHECK_FAQ_REGEX.test(normalized))
  );
};
