import { FaqQuestionVariants } from '../../types/faq.types';

const INVENTORY_AVAILABILITY_REGEX =
  /\b(bormi|mavjud\w*|ombor\w*|sklad\w*|stock|available|availability|bor\b|yo['’`]?q\w*|imei|item[-\s]?code)\b/i;

const PRODUCT_SIGNAL_REGEX =
  /\b(iphone|ipad|macbook|airpods?|watch|telefon\w*|phone\w*|smartfon\w*|smartphone\w*|смартфон\w*|телефон\w*|qurilma\w*|device\w*|model\w*|modellar\w*|ассортимент\w*|turdagi)\b/i;

const CATALOG_SIGNAL_REGEX =
  /\b(qanaqa|qaysi|katalog\w*|catalog\w*|ro['’`]?yxat\w*|list\w*|ассортимент\w*|spisok\w*|модел\w*|modellar\w*|turdagi)\b/i;

const PRICE_SIGNAL_REGEX =
  /\b(narx\w*|qancha|qanchadan|price|cost|сколько|цена|стоит|bo['’`]?vott[iu]|turibdi|turipti)\b/i;

const BRANCH_LOCATION_REGEX =
  /\b(filial\w*|branch\w*|manzil\w*|adres\w*|address\w*|location\w*|qayerda|qaerda|qatta|joylashgan\w*|где|адрес\w*)\b/i;

const STOCK_CHECK_FAQ_REGEX =
  /\b(sotuvda|mavjud|in stock|currently in stock|availability|налич\w*|ассортимент\w*|specific model|type of phone|modellar\w*|turdagi telefon\w*)\b/i;

const ALTERNATIVE_SIGNAL_REGEX =
  /\b(boshqa|yana|other|alternative|alternativ\w*|ещ[eё]|друг\w*)\b/i;

const ALTERNATIVE_TARGET_REGEX =
  /\b(seriya\w*|model\w*|variant\w*|tur\w*|modellar\w*|ассортимент\w*|series|models?|variants?|серии|модел\w*|вариант\w*)\b/i;

const APPLE_VARIANT_REGEX = /\bpro[\s-]*max\b|\bpro\b|\bplus\b|\bmini\b/i;

const IMPLICIT_IPHONE_CONTEXT_REGEX =
  /\b(silada|sizlarda|ularda|ulardan|bor\w*|bormi|mavjud\w*|narx\w*|qancha|qanchadan|olmoqch\w*|topamanmi|telefon\w*|phone\w*|model\w*|modellar\w*|seriya\w*|katalog\w*|catalog\w*|bo['’`]?vott[iu]|turibdi|turipti)\b/i;

export interface InventoryAlternativeQuery {
  query: string;
  strategy: 'drop_memory' | 'drop_variant' | 'product_family';
}

export const normalizeInventoryText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/['’`]?la?n[iyu]?\b/g, '')
    .replace(/\b(?:ayfon|aifon|айфон)\b/g, 'iphone')
    .replace(/\b(?:aypad|aipad|айпад)\b/g, 'ipad')
    .replace(/\b(?:makbuk|macbuk|макбук)\b/g, 'macbook')
    .replace(/\b(?:erpods|earpods|эйрподс|аирподс)\b/g, 'airpods')
    .replace(/\b(?:apple\s*watch|apel\s*watch|эпл\s*вотч)\b/g, 'apple watch')
    .replace(/\b(?:yengisi|yangisi)\b/g, 'new')
    .replace(/\b(?:ishlatilgani|b\/u|bu)\b/g, 'used')
    .replace(/\s+/g, ' ')
    .trim();

const inferImplicitIphoneQuery = (normalized: string): string | null => {
  if (/\biphone\b/.test(normalized)) {
    return null;
  }

  if (!IMPLICIT_IPHONE_CONTEXT_REGEX.test(normalized)) {
    return null;
  }

  const seriesMatch = normalized.match(/\b(1[1-9]|20|se|air)\b/);
  if (!seriesMatch) {
    return null;
  }

  let query = `iphone ${seriesMatch[1]}`;

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
};

export const deriveProductFamilyQuery = (message: string): string | null => {
  const normalized = normalizeInventoryText(message);

  if (/\biphone\b/.test(normalized)) {
    return 'iphone';
  }

  if (/\bipad\b/.test(normalized)) {
    return 'ipad';
  }

  if (/\bmacbook\b/.test(normalized)) {
    return 'macbook';
  }

  if (/\bairpods?\b/.test(normalized)) {
    return 'airpods';
  }

  if (/\bapple\s+watch\b/.test(normalized) || /\bwatch\b/.test(normalized)) {
    return 'apple watch';
  }

  return null;
};

export const isAlternativeCatalogRequest = (message: string): boolean => {
  const normalized = normalizeInventoryText(message);

  return ALTERNATIVE_SIGNAL_REGEX.test(normalized) && ALTERNATIVE_TARGET_REGEX.test(normalized);
};

export const deriveAlternativeInventoryQueries = (query: string): InventoryAlternativeQuery[] => {
  const normalized = normalizeInventoryText(query);
  const alternatives: InventoryAlternativeQuery[] = [];
  const seenQueries = new Set<string>();

  const addAlternative = (
    candidateQuery: string,
    strategy: InventoryAlternativeQuery['strategy'],
  ) => {
    const normalizedCandidate = normalizeInventoryText(candidateQuery);
    if (
      !normalizedCandidate ||
      normalizedCandidate === normalized ||
      seenQueries.has(normalizedCandidate)
    ) {
      return;
    }

    seenQueries.add(normalizedCandidate);
    alternatives.push({
      query: normalizedCandidate,
      strategy,
    });
  };

  const iPhoneMatch = normalized.match(/\biphone\s*(\d{1,2}[a-z]?|air|se)\b/);
  if (iPhoneMatch) {
    const model = `iphone ${iPhoneMatch[1]}`;
    const variant = /\bpro[\s-]*max\b/.test(normalized)
      ? 'pro max'
      : /\bpro\b/.test(normalized)
        ? 'pro'
        : /\bplus\b/.test(normalized)
          ? 'plus'
          : /\bmini\b/.test(normalized)
            ? 'mini'
            : '';
    const memory = normalized.match(/\b\d+\s*(gb|tb)\b/);

    if (variant && memory) {
      addAlternative(`${model} ${variant}`, 'drop_memory');
    }

    if (variant) {
      addAlternative(model, 'drop_variant');
    }

    addAlternative('iphone', 'product_family');
    return alternatives;
  }

  if (/\bairpods?\b/.test(normalized)) {
    if (/\bpro\b/.test(normalized) && /\b\d+\b/.test(normalized)) {
      addAlternative('airpods pro', 'drop_variant');
    }

    addAlternative('airpods', 'product_family');
    return alternatives;
  }

  const watchMatch = normalized.match(/\bapple\s+watch(?:\s+\d{1,2})?(?:\s+\d{2}mm)?/);
  if (watchMatch) {
    const seriesMatch = normalized.match(/\bapple\s+watch\s+(\d{1,2})\b/);
    const sizeMatch = normalized.match(/\b\d{2}mm\b/);

    if (seriesMatch && sizeMatch) {
      addAlternative(`apple watch ${seriesMatch[1]}`, 'drop_variant');
    }

    addAlternative('apple watch', 'product_family');
    return alternatives;
  }

  const productFamilyQuery = deriveProductFamilyQuery(normalized);
  if (productFamilyQuery) {
    addAlternative(productFamilyQuery, 'product_family');
  }

  return alternatives;
};

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

  const implicitIphoneQuery = inferImplicitIphoneQuery(normalized);
  if (implicitIphoneQuery) {
    return implicitIphoneQuery;
  }

  return null;
};

export const isDeviceCatalogQuestion = (message: string): boolean => {
  const normalized = normalizeInventoryText(message);

  return PRODUCT_SIGNAL_REGEX.test(normalized) && CATALOG_SIGNAL_REGEX.test(normalized);
};

export const hasDirectInventoryIntent = (message: string): boolean => {
  const normalized = normalizeInventoryText(message);
  const directQuery = extractInventoryLookupQuery(message);

  if (directQuery) {
    return true;
  }

  if (isDeviceCatalogQuestion(message)) {
    return true;
  }

  if (BRANCH_LOCATION_REGEX.test(normalized) && !PRODUCT_SIGNAL_REGEX.test(normalized)) {
    return false;
  }

  return INVENTORY_AVAILABILITY_REGEX.test(normalized) && PRODUCT_SIGNAL_REGEX.test(normalized);
};

export const isStockCheckQuestion = (message: string): boolean => {
  const normalized = normalizeInventoryText(message);
  const hasAvailabilitySignal =
    /\b(bormi|mavjud\w*|sotuvda|stock|available|availability|bor\b|есть|налич\w*)\b/i.test(
      normalized,
    );
  const hasProductSignal =
    PRODUCT_SIGNAL_REGEX.test(normalized) ||
    APPLE_VARIANT_REGEX.test(normalized) ||
    Boolean(extractInventoryLookupQuery(message));

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
