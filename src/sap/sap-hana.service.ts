import { HanaService } from './hana.service';
import { logger } from '../utils/logger';
import { IBusinessPartner } from '../interfaces/business-partner.interface';
import { IPurchaseInstallment } from '../interfaces/purchase.interface';
import { loadSQL } from '../utils/sql-loader.utils';
import { normalizeUzPhone } from '../utils/uz-phone.util';
import { ISapItem } from '../interfaces/item.interface';

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

export class SapService {
  private readonly logger = logger;
  private readonly schema: string = process.env.SAP_SCHEMA || 'PROBOX_PROD_3';

  constructor(private readonly hana: HanaService) {}

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

    this.logger.info(`📦 [SAP] Fetching business partner by phone (full=${full})`);

    try {
      return await this.hana.executeOnce<IBusinessPartner>(sql, [full, full]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      this.logger.error('❌ [SAP] getBusinessPartnerByPhone failed', message);

      throw new Error(`SAP query failed (getBusinessPartnerByPhone)`);
    }
  }

  async getBusinessPartnerByJshshir(jshshir: string): Promise<IBusinessPartner[]> {
    const sql = loadSQL('sap/queries/get-business-partner-by-jshshir.sql').replace(
      /{{schema}}/g,
      this.schema,
    );

    const normalizedJshshir = jshshir.trim();

    this.logger.info(`📦 [SAP] Fetching business partner by jshshir: ${normalizedJshshir}`);

    try {
      return await this.hana.executeOnce<IBusinessPartner>(sql, [normalizedJshshir]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      this.logger.error('❌ [SAP] getBusinessPartnerByJshshir failed', message);

      throw new Error(`SAP query failed (getBusinessPartnerByJshshir)`);
    }
  }

  async getBPpurchasesByCardCode(cardCode: string): Promise<IPurchaseInstallment[]> {
    const sql = loadSQL('sap/queries/get-bp-purchases.sql').replace(/{{schema}}/g, this.schema);

    this.logger.info(`📦 [SAP] Fetching purchases for CardCode: ${cardCode}`);

    try {
      return await this.hana.executeOnce<IPurchaseInstallment>(sql, [cardCode]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      this.logger.error('❌ [SAP] getBPpurchasesByCardCode failed', message);

      throw new Error(`SAP query failed (getBPpurchasesByCardCode)`);
    }
  }

  async getBusinessPartnersByPhones(phones: string[]): Promise<IBusinessPartner[]> {
    if (phones.length === 0) return [];

    const normalizedPhones = phones.map((p) => normalizeUzPhone(p).full);
    const placeholders = normalizedPhones.map(() => '?').join(',');

    const sql = loadSQL('sap/queries/get-business-partners-batch.sql')
      .replace(/{{schema}}/g, this.schema)
      .replace(/{{phones}}/g, placeholders);

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
  }

  async getBatchPurchasesByCardCodes(cardCodes: string[]): Promise<IPurchaseInstallment[]> {
    if (cardCodes.length === 0) return [];

    const placeholders = cardCodes.map(() => '?').join(',');
    const sql = loadSQL('sap/queries/get-bp-purchases-batch.sql')
      .replace(/{{schema}}/g, this.schema)
      .replace(/{{cardCodes}}/g, placeholders);

    this.logger.info(`📦 [SAP] Fetching batch purchases (${cardCodes.length} card codes)`);

    try {
      return await this.hana.executeOnce<IPurchaseInstallment>(sql, cardCodes);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      this.logger.error('❌ [SAP] getBatchPurchasesByCardCodes failed', message);

      throw new Error(`SAP query failed (getBatchPurchasesByCardCodes)`);
    }
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
    this.logger.info(`📦 [SAP] Fetching latest exchange rate for currency: ${normalizedCurrency}`);

    try {
      const rows = await this.hana.executeOnce<SapCurrencyRateRow>(sql, [
        normalizedCurrency,
      ]);
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
        newDevices: Array.from(grouped.newDevices).sort((left, right) => left.localeCompare(right)),
        usedDevices: Array.from(grouped.usedDevices).sort((left, right) => left.localeCompare(right)),
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error('❌ [SAP] getAvailableDeviceNames failed', message);
      throw new Error('SAP query failed (getAvailableDeviceNames)');
    }
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

    whereClauses.push(`COALESCE(PR."Price", 0) > 0`);

    let imeiJoin = '';
    let imeiWhere = '';

    const isIMEI = Boolean(search && /^\d+$/.test(search) && search.length >= 4);

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
          whereClauses.push(this.buildNormalizedEquals('T1."U_DeviceType"', parsedSearch.deviceType));
        } else {
          whereClauses.push(this.buildBlankDeviceTypeClause('T1."U_DeviceType"'));
        }

        if (parsedSearch.condition) {
          whereClauses.push(this.buildNormalizedEquals('T1."U_PROD_CONDITION"', parsedSearch.condition));
        }

        if (parsedSearch.residualSearch) {
          whereClauses.push(this.buildGenericItemSearchClause(parsedSearch.residualSearch));
        }
      } else {
        if (parsedSearch?.condition) {
          whereClauses.push(this.buildNormalizedEquals('T1."U_PROD_CONDITION"', parsedSearch.condition));
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
      whereClauses.push(`T1."ItmsGrpCod" = '${this.escapeSqlValue(String(filters.itemGroupCode))}'`);
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

    const baseFrom = `
    FROM ${db}."OITW" T0
      INNER JOIN ${db}."OITM" T1 ON T0."ItemCode" = T1."ItemCode"
      INNER JOIN ${db}."OWHS" T2 ON T0."WhsCode" = T2."WhsCode"
      INNER JOIN ${db}."OITB" G ON G."ItmsGrpCod" = T1."ItmsGrpCod"
      ${imeiJoin}
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
      MAX(PR."Price")                       AS "SalePrice",
      ${isIMEI ? `MAX(R."CostTotal")` : `NULL`} AS "PurchasePrice"
    ${baseFrom}
    GROUP BY
      T0."ItemCode",
      T1."ItmsGrpCod"${warehouseGroupColumns}
      ${isIMEI ? `, R."DistNumber"` : ''}
    ORDER BY ${orderByClauses.join(', ')}
    LIMIT ${limit}
    OFFSET ${offset}
`;

    const countSql = `
    SELECT COUNT(DISTINCT ${isIMEI ? `R."DistNumber"` : warehouseDistinctExpr}) AS "total"
    ${baseFrom}
`;

    const searchMode = isIMEI ? 'imei' : parsedSearch?.model ? 'structured_model' : search ? 'generic' : 'none';
    const deviceTypeResolution = parsedSearch?.model
      ? parsedSearch.deviceType
        ? `exact:${parsedSearch.deviceType}`
        : 'blank_base_variant_only'
      : null;

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
  }
}
