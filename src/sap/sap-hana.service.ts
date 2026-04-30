import { createHash } from 'crypto';
import { HanaService } from './hana.service';
import { logger } from '../utils/logger';
import { IBusinessPartner } from '../interfaces/business-partner.interface';
import { IPurchaseInstallment } from '../interfaces/purchase.interface';
import { loadSQL } from '../utils/sql-loader.utils';
import { normalizeUzPhone } from '../utils/uz-phone.util';
import { ISapItem } from '../interfaces/item.interface';
import { config } from '../config';

interface SapCurrencyRateRow {
  RateDate: string | Date;
  Currency: string;
  Rate: number | string;
}

interface ParsedItemSearch {
  normalizedSearch: string;
  residualSearch: string;
  model?: string;
  deviceType?: string | null;
  condition?: string;
}

interface SapAvailableDeviceRow {
  full_name: string;
  condition: string | null;
}

type SapHanaExecutor = Pick<HanaService, 'executeOnce'>;

export interface SapCacheStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, expireTime?: number): Promise<unknown>;
  isReady?: () => boolean;
}

export interface SapCacheOptions {
  cacheEnabled?: boolean;
  cacheTtlSeconds?: number;
  volatileCacheTtlSeconds?: number;
  cachePrefix?: string;
}

interface SapCacheEnvelope<T> {
  value: T;
  cachedAt: string;
  ttlSeconds: number;
}

type SapCacheLookup<T> =
  | {
      hit: true;
      value: T;
    }
  | {
      hit: false;
    };

interface SapCachePolicy<T> {
  ttlSeconds?: number;
  shouldUseCached?: (value: T) => boolean;
  shouldCache?: (value: T) => boolean;
}

export interface SapPercentageScheduleRow {
  month: number;
  percentage: number;
}

interface SapPercentageScheduleDbRow {
  month: number | string;
  percentage: number | string;
}

export interface SapInstallmentItemLookupRow {
  IMEI: string | null;
  ItemCode: string;
  ItemName: string;
  WhsCode: string;
  WhsName: string;
  OnHand: number | string;
  SalePrice: number | string;
  PurchasePrice: number | string | null;
  U_Model: string | null;
  U_DeviceType: string | null;
  U_Memory: string | null;
  U_Color: string | null;
  U_Sim_type: string | null;
  U_PROD_CONDITION: string | null;
}

export class SapService {
  private static defaultCache: SapCacheStore | null = null;
  private static defaultCacheOptions: SapCacheOptions = {};
  private static readonly inflightCacheRefreshes = new Map<string, Promise<unknown>>();

  private readonly logger = logger;
  private readonly schema: string = process.env.SAP_SCHEMA || 'PROBOX_PROD_3';
  private readonly explicitCache: SapCacheStore | null | undefined;
  private readonly cacheOptions: SapCacheOptions;

  constructor(
    private readonly hana: SapHanaExecutor,
    cache?: SapCacheStore | null,
    cacheOptions: SapCacheOptions = {},
  ) {
    this.explicitCache = cache;
    this.cacheOptions = cacheOptions;
  }

  static configureDefaultCache(
    cache: SapCacheStore | null,
    cacheOptions: SapCacheOptions = {},
  ): void {
    this.defaultCache = cache;
    this.defaultCacheOptions = cacheOptions;
  }

  private getCacheOption<K extends keyof SapCacheOptions>(key: K): SapCacheOptions[K] {
    return this.cacheOptions[key] ?? SapService.defaultCacheOptions[key];
  }

  private isCacheEnabled(): boolean {
    return this.getCacheOption('cacheEnabled') ?? config.SAP_REDIS_CACHE_ENABLED;
  }

  private getCachePrefix(): string {
    return this.getCacheOption('cachePrefix') || 'sap:hana:v1';
  }

  private normalizeTtlSeconds(value: number): number {
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 60 * 60;
  }

  private getStableCacheTtlSeconds(): number {
    return this.normalizeTtlSeconds(
      this.getCacheOption('cacheTtlSeconds') ?? config.SAP_REDIS_CACHE_TTL_SECONDS,
    );
  }

  private getVolatileCacheTtlSeconds(): number {
    return this.normalizeTtlSeconds(
      this.getCacheOption('volatileCacheTtlSeconds') ?? config.SAP_REDIS_VOLATILE_CACHE_TTL_SECONDS,
    );
  }

  private getActiveCache(): SapCacheStore | null {
    if (!this.isCacheEnabled()) {
      return null;
    }

    const cache = this.explicitCache !== undefined ? this.explicitCache : SapService.defaultCache;

    if (!cache) {
      return null;
    }

    if (cache.isReady && !cache.isReady()) {
      this.logger.debug('[SAP CACHE] Redis is not ready; querying SAP directly');
      return null;
    }

    return cache;
  }

  private normalizeCachePayload(value: unknown): unknown {
    if (value === undefined) {
      return undefined;
    }

    if (value === null || typeof value !== 'object') {
      return value;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeCachePayload(item));
    }

    const normalized: Record<string, unknown> = {};
    const record = value as Record<string, unknown>;

    for (const key of Object.keys(record).sort()) {
      const normalizedValue = this.normalizeCachePayload(record[key]);
      if (normalizedValue !== undefined) {
        normalized[key] = normalizedValue;
      }
    }

    return normalized;
  }

  private buildCacheKey(method: string, payload: unknown): string {
    const normalizedPayload = this.normalizeCachePayload(payload);
    const serializedPayload = JSON.stringify({
      schema: this.schema,
      method,
      payload: normalizedPayload,
    });
    const digest = createHash('sha256').update(serializedPayload).digest('hex');

    return `${this.getCachePrefix()}:${this.schema}:${method}:${digest}`;
  }

  private isCacheEnvelope<T>(value: unknown): value is SapCacheEnvelope<T> {
    return (
      typeof value === 'object' &&
      value !== null &&
      Object.prototype.hasOwnProperty.call(value, 'value') &&
      typeof (value as SapCacheEnvelope<T>).cachedAt === 'string'
    );
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private async readCache<T>(
    cache: SapCacheStore,
    key: string,
    method: string,
  ): Promise<SapCacheLookup<T>> {
    try {
      const cachedEntry = await cache.get<SapCacheEnvelope<T>>(key);

      if (!cachedEntry) {
        this.logger.debug('[SAP CACHE] miss', { method });
        return { hit: false };
      }

      if (!this.isCacheEnvelope<T>(cachedEntry)) {
        this.logger.warn('[SAP CACHE] Ignoring malformed cache entry', { method });
        return { hit: false };
      }

      this.logger.debug('[SAP CACHE] hit', { method });
      return {
        hit: true,
        value: cachedEntry.value,
      };
    } catch (error: unknown) {
      this.logger.warn('[SAP CACHE] Redis read failed; querying SAP directly', {
        method,
        error: this.getErrorMessage(error),
      });

      return { hit: false };
    }
  }

  private async writeCache<T>(
    cache: SapCacheStore,
    key: string,
    method: string,
    value: T,
    ttlSeconds: number,
  ): Promise<void> {
    try {
      const cacheEnvelope: SapCacheEnvelope<T> = {
        value,
        cachedAt: new Date().toISOString(),
        ttlSeconds,
      };

      await cache.set(key, cacheEnvelope, ttlSeconds);
      this.logger.debug('[SAP CACHE] stored value', { method, ttlSeconds });
    } catch (error: unknown) {
      this.logger.warn('[SAP CACHE] Redis write failed', {
        method,
        error: this.getErrorMessage(error),
      });
    }
  }

  private async cachedSapQuery<T>(
    method: string,
    payload: unknown,
    fetcher: () => Promise<T>,
    policy: SapCachePolicy<T> = {},
  ): Promise<T> {
    const cache = this.getActiveCache();

    if (!cache) {
      return fetcher();
    }

    const key = this.buildCacheKey(method, payload);
    const cached = await this.readCache<T>(cache, key, method);
    const shouldUseCached = policy.shouldUseCached || (() => true);

    if (cached.hit && shouldUseCached(cached.value)) {
      return cached.value;
    }

    if (cached.hit) {
      this.logger.info('[SAP CACHE] Cached value was not useful; refreshing from SAP', {
        method,
      });
    }

    const existingRefresh = SapService.inflightCacheRefreshes.get(key) as Promise<T> | undefined;
    if (existingRefresh) {
      return existingRefresh;
    }

    const refresh = (async () => {
      const value = await fetcher();
      const shouldCache = policy.shouldCache || (() => true);

      if (shouldCache(value)) {
        await this.writeCache(
          cache,
          key,
          method,
          value,
          policy.ttlSeconds || this.getStableCacheTtlSeconds(),
        );
      } else {
        this.logger.debug('[SAP CACHE] Skipped non-valuable SAP result', { method });
      }

      return value;
    })();

    SapService.inflightCacheRefreshes.set(key, refresh);

    try {
      return await refresh;
    } finally {
      SapService.inflightCacheRefreshes.delete(key);
    }
  }

  private hasRows<T>(rows: T[]): boolean {
    return Array.isArray(rows) && rows.length > 0;
  }

  private hasValuableItemsResult(result: { data: ISapItem[]; total: number }): boolean {
    return result.total > 0 || result.data.length > 0;
  }

  private hasValuableDeviceNames(result: { newDevices: string[]; usedDevices: string[] }): boolean {
    return result.newDevices.length > 0 || result.usedDevices.length > 0;
  }

  private hasValuableExchangeRateInfo(value: { rate: number } | null): boolean {
    return Boolean(value && Number.isFinite(value.rate) && value.rate > 0);
  }

  private hasValue<T>(value: T | null): boolean {
    return value !== null;
  }

  private buildItemsCachePayload(params: {
    search?: string;
    filters: Record<string, string | number | boolean | undefined>;
    limit: number;
    offset: number;
    whsCode?: string;
    storeName?: string;
    includeZeroOnHand: boolean;
    groupByWarehouse: boolean;
  }): Record<string, unknown> {
    const normalizedFilters: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params.filters).sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      if (value === undefined) {
        continue;
      }

      if (key === 'condition') {
        normalizedFilters[key] =
          this.canonicalizeCondition(value) ?? this.normalizeSearchValue(String(value));
      } else if (key === 'deviceType') {
        const normalizedDeviceType = this.canonicalizeDeviceType(value);
        normalizedFilters[key] =
          normalizedDeviceType === undefined
            ? this.normalizeSearchValue(String(value))
            : normalizedDeviceType;
      } else if (typeof value === 'string') {
        normalizedFilters[key] = this.normalizeSearchValue(value);
      } else {
        normalizedFilters[key] = value;
      }
    }

    return {
      search: params.search ? this.normalizeSearchValue(params.search) : null,
      filters: normalizedFilters,
      limit: params.limit,
      offset: params.offset,
      whsCode: params.whsCode?.trim() || null,
      storeName: params.storeName ? this.normalizeSearchValue(params.storeName) : null,
      includeZeroOnHand: params.includeZeroOnHand,
      groupByWarehouse: params.groupByWarehouse,
    };
  }

  private escapeSqlValue(value: string): string {
    return value.replace(/'/g, "''").trim();
  }

  private escapeLikeValue(value: string): string {
    return this.escapeSqlValue(value).replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&');
  }

  private normalizeSearchValue(value: string): string {
    return value
      .toLowerCase()
      .replace(/[‘’`´]/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  private buildNormalizedEquals(column: string, value: string): string {
    const normalizedValue = this.escapeSqlValue(this.normalizeSearchValue(value));
    return `LOWER(TRIM(COALESCE(${column}, ''))) = '${normalizedValue}'`;
  }

  private buildNormalizedLike(column: string, value: string): string {
    const normalizedValue = this.escapeLikeValue(this.normalizeSearchValue(value));
    return `LOWER(COALESCE(${column}, '')) LIKE '%${normalizedValue}%' ESCAPE '\\'`;
  }

  private buildBlankDeviceTypeClause(column: string): string {
    return `(${column} IS NULL OR TRIM(${column}) = '' OR TRIM(${column}) = '-' OR LOWER(TRIM(${column})) = 'null')`;
  }

  private buildGenericItemSearchClause(value: string): string {
    return `
      (
        ${this.buildNormalizedLike('T1."ItemCode"', value)}
        OR ${this.buildNormalizedLike('T1."ItemName"', value)}
        OR ${this.buildNormalizedLike('T1."U_Model"', value)}
        OR ${this.buildNormalizedLike('T1."U_DeviceType"', value)}
        OR ${this.buildNormalizedLike('T1."U_Memory"', value)}
        OR ${this.buildNormalizedLike('T1."U_Color"', value)}
        OR ${this.buildNormalizedLike('T1."U_Sim_type"', value)}
        OR ${this.buildNormalizedLike('T1."U_PROD_CONDITION"', value)}
      )
    `;
  }

  private canonicalizeCondition(value: unknown): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    const raw = String(value).trim();
    if (!raw) {
      return undefined;
    }

    const normalized = this.normalizeSearchValue(raw);
    const compact = normalized.replace(/[\s/-]+/g, '');

    if (normalized === 'yangi' || normalized === 'new') {
      return 'Yangi';
    }

    if (normalized === 'used' || compact === 'bu') {
      return 'B/U';
    }

    return raw;
  }

  private canonicalizeDeviceType(value: unknown): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }

    const raw = String(value).trim();
    if (!raw) {
      return undefined;
    }

    if (raw === '-') {
      return null;
    }

    const normalized = this.normalizeSearchValue(raw).replace(/-/g, ' ');
    const compact = normalized.replace(/\s+/g, '');

    if (
      normalized === 'base' ||
      normalized === 'regular' ||
      normalized === 'standard' ||
      normalized === 'none' ||
      normalized === 'null'
    ) {
      return null;
    }

    if (normalized === 'pro max' || compact === 'promax') {
      return 'Pro Max';
    }

    if (normalized === 'pro') {
      return 'Pro';
    }

    return raw;
  }

  private parseStructuredItemSearch(search: string): ParsedItemSearch {
    const normalizedSearch = this.normalizeSearchValue(search);
    let workingSearch = ` ${normalizedSearch} `;

    let condition: string | undefined;
    const conditionPatterns = [
      { regex: /\bb\s*\/\s*u\b/i, value: 'B/U' },
      { regex: /\bb\s*u\b/i, value: 'B/U' },
      { regex: /\bused\b/i, value: 'B/U' },
      { regex: /\byangi\b/i, value: 'Yangi' },
      { regex: /\bnew\b/i, value: 'Yangi' },
    ];

    for (const pattern of conditionPatterns) {
      if (pattern.regex.test(workingSearch)) {
        condition = pattern.value;
        workingSearch = workingSearch.replace(pattern.regex, ' ');
        break;
      }
    }

    let deviceType: string | null | undefined;
    const deviceTypePatterns = [
      { regex: /\bpro[\s-]*max\b/i, value: 'Pro Max' },
      { regex: /\bpro\b/i, value: 'Pro' },
    ];

    for (const pattern of deviceTypePatterns) {
      if (pattern.regex.test(workingSearch)) {
        deviceType = pattern.value;
        workingSearch = workingSearch.replace(pattern.regex, ' ');
        break;
      }
    }

    const modelMatch = workingSearch.match(/\biphone\s*(\d{1,2}[a-z]?|air|se)\b/i);
    const model = modelMatch ? `iphone ${modelMatch[1]}` : undefined;

    if (modelMatch) {
      workingSearch = workingSearch.replace(modelMatch[0], ' ');
    }

    const residualSearch = workingSearch.replace(/\s+/g, ' ').trim();

    return {
      normalizedSearch,
      residualSearch,
      model,
      deviceType,
      condition,
    };
  }

  private buildItemOrderByClauses(options: {
    isIMEI: boolean;
    parsedSearch?: ParsedItemSearch;
  }): string[] {
    const modelExpr = `LOWER(TRIM(COALESCE(MAX(T1."U_Model"), '')))`;
    const deviceTypeExpr = `LOWER(TRIM(COALESCE(MAX(T1."U_DeviceType"), '')))`;
    const conditionExpr = `LOWER(TRIM(COALESCE(MAX(T1."U_PROD_CONDITION"), '')))`;
    const itemNameExpr = `LOWER(COALESCE(MAX(T1."ItemName"), ''))`;
    const itemCodeExpr = `LOWER(T0."ItemCode")`;

    const clauses: string[] = [];
    const parsedSearch = options.parsedSearch;

    if (parsedSearch?.model) {
      clauses.push(
        `CASE WHEN ${modelExpr} = '${this.escapeSqlValue(parsedSearch.model)}' THEN 0 ELSE 1 END`,
      );

      if (parsedSearch.deviceType) {
        clauses.push(
          `CASE WHEN ${deviceTypeExpr} = '${this.escapeSqlValue(this.normalizeSearchValue(parsedSearch.deviceType))}' THEN 0 ELSE 1 END`,
        );
      } else {
        clauses.push(`CASE WHEN ${deviceTypeExpr} IN ('', '-') THEN 0 ELSE 1 END`);
      }
    } else {
      const fallbackSearch =
        parsedSearch?.residualSearch ||
        (!parsedSearch?.condition ? parsedSearch?.normalizedSearch : undefined);

      if (fallbackSearch) {
        const exactSearch = this.escapeSqlValue(fallbackSearch);
        const likeSearch = this.escapeLikeValue(fallbackSearch);

        clauses.push(
          `CASE
            WHEN ${itemCodeExpr} = '${exactSearch}' THEN 0
            WHEN ${modelExpr} = '${exactSearch}' THEN 1
            WHEN ${itemNameExpr} LIKE '%${likeSearch}%' ESCAPE '\\' THEN 2
            ELSE 3
          END`,
        );
      }
    }

    if (parsedSearch?.condition) {
      clauses.push(
        `CASE WHEN ${conditionExpr} = '${this.escapeSqlValue(this.normalizeSearchValue(parsedSearch.condition))}' THEN 0 ELSE 1 END`,
      );
    } else {
      clauses.push(
        `CASE
          WHEN ${conditionExpr} = 'yangi' THEN 0
          WHEN ${conditionExpr} = 'b/u' THEN 1
          ELSE 2
        END`,
      );
    }

    clauses.push(`SUM(CAST(T0."OnHand" AS INTEGER)) DESC`);

    if (!options.isIMEI) {
      clauses.push(`MAX(PR."Price") DESC`);
    }

    clauses.push(`MAX(T1."ItemName") ASC`);

    return clauses;
  }

  async getBusinessPartnerByPhone(phone: string): Promise<IBusinessPartner[]> {
    const sql = loadSQL('sap/queries/get-business-partner.sql').replace(/{{schema}}/g, this.schema);

    const { full } = normalizeUzPhone(phone);

    return this.cachedSapQuery(
      'business-partner:phone',
      { phone: full },
      async () => {
        this.logger.info(`📦 [SAP] Fetching business partner by phone (full=${full})`);

        try {
          return await this.hana.executeOnce<IBusinessPartner>(sql, [full, full]);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);

          this.logger.error('❌ [SAP] getBusinessPartnerByPhone failed', message);

          throw new Error(`SAP query failed (getBusinessPartnerByPhone)`);
        }
      },
      {
        ttlSeconds: this.getVolatileCacheTtlSeconds(),
        shouldUseCached: (rows) => this.hasRows(rows),
        shouldCache: (rows) => this.hasRows(rows),
      },
    );
  }

  async getBusinessPartnerByJshshir(jshshir: string): Promise<IBusinessPartner[]> {
    const sql = loadSQL('sap/queries/get-business-partner-by-jshshir.sql').replace(
      /{{schema}}/g,
      this.schema,
    );

    const normalizedJshshir = jshshir.trim();

    return this.cachedSapQuery(
      'business-partner:jshshir',
      { jshshir: normalizedJshshir },
      async () => {
        this.logger.info(`📦 [SAP] Fetching business partner by jshshir: ${normalizedJshshir}`);

        try {
          return await this.hana.executeOnce<IBusinessPartner>(sql, [normalizedJshshir]);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);

          this.logger.error('❌ [SAP] getBusinessPartnerByJshshir failed', message);

          throw new Error(`SAP query failed (getBusinessPartnerByJshshir)`);
        }
      },
      {
        ttlSeconds: this.getVolatileCacheTtlSeconds(),
        shouldUseCached: (rows) => this.hasRows(rows),
        shouldCache: (rows) => this.hasRows(rows),
      },
    );
  }

  async getBPpurchasesByCardCode(cardCode: string): Promise<IPurchaseInstallment[]> {
    const sql = loadSQL('sap/queries/get-bp-purchases.sql').replace(/{{schema}}/g, this.schema);

    return this.cachedSapQuery(
      'bp-purchases:card-code',
      { cardCode },
      async () => {
        this.logger.info(`📦 [SAP] Fetching purchases for CardCode: ${cardCode}`);

        try {
          return await this.hana.executeOnce<IPurchaseInstallment>(sql, [cardCode]);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);

          this.logger.error('❌ [SAP] getBPpurchasesByCardCode failed', message);

          throw new Error(`SAP query failed (getBPpurchasesByCardCode)`);
        }
      },
      {
        ttlSeconds: this.getVolatileCacheTtlSeconds(),
        shouldUseCached: (rows) => this.hasRows(rows),
        shouldCache: (rows) => this.hasRows(rows),
      },
    );
  }

  async getBusinessPartnersByPhones(phones: string[]): Promise<IBusinessPartner[]> {
    if (phones.length === 0) return [];

    const normalizedPhones = phones.map((p) => normalizeUzPhone(p).full);
    const placeholders = normalizedPhones.map(() => '?').join(',');

    const sql = loadSQL('sap/queries/get-business-partners-batch.sql')
      .replace(/{{schema}}/g, this.schema)
      .replace(/{{phones}}/g, placeholders);

    return this.cachedSapQuery(
      'business-partners:phones',
      { phones: normalizedPhones },
      async () => {
        this.logger.info(
          `📦 [SAP] Fetching batch business partners (${normalizedPhones.length} phones)`,
        );

        try {
          // The query uses IN ({{phones}}) twice: once for Phone1 and once for Phone2
          const params = [...normalizedPhones, ...normalizedPhones];
          return await this.hana.executeOnce<IBusinessPartner>(sql, params);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);

          this.logger.error('❌ [SAP] getBusinessPartnersByPhones failed', message);

          throw new Error(`SAP query failed (getBusinessPartnersByPhones)`);
        }
      },
      {
        ttlSeconds: this.getVolatileCacheTtlSeconds(),
        shouldUseCached: (rows) => this.hasRows(rows),
        shouldCache: (rows) => this.hasRows(rows),
      },
    );
  }

  async getBatchPurchasesByCardCodes(cardCodes: string[]): Promise<IPurchaseInstallment[]> {
    if (cardCodes.length === 0) return [];

    const placeholders = cardCodes.map(() => '?').join(',');
    const sql = loadSQL('sap/queries/get-bp-purchases-batch.sql')
      .replace(/{{schema}}/g, this.schema)
      .replace(/{{cardCodes}}/g, placeholders);

    return this.cachedSapQuery(
      'bp-purchases:card-codes',
      { cardCodes },
      async () => {
        this.logger.info(`📦 [SAP] Fetching batch purchases (${cardCodes.length} card codes)`);

        try {
          return await this.hana.executeOnce<IPurchaseInstallment>(sql, cardCodes);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);

          this.logger.error('❌ [SAP] getBatchPurchasesByCardCodes failed', message);

          throw new Error(`SAP query failed (getBatchPurchasesByCardCodes)`);
        }
      },
      {
        ttlSeconds: this.getVolatileCacheTtlSeconds(),
        shouldUseCached: (rows) => this.hasRows(rows),
        shouldCache: (rows) => this.hasRows(rows),
      },
    );
  }

  async getPaymentReminderInstallments(params: {
    dueDateFrom: string;
    dueDateTo: string;
  }): Promise<IPurchaseInstallment[]> {
    const sql = loadSQL('sap/queries/get-payment-reminder-installments.sql').replace(
      /{{schema}}/g,
      this.schema,
    );

    this.logger.info(
      `📦 [SAP] Fetching payment reminder installments from ${params.dueDateFrom} to ${params.dueDateTo}`,
    );

    try {
      return await this.hana.executeOnce<IPurchaseInstallment>(sql, [
        params.dueDateFrom,
        params.dueDateTo,
        params.dueDateFrom,
        params.dueDateTo,
        params.dueDateTo,
      ]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      this.logger.error('❌ [SAP] getPaymentReminderInstallments failed', message);

      throw new Error('SAP query failed (getPaymentReminderInstallments)');
    }
  }

  async getLatestExchangeRate(currency: string = 'UZS'): Promise<number | null> {
    const result = await this.getLatestExchangeRateInfo(currency);
    return result?.rate ?? null;
  }

  async getLatestExchangeRateInfo(currency: string = 'UZS'): Promise<{
    currency: string;
    rate: number;
    rateDate: string | Date;
  } | null> {
    const sql = loadSQL('sap/queries/get-currency-rate.sql').replace(/{{schema}}/g, this.schema);

    const normalizedCurrency = currency.trim().toUpperCase();
    return this.cachedSapQuery(
      'currency:latest-rate',
      { currency: normalizedCurrency },
      async () => {
        this.logger.info(
          `📦 [SAP] Fetching latest exchange rate for currency: ${normalizedCurrency}`,
        );

        try {
          const rows = await this.hana.executeOnce<SapCurrencyRateRow>(sql, [normalizedCurrency]);
          const row = rows[0];
          const rate = row?.Rate;

          if (rate === undefined || rate === null) {
            return null;
          }

          const numericRate = typeof rate === 'string' ? parseFloat(rate) : rate;
          if (!Number.isFinite(numericRate)) {
            return null;
          }

          return {
            currency: row.Currency?.trim()?.toUpperCase() || normalizedCurrency,
            rate: numericRate,
            rateDate: row.RateDate,
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);

          this.logger.error('❌ [SAP] getLatestExchangeRate failed', message);

          throw new Error(`SAP query failed (getLatestExchangeRateInfo)`);
        }
      },
      {
        shouldUseCached: (value) => this.hasValuableExchangeRateInfo(value),
        shouldCache: (value) => this.hasValuableExchangeRateInfo(value),
      },
    );
  }

  async getPercentageSchedule(): Promise<SapPercentageScheduleRow[]> {
    const db = this.schema;
    const sql = `
    SELECT
      CAST("U_month" AS INTEGER) AS "month",
      CAST("U_percentage" AS DECIMAL(18, 4)) AS "percentage"
    FROM ${db}."@PERCENTAGE"
    WHERE COALESCE("Canceled", 'N') = 'N'
    ORDER BY CAST("U_month" AS INTEGER)
`;

    return this.cachedSapQuery(
      'installment:percentage-schedule',
      {},
      async () => {
        try {
          this.logger.info('📦 [SAP] Fetching installment percentage schedule');
          const rows = await this.hana.executeOnce<SapPercentageScheduleDbRow>(sql);

          return rows
            .map((row) => ({
              month: Number(row.month),
              percentage: Number(row.percentage),
            }))
            .filter((row) => Number.isFinite(row.month) && Number.isFinite(row.percentage));
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);

          this.logger.error('❌ [SAP] getPercentageSchedule failed', message);

          throw new Error('SAP query failed (getPercentageSchedule)');
        }
      },
      {
        shouldUseCached: (rows) => this.hasRows(rows),
        shouldCache: (rows) => this.hasRows(rows),
      },
    );
  }

  async getInstallmentPercentageForMonths(
    months: number,
  ): Promise<SapPercentageScheduleRow | null> {
    const normalizedMonths = Math.trunc(months);
    if (!Number.isFinite(normalizedMonths) || normalizedMonths <= 0) {
      return null;
    }

    const db = this.schema;
    const sql = `
    SELECT
      CAST("U_month" AS INTEGER) AS "month",
      CAST("U_percentage" AS DECIMAL(18, 4)) AS "percentage"
    FROM ${db}."@PERCENTAGE"
    WHERE COALESCE("Canceled", 'N') = 'N'
      AND CAST("U_month" AS INTEGER) = ?
    LIMIT 1
`;

    return this.cachedSapQuery(
      'installment:percentage-month',
      { months: normalizedMonths },
      async () => {
        try {
          this.logger.info(
            `📦 [SAP] Fetching installment percentage for ${normalizedMonths} months`,
          );
          const rows = await this.hana.executeOnce<SapPercentageScheduleDbRow>(sql, [
            normalizedMonths,
          ]);
          const row = rows[0];

          if (!row) {
            return null;
          }

          const percentage = Number(row.percentage);
          if (!Number.isFinite(percentage)) {
            return null;
          }

          return {
            month: Number(row.month),
            percentage,
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);

          this.logger.error('❌ [SAP] getInstallmentPercentageForMonths failed', message);

          throw new Error('SAP query failed (getInstallmentPercentageForMonths)');
        }
      },
      {
        shouldUseCached: (row) => this.hasValue(row),
        shouldCache: (row) => this.hasValue(row),
      },
    );
  }

  async getInstallmentItemByImeiOrItemCode(params: {
    imei?: string | null;
    itemCode?: string | null;
  }): Promise<SapInstallmentItemLookupRow | null> {
    const imei = params.imei?.trim();
    const itemCode = params.itemCode?.trim();

    if (imei) {
      const item = await this.getInstallmentItemByImei(imei);
      if (item) {
        return item;
      }
    }

    if (itemCode) {
      return this.getInstallmentItemByItemCode(itemCode);
    }

    return null;
  }

  private async getInstallmentItemByImei(
    imei: string,
  ): Promise<SapInstallmentItemLookupRow | null> {
    const db = this.schema;
    const sql = `
    SELECT
      R."DistNumber"                       AS "IMEI",
      T1."ItemCode"                        AS "ItemCode",
      T1."ItemName"                        AS "ItemName",
      Q."WhsCode"                          AS "WhsCode",
      MAX(T2."WhsName")                    AS "WhsName",
      SUM(CAST(Q."Quantity" AS INTEGER))   AS "OnHand",
      MAX(PR."Price")                      AS "SalePrice",
      MAX(R."CostTotal")                   AS "PurchasePrice",
      MAX(T1."U_Model")                    AS "U_Model",
      MAX(T1."U_DeviceType")               AS "U_DeviceType",
      MAX(T1."U_Memory")                   AS "U_Memory",
      MAX(T1."U_Color")                    AS "U_Color",
      MAX(T1."U_Sim_type")                 AS "U_Sim_type",
      MAX(T1."U_PROD_CONDITION")           AS "U_PROD_CONDITION"
    FROM ${db}."OSRN" R
      INNER JOIN ${db}."OSRQ" Q
        ON Q."ItemCode" = R."ItemCode"
       AND Q."SysNumber" = R."SysNumber"
      INNER JOIN ${db}."OITM" T1 ON T1."ItemCode" = R."ItemCode"
      INNER JOIN ${db}."OWHS" T2 ON T2."WhsCode" = Q."WhsCode"
      LEFT JOIN ${db}."ITM1" PR
        ON PR."ItemCode" = T1."ItemCode"
       AND PR."PriceList" = 1
    WHERE
      R."DistNumber" = ?
      AND Q."Quantity" > 0
      AND (COALESCE(PR."Price", 0) > 0 OR COALESCE(R."CostTotal", 0) > 0)
    GROUP BY
      R."DistNumber",
      T1."ItemCode",
      T1."ItemName",
      Q."WhsCode"
    ORDER BY SUM(CAST(Q."Quantity" AS INTEGER)) DESC
    LIMIT 1
`;

    return this.cachedSapQuery(
      'installment:item-imei',
      { imei },
      async () => {
        try {
          this.logger.info('📦 [SAP] Fetching installment item by IMEI');
          const rows = await this.hana.executeOnce<SapInstallmentItemLookupRow>(sql, [imei]);
          return rows[0] || null;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);

          this.logger.error('❌ [SAP] getInstallmentItemByImei failed', message);

          throw new Error('SAP query failed (getInstallmentItemByImei)');
        }
      },
      {
        shouldUseCached: (row) => this.hasValue(row),
        shouldCache: (row) => this.hasValue(row),
      },
    );
  }

  private async getInstallmentItemByItemCode(
    itemCode: string,
  ): Promise<SapInstallmentItemLookupRow | null> {
    const db = this.schema;
    const sql = `
    SELECT
      NULL                                  AS "IMEI",
      T1."ItemCode"                        AS "ItemCode",
      MAX(T1."ItemName")                   AS "ItemName",
      T0."WhsCode"                         AS "WhsCode",
      MAX(T2."WhsName")                    AS "WhsName",
      SUM(CAST(T0."OnHand" AS INTEGER))    AS "OnHand",
      MAX(PR."Price")                      AS "SalePrice",
      MAX(
        CASE
          WHEN Q."Quantity" > 0 THEN R."CostTotal"
          ELSE NULL
        END
      )                                    AS "PurchasePrice",
      MAX(T1."U_Model")                    AS "U_Model",
      MAX(T1."U_DeviceType")               AS "U_DeviceType",
      MAX(T1."U_Memory")                   AS "U_Memory",
      MAX(T1."U_Color")                    AS "U_Color",
      MAX(T1."U_Sim_type")                 AS "U_Sim_type",
      MAX(T1."U_PROD_CONDITION")           AS "U_PROD_CONDITION"
    FROM ${db}."OITW" T0
      INNER JOIN ${db}."OITM" T1 ON T0."ItemCode" = T1."ItemCode"
      INNER JOIN ${db}."OWHS" T2 ON T0."WhsCode" = T2."WhsCode"
      LEFT JOIN ${db}."OSRN" R
        ON R."ItemCode" = T1."ItemCode"
      LEFT JOIN ${db}."OSRQ" Q
        ON Q."ItemCode" = R."ItemCode"
       AND Q."SysNumber" = R."SysNumber"
       AND Q."WhsCode" = T0."WhsCode"
       AND Q."Quantity" > 0
      LEFT JOIN ${db}."ITM1" PR
        ON PR."ItemCode" = T1."ItemCode"
       AND PR."PriceList" = 1
    WHERE
      T1."ItemCode" = ?
      AND T0."OnHand" > 0
    GROUP BY
      T1."ItemCode",
      T0."WhsCode"
    HAVING
      COALESCE(MAX(PR."Price"), 0) > 0
      OR COALESCE(MAX(CASE WHEN Q."Quantity" > 0 THEN R."CostTotal" ELSE NULL END), 0) > 0
    ORDER BY SUM(CAST(T0."OnHand" AS INTEGER)) DESC
    LIMIT 1
`;

    return this.cachedSapQuery(
      'installment:item-code',
      { itemCode },
      async () => {
        try {
          this.logger.info('📦 [SAP] Fetching installment item by item code');
          const rows = await this.hana.executeOnce<SapInstallmentItemLookupRow>(sql, [itemCode]);
          return rows[0] || null;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);

          this.logger.error('❌ [SAP] getInstallmentItemByItemCode failed', message);

          throw new Error('SAP query failed (getInstallmentItemByItemCode)');
        }
      },
      {
        shouldUseCached: (row) => this.hasValue(row),
        shouldCache: (row) => this.hasValue(row),
      },
    );
  }

  async getAvailableDeviceNames(): Promise<{ newDevices: string[]; usedDevices: string[] }> {
    const db = this.schema;
    const fullNameExpression = `
      TRIM(
        CASE
          WHEN T1."U_DeviceType" IS NULL
            OR TRIM(T1."U_DeviceType") = ''
            OR TRIM(T1."U_DeviceType") = '-'
            OR LOWER(TRIM(T1."U_DeviceType")) = 'null'
          THEN COALESCE(T1."U_Model", '')
          ELSE COALESCE(T1."U_Model", '') || ' ' || TRIM(T1."U_DeviceType")
        END
      )
    `;

    const sql = `
    SELECT
      ${fullNameExpression} AS "full_name",
      T1."U_PROD_CONDITION" AS "condition"
    FROM ${db}."OITW" T0
      INNER JOIN ${db}."OITM" T1 ON T0."ItemCode" = T1."ItemCode"
    WHERE
      T0."OnHand" > 0
      AND T1."U_Model" IS NOT NULL
      AND TRIM(T1."U_Model") <> ''
    GROUP BY
      ${fullNameExpression},
      LOWER(TRIM(COALESCE(T1."U_PROD_CONDITION", ''))),
      T1."U_PROD_CONDITION"
    ORDER BY "full_name" ASC
`;

    return this.cachedSapQuery(
      'catalog:available-device-names',
      {},
      async () => {
        try {
          this.logger.info('📦 [SAP] Fetching available device names');
          const rows = await this.hana.executeOnce<SapAvailableDeviceRow>(sql);

          const grouped = rows.reduce(
            (accumulator, row) => {
              const fullName = row.full_name?.trim();
              if (!fullName) {
                return accumulator;
              }

              const condition = this.canonicalizeCondition(row.condition);
              if (condition === 'Yangi') {
                accumulator.newDevices.add(fullName);
              } else if (condition === 'B/U') {
                accumulator.usedDevices.add(fullName);
              }

              return accumulator;
            },
            {
              newDevices: new Set<string>(),
              usedDevices: new Set<string>(),
            },
          );

          return {
            newDevices: Array.from(grouped.newDevices).sort((left, right) =>
              left.localeCompare(right),
            ),
            usedDevices: Array.from(grouped.usedDevices).sort((left, right) =>
              left.localeCompare(right),
            ),
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error('❌ [SAP] getAvailableDeviceNames failed', message);
          throw new Error('SAP query failed (getAvailableDeviceNames)');
        }
      },
      {
        shouldUseCached: (result) => this.hasValuableDeviceNames(result),
        shouldCache: (result) => this.hasValuableDeviceNames(result),
      },
    );
  }

  async getItems({
    search,
    filters = {},
    limit = 50,
    offset = 0,
    whsCode,
    storeName,
    includeZeroOnHand = false,
    groupByWarehouse = false,
  }: {
    search?: string;
    filters?: Record<string, string | number | boolean | undefined>;
    limit?: number;
    offset?: number;
    whsCode?: string;
    storeName?: string;
    includeZeroOnHand?: boolean;
    groupByWarehouse?: boolean;
  }): Promise<{ data: ISapItem[]; total: number }> {
    const db = this.schema;
    const whereClauses = ['1=1'];
    const parsedSearch = search ? this.parseStructuredItemSearch(search) : undefined;

    if (!includeZeroOnHand) {
      whereClauses.push(`T0."OnHand" > 0`);
    }

    let imeiJoin = '';
    let imeiWhere = '';

    const isIMEI = Boolean(search && /^\d+$/.test(search) && search.length >= 4);
    const conditionExpression = `LOWER(TRIM(COALESCE(T1."U_PROD_CONDITION", '')))`;
    const selectConditionExpression = `LOWER(TRIM(COALESCE(MAX(T1."U_PROD_CONDITION"), '')))`;
    const isUsedConditionExpression = `${conditionExpression} IN ('b/u', 'b\\u')`;
    const selectIsUsedConditionExpression = `${selectConditionExpression} IN ('b/u', 'b\\u')`;
    const latestUzsRateExpression = `(
      SELECT CAST(RT."Rate" AS DECIMAL(18, 6))
      FROM ${db}."ORTT" RT
      WHERE RT."Currency" = 'UZS'
      ORDER BY RT."RateDate" DESC
      LIMIT 1
    )`;
    const nonImeiPurchasePriceExpression = `(
        SELECT MAX(RP."CostTotal")
        FROM ${db}."OSRN" RP
          INNER JOIN ${db}."OSRQ" QP
            ON QP."ItemCode" = RP."ItemCode"
           AND QP."SysNumber" = RP."SysNumber"
        WHERE RP."ItemCode" = T0."ItemCode"
          ${groupByWarehouse ? 'AND QP."WhsCode" = T0."WhsCode"' : ''}
          AND QP."Quantity" > 0
      )`;
    const imeiPurchasePriceExpression = `MAX(
        CASE
          WHEN Q."Quantity" > 0 THEN R."CostTotal"
          ELSE NULL
        END
      )`;
    const purchasePriceExpression = isIMEI
      ? imeiPurchasePriceExpression
      : nonImeiPurchasePriceExpression;
    const salePriceExpression = `CASE
        WHEN ${selectIsUsedConditionExpression}
        THEN ${purchasePriceExpression} * ${latestUzsRateExpression}
        ELSE MAX(PR."Price")
      END`;
    const nonImeiUsedPriceExistsExpression = `EXISTS (
      SELECT 1
      FROM ${db}."OSRN" RP
        INNER JOIN ${db}."OSRQ" QP
          ON QP."ItemCode" = RP."ItemCode"
         AND QP."SysNumber" = RP."SysNumber"
      WHERE RP."ItemCode" = T0."ItemCode"
        ${groupByWarehouse ? 'AND QP."WhsCode" = T0."WhsCode"' : ''}
        AND QP."Quantity" > 0
        AND COALESCE(RP."CostTotal", 0) > 0
    )`;
    const usedPriceAvailableExpression = isIMEI
      ? `COALESCE(R."CostTotal", 0) > 0`
      : nonImeiUsedPriceExistsExpression;

    whereClauses.push(`(
      (${isUsedConditionExpression} AND ${usedPriceAvailableExpression})
      OR (${conditionExpression} NOT IN ('b/u', 'b\\u') AND COALESCE(PR."Price", 0) > 0)
    )`);

    if (whsCode) {
      whereClauses.push(`T0."WhsCode" = '${this.escapeSqlValue(whsCode)}'`);
    }

    if (storeName) {
      whereClauses.push(this.buildNormalizedLike('T2."WhsName"', storeName));
    }

    if (isIMEI) {
      const escapedSearch = this.escapeSqlValue(search || '');
      const whsCondition = whsCode ? ` AND Q."WhsCode" = '${this.escapeSqlValue(whsCode)}'` : ``;

      imeiJoin = `
      LEFT JOIN ${db}."OSRN" R
        ON R."ItemCode" = T1."ItemCode"
      LEFT JOIN ${db}."OSRQ" Q
        ON Q."ItemCode" = R."ItemCode"
       AND Q."SysNumber" = R."SysNumber"
       AND Q."WhsCode" = T0."WhsCode"
       ${whsCondition}
    `;

      imeiWhere = `
      AND R."DistNumber" LIKE '%${escapedSearch}%'
      AND Q."Quantity" > 0
    `;
    } else if (search) {
      if (parsedSearch?.model) {
        whereClauses.push(this.buildNormalizedEquals('T1."U_Model"', parsedSearch.model));

        if (parsedSearch.deviceType) {
          whereClauses.push(
            this.buildNormalizedEquals('T1."U_DeviceType"', parsedSearch.deviceType),
          );
        } else {
          whereClauses.push(this.buildBlankDeviceTypeClause('T1."U_DeviceType"'));
        }

        if (parsedSearch.condition) {
          whereClauses.push(
            this.buildNormalizedEquals('T1."U_PROD_CONDITION"', parsedSearch.condition),
          );
        }

        if (parsedSearch.residualSearch) {
          whereClauses.push(this.buildGenericItemSearchClause(parsedSearch.residualSearch));
        }
      } else {
        if (parsedSearch?.condition) {
          whereClauses.push(
            this.buildNormalizedEquals('T1."U_PROD_CONDITION"', parsedSearch.condition),
          );
        }

        const fallbackSearch =
          parsedSearch?.residualSearch || (!parsedSearch?.condition ? search : undefined);

        if (fallbackSearch) {
          whereClauses.push(this.buildGenericItemSearchClause(fallbackSearch));
        }
      }
    }

    if (filters.model) {
      whereClauses.push(this.buildNormalizedEquals('T1."U_Model"', String(filters.model)));
    }

    const normalizedDeviceType = this.canonicalizeDeviceType(filters.deviceType);
    if (normalizedDeviceType !== undefined) {
      if (normalizedDeviceType === null) {
        whereClauses.push(this.buildBlankDeviceTypeClause('T1."U_DeviceType"'));
      } else {
        whereClauses.push(this.buildNormalizedEquals('T1."U_DeviceType"', normalizedDeviceType));
      }
    }

    if (filters.memory) {
      whereClauses.push(this.buildNormalizedEquals('T1."U_Memory"', String(filters.memory)));
    }

    if (filters.simType) {
      whereClauses.push(this.buildNormalizedEquals('T1."U_Sim_type"', String(filters.simType)));
    }

    const normalizedCondition = this.canonicalizeCondition(filters.condition);
    if (normalizedCondition) {
      whereClauses.push(this.buildNormalizedEquals('T1."U_PROD_CONDITION"', normalizedCondition));
    }

    if (filters.color) {
      whereClauses.push(this.buildNormalizedEquals('T1."U_Color"', String(filters.color)));
    }

    if (filters.itemGroupCode) {
      whereClauses.push(
        `T1."ItmsGrpCod" = '${this.escapeSqlValue(String(filters.itemGroupCode))}'`,
      );
    }

    const whereQuery = 'WHERE ' + whereClauses.join(' AND ') + imeiWhere;

    const imeiSelect = isIMEI ? `R."DistNumber" AS "IMEI",` : '';
    const warehouseGroupColumns = groupByWarehouse ? `, T0."WhsCode"` : '';
    const warehouseDistinctExpr = groupByWarehouse
      ? `T0."ItemCode" || ':' || T0."WhsCode"`
      : `T0."ItemCode"`;
    const orderByClauses = this.buildItemOrderByClauses({
      isIMEI,
      parsedSearch: isIMEI ? undefined : parsedSearch,
    });

    const serialPriceJoin = isIMEI ? imeiJoin : '';

    const baseFrom = `
    FROM ${db}."OITW" T0
      INNER JOIN ${db}."OITM" T1 ON T0."ItemCode" = T1."ItemCode"
      INNER JOIN ${db}."OWHS" T2 ON T0."WhsCode" = T2."WhsCode"
      INNER JOIN ${db}."OITB" G ON G."ItmsGrpCod" = T1."ItmsGrpCod"
      ${serialPriceJoin}
      LEFT JOIN ${db}."ITM1" PR
        ON PR."ItemCode" = T1."ItemCode"
       AND PR."PriceList" = 1
    ${whereQuery}
  `;

    const dataSql = `
    SELECT
      ${imeiSelect}
      T0."ItemCode",
      ${groupByWarehouse ? `T0."WhsCode"` : `MAX(T0."WhsCode")`} AS "WhsCode",
      SUM(CAST(T0."OnHand" AS INTEGER))     AS "OnHand",
      MAX(T1."ItemName")                    AS "ItemName",
      T1."ItmsGrpCod"                       AS "ItemGroupCode",
      MAX(G."ItmsGrpNam")                   AS "ItemGroupName",
      MAX(T1."U_Color")                     AS "U_Color",
      MAX(T1."U_Condition")                 AS "U_Condition",
      MAX(T1."U_Model")                     AS "U_Model",
      MAX(T1."U_DeviceType")                AS "U_DeviceType",
      MAX(T1."U_Memory")                    AS "U_Memory",
      MAX(T1."U_Sim_type")                  AS "U_Sim_type",
      MAX(T1."U_PROD_CONDITION")            AS "U_PROD_CONDITION",
      MAX(T2."WhsName")                     AS "WhsName",
      ${salePriceExpression}                AS "SalePrice",
      ${purchasePriceExpression}            AS "PurchasePrice"
    ${baseFrom}
    GROUP BY
      T0."ItemCode",
      T1."ItmsGrpCod"${warehouseGroupColumns}
      ${isIMEI ? `, R."DistNumber"` : ''}
    ORDER BY ${orderByClauses
      .map((clause) => (clause === `MAX(PR."Price") DESC` ? `${salePriceExpression} DESC` : clause))
      .join(', ')}
    LIMIT ${limit}
    OFFSET ${offset}
`;

    const countSql = `
    SELECT COUNT(DISTINCT ${isIMEI ? `R."DistNumber"` : warehouseDistinctExpr}) AS "total"
    ${baseFrom}
`;

    const searchMode = isIMEI
      ? 'imei'
      : parsedSearch?.model
        ? 'structured_model'
        : search
          ? 'generic'
          : 'none';
    const deviceTypeResolution = parsedSearch?.model
      ? parsedSearch.deviceType
        ? `exact:${parsedSearch.deviceType}`
        : 'blank_base_variant_only'
      : null;
    const cachePayload = this.buildItemsCachePayload({
      search,
      filters,
      limit,
      offset,
      whsCode,
      storeName,
      includeZeroOnHand,
      groupByWarehouse,
    });

    return this.cachedSapQuery(
      'catalog:items',
      cachePayload,
      async () => {
        try {
          this.logger.debug('📦 [SAP] getItems search analysis', {
            search: search || null,
            searchMode,
            parsedSearch: parsedSearch
              ? {
                  normalizedSearch: parsedSearch.normalizedSearch,
                  model: parsedSearch.model || null,
                  deviceType: parsedSearch.deviceType ?? null,
                  residualSearch: parsedSearch.residualSearch || null,
                  condition: parsedSearch.condition || null,
                }
              : null,
            deviceTypeResolution,
            filters,
            whsCode: whsCode || null,
            storeName: storeName || null,
            includeZeroOnHand,
            groupByWarehouse,
            limit,
            offset,
          });
          this.logger.info(`📦 [SAP] getItems query executed (search=${search})`);
          const [data, totalResult] = await Promise.all([
            this.hana.executeOnce<ISapItem>(dataSql),
            this.hana.executeOnce<{ total: number }>(countSql),
          ]);

          const total = Number(totalResult[0]?.total || 0);

          this.logger.info('📦 [SAP] getItems query completed', {
            search: search || null,
            searchMode,
            deviceTypeResolution,
            total,
            returnedRows: data.length,
            sampleItems: data.slice(0, 3).map((item) => ({
              itemCode: item.ItemCode,
              itemName: item.ItemName,
              whsCode: item.WhsCode,
              whsName: item.WhsName,
              onHand: item.OnHand,
              model: item.U_Model || null,
              deviceType: item.U_DeviceType || null,
              memory: item.U_Memory || null,
            })),
          });

          return {
            data,
            total,
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error('❌ [SAP] getItems failed', message);
          throw new Error(`SAP query failed (getItems)`);
        }
      },
      {
        shouldUseCached: (result) => this.hasValuableItemsResult(result),
        shouldCache: (result) => this.hasValuableItemsResult(result),
      },
    );
  }
}
