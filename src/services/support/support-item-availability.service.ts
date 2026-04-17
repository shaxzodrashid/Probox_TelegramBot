import { ISapItem } from '../../interfaces/item.interface';
import { HanaService } from '../../sap/hana.service';
import { SapService } from '../../sap/sap-hana.service';

const DEFAULT_RESULT_LIMIT = 5;
const MAX_RESULT_LIMIT = 10;

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
  item_code: item.ItemCode,
  item_name: item.ItemName,
  store_code: item.WhsCode,
  store_name: item.WhsName,
  on_hand: toFiniteNumber(item.OnHand) || 0,
  sale_price: toFiniteNumber(item.SalePrice),
  item_group_name: item.ItemGroupName,
  model: item.U_Model || null,
  color: item.U_Color || null,
  memory: item.U_Memory || null,
  condition: item.U_PROD_CONDITION || item.U_Condition || null,
  sim_type: item.U_Sim_type || null,
});

export class SupportItemAvailabilityService {
  private static readonly sapService = new SapService(new HanaService());

  static async lookupAvailableItems(params: {
    query: string;
    store?: string | null;
    limit?: number;
  }): Promise<{
    ok: boolean;
    query: string;
    store: string | null;
    total_matches: number;
    returned_matches: number;
    items: ReturnType<typeof normalizeItem>[];
  }> {
    const query = params.query.trim();
    if (!query) {
      throw new Error('Item search query is required');
    }

    const store = params.store?.trim() || null;
    const limit = clampLimit(params.limit);
    const result = await this.sapService.getItems({
      search: query,
      limit,
      offset: 0,
      includeZeroOnHand: false,
      storeName: store || undefined,
      groupByWarehouse: true,
    });

    const items = result.data
      .slice(0, limit)
      .map(normalizeItem)
      .sort((left, right) => right.on_hand - left.on_hand);

    return {
      ok: true,
      query,
      store,
      total_matches: result.total,
      returned_matches: items.length,
      items,
    };
  }
}
