import { ISapItem, ISupportItemAvailabilityItem } from '../../interfaces/item.interface';
import { HanaService } from '../../sap/hana.service';
import { SapService } from '../../sap/sap-hana.service';
import { normalizeInventoryText } from '../../utils/faq/inventory-intent.util';

const DEFAULT_RESULT_LIMIT = 5;
const MAX_RESULT_LIMIT = 10;

interface ItemLookupFilters {
  model?: string;
  deviceType?: string;
  memory?: string;
  color?: string;
  simType?: string;
  condition?: string;
}

interface LookupAvailableItemsParams extends ItemLookupFilters {
  query: string;
  search?: string;
  store?: string | null;
  limit?: number;
}

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const clampLimit = (value: number | undefined): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_RESULT_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(value || DEFAULT_RESULT_LIMIT), 1), MAX_RESULT_LIMIT);
};

const normalizeItem = (item: ISapItem) => ({
  imei: item.IMEI || null,
  item_code: item.ItemCode,
  item_name: item.ItemName,
  store_code: item.WhsCode,
  store_name: item.WhsName,
  on_hand: toFiniteNumber(item.OnHand) || 0,
  sale_price: toFiniteNumber(item.SalePrice),
  item_group_name: item.ItemGroupName,
  model: item.U_Model || null,
  device_type: item.U_DeviceType || null,
  color: item.U_Color || null,
  memory: item.U_Memory || null,
  condition: item.U_PROD_CONDITION || item.U_Condition || null,
  sim_type: item.U_Sim_type || null,
}) satisfies ISupportItemAvailabilityItem;

const hasSettledSalePrice = (
  item: ReturnType<typeof normalizeItem>,
): item is ReturnType<typeof normalizeItem> & { sale_price: number } =>
  typeof item.sale_price === 'number' && Number.isFinite(item.sale_price) && item.sale_price > 0;

const sortDeviceNames = (deviceNames: Iterable<string>): string[] =>
  Array.from(new Set(Array.from(deviceNames).map((value) => value.trim()).filter(Boolean))).sort(
    (left, right) => left.localeCompare(right),
  );

const cleanOptionalText = (value: unknown): string | undefined => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }

  const trimmed = String(value).replace(/\s+/g, ' ').trim();
  return trimmed || undefined;
};

const normalizeLookupFilters = (params: ItemLookupFilters): ItemLookupFilters => ({
  model: cleanOptionalText(params.model),
  deviceType: cleanOptionalText(params.deviceType),
  memory: cleanOptionalText(params.memory),
  color: cleanOptionalText(params.color),
  simType: cleanOptionalText(params.simType),
  condition: cleanOptionalText(params.condition),
});

const compactLookupFilters = (
  filters: ItemLookupFilters,
): Record<string, string | number | boolean | undefined> =>
  Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined),
  ) as Record<string, string | number | boolean | undefined>;

const hasExactOptionRequest = (filters: ItemLookupFilters): boolean =>
  Boolean(filters.memory || filters.color || filters.simType);

const hasModelScopedFallback = (filters: ItemLookupFilters): boolean =>
  Boolean(filters.model || filters.deviceType || filters.condition);

const compactStrings = (values: Iterable<string | null>): string[] =>
  Array.from(
    new Set(
      Array.from(values)
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((left, right) => left.localeCompare(right));

const summarizeSuggestionOptions = (items: ReturnType<typeof normalizeItem>[]) => ({
  memories: compactStrings(items.map((item) => item.memory)),
  colors: compactStrings(items.map((item) => item.color)),
  sim_types: compactStrings(items.map((item) => item.sim_type)),
  conditions: compactStrings(items.map((item) => item.condition)),
});

export class SupportItemAvailabilityService {
  private static readonly sapService = new SapService(new HanaService());

  static async lookupAvailableItems(params: LookupAvailableItemsParams): Promise<{
    ok: boolean;
    search: string | null;
    query: string;
    store: string | null;
    requested_filters: {
      model: string | null;
      device_type: string | null;
      memory: string | null;
      color: string | null;
      sim_type: string | null;
      condition: string | null;
    };
    exact_match: boolean;
    no_exact_match: boolean;
    no_exact_match_message: string | null;
    total_matches: number;
    returned_matches: number;
    items: ReturnType<typeof normalizeItem>[];
    suggestions: {
      total_matches: number;
      returned_matches: number;
      available_options: ReturnType<typeof summarizeSuggestionOptions>;
      items: ReturnType<typeof normalizeItem>[];
    } | null;
  }> {
    const rawSearch = cleanOptionalText(params.search) || cleanOptionalText(params.query);
    const search = rawSearch ? normalizeInventoryText(rawSearch) : '';
    const filters = normalizeLookupFilters(params);
    const query = search || [
      filters.model,
      filters.deviceType,
      filters.memory,
      filters.color,
      filters.simType,
      filters.condition,
    ]
      .filter(Boolean)
      .join(' ');

    if (!query && !hasModelScopedFallback(filters)) {
      throw new Error('Item search query is required');
    }

    const store = params.store?.trim() || null;
    const limit = clampLimit(params.limit);
    const sapParams: Parameters<SapService['getItems']>[0] = {
      search: search || undefined,
      limit,
      offset: 0,
      includeZeroOnHand: false,
      storeName: store || undefined,
      groupByWarehouse: true,
    };
    const exactFilters = compactLookupFilters(filters);
    if (Object.keys(exactFilters).length > 0) {
      sapParams.filters = exactFilters;
    }

    const result = await this.sapService.getItems(sapParams);

    const items = result.data
      .slice(0, limit)
      .map(normalizeItem)
      .filter(hasSettledSalePrice)
      .sort((left, right) => right.on_hand - left.on_hand);

    const shouldSuggestSameModelOptions =
      items.length === 0 && hasExactOptionRequest(filters) && hasModelScopedFallback(filters);

    let suggestions: {
      total_matches: number;
      returned_matches: number;
      available_options: ReturnType<typeof summarizeSuggestionOptions>;
      items: ReturnType<typeof normalizeItem>[];
    } | null = null;

    if (shouldSuggestSameModelOptions) {
      const fallbackFilters = {
        model: filters.model,
        deviceType: filters.deviceType,
        condition: filters.condition,
      };
      const compactFallbackFilters = compactLookupFilters(fallbackFilters);

      const fallbackResult = await this.sapService.getItems({
        filters: compactFallbackFilters,
        limit: MAX_RESULT_LIMIT,
        offset: 0,
        includeZeroOnHand: false,
        storeName: store || undefined,
        groupByWarehouse: true,
      });

      const fallbackItems = fallbackResult.data
        .slice(0, MAX_RESULT_LIMIT)
        .map(normalizeItem)
        .filter(hasSettledSalePrice)
        .sort((left, right) => right.on_hand - left.on_hand);

      if (fallbackItems.length > 0) {
        suggestions = {
          total_matches: fallbackResult.total,
          returned_matches: fallbackItems.length,
          available_options: summarizeSuggestionOptions(fallbackItems),
          items: fallbackItems,
        };
      }
    }

    return {
      ok: true,
      search: search || null,
      query,
      store,
      requested_filters: {
        model: filters.model || null,
        device_type: filters.deviceType || null,
        memory: filters.memory || null,
        color: filters.color || null,
        sim_type: filters.simType || null,
        condition: filters.condition || null,
      },
      exact_match: items.length > 0,
      no_exact_match: items.length === 0,
      no_exact_match_message:
        items.length === 0 && hasExactOptionRequest(filters)
          ? 'No exact matching item is available for the requested memory, color, or SIM type.'
          : null,
      total_matches: result.total,
      returned_matches: items.length,
      items,
      suggestions,
    };
  }

  static async lookupAvailableDevices(): Promise<{
    ok: boolean;
    new_devices: string[];
    used_devices: string[];
  }> {
    const result = await this.sapService.getAvailableDeviceNames();

    return {
      ok: true,
      new_devices: sortDeviceNames(result.newDevices),
      used_devices: sortDeviceNames(result.usedDevices),
    };
  }
}
