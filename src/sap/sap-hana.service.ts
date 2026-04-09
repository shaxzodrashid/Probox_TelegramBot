import { HanaService } from './hana.service';
import { logger } from '../utils/logger';
import { IBusinessPartner } from '../interfaces/business-partner.interface';
import { IPurchaseInstallment } from '../interfaces/purchase.interface';
import { loadSQL } from '../utils/sql-loader.utils';
import { normalizeUzPhone } from '../utils/uz-phone.util';
import { ISapItem } from '../interfaces/item.interface';

export class SapService {
  private readonly logger = logger;
  private readonly schema: string = process.env.SAP_SCHEMA || 'ALTITUDE_DB';

  constructor(private readonly hana: HanaService) {}

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

  async getLatestExchangeRate(currency: string = 'UZS'): Promise<number | null> {
    const sql = loadSQL('sap/queries/get-currency-rate.sql').replace(/{{schema}}/g, this.schema);

    const normalizedCurrency = currency.trim().toUpperCase();
    this.logger.info(`📦 [SAP] Fetching latest exchange rate for currency: ${normalizedCurrency}`);

    try {
      const rows = await this.hana.executeOnce<{ Rate: number | string }>(sql, [
        normalizedCurrency,
      ]);
      const rate = rows[0]?.Rate;

      if (rate === undefined || rate === null) {
        return null;
      }

      const numericRate = typeof rate === 'string' ? parseFloat(rate) : rate;
      return Number.isFinite(numericRate) ? numericRate : null;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      this.logger.error('❌ [SAP] getLatestExchangeRate failed', message);

      throw new Error(`SAP query failed (getLatestExchangeRate)`);
    }
  }

  async getItems({
    search,
    filters = {},
    limit = 50,
    offset = 0,
    whsCode,
    includeZeroOnHand = false,
  }: {
    search?: string;
    filters?: any;
    limit?: number;
    offset?: number;
    whsCode?: string;
    includeZeroOnHand?: boolean;
  }): Promise<{ data: ISapItem[]; total: number }> {
    const db = this.schema;
    let whereClauses = ['1=1'];
    if (!includeZeroOnHand) {
      whereClauses.push(`T0."OnHand" > 0`);
    }

    let imeiJoin = '';
    let imeiWhere = '';

    const isIMEI = search && /^\d+$/.test(search) && search.length >= 4;

    if (whsCode) whereClauses.push(`T0."WhsCode" = '${whsCode}'`);

    if (isIMEI) {
      const whsCondition = whsCode ? ` AND Q."WhsCode" = '${whsCode}'` : ``;

      imeiJoin = `
      LEFT JOIN ${db}."OSRN" R
        ON R."ItemCode" = T1."ItemCode"
      LEFT JOIN ${db}."OSRQ" Q
        ON Q."ItemCode" = R."ItemCode"
       AND Q."SysNumber" = R."SysNumber"
       ${whsCondition}
    `;

      imeiWhere = `
      AND R."DistNumber" LIKE '%${search}%'
      AND Q."Quantity" > 0
    `;
    } else if (search) {
      const s = search.toLowerCase();
      whereClauses.push(`
      (
        LOWER(T1."ItemCode") LIKE '%${s}%'
        OR LOWER(T1."ItemName") LIKE '%${s}%'
        OR LOWER(T1."U_Model") LIKE '%${s}%'
      )
    `);
    }

    if (filters.model) whereClauses.push(`T1."U_Model" = '${filters.model}'`);
    if (filters.deviceType) whereClauses.push(`T1."U_DeviceType" = '${filters.deviceType}'`);
    if (filters.memory) whereClauses.push(`T1."U_Memory" = '${filters.memory}'`);
    if (filters.simType) whereClauses.push(`T1."U_Sim_type" = '${filters.simType}'`);
    if (filters.condition) whereClauses.push(`T1."U_PROD_CONDITION" = '${filters.condition}'`);
    if (filters.color) whereClauses.push(`T1."U_Color" = '${filters.color}'`);

    if (filters.itemGroupCode) whereClauses.push(`T1."ItmsGrpCod" = '${filters.itemGroupCode}'`);

    const whereQuery = 'WHERE ' + whereClauses.join(' AND ') + imeiWhere;

    const imeiSelect = isIMEI ? `R."DistNumber" AS "IMEI",` : '';

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
      MAX(T0."WhsCode")                     AS "WhsCode",
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
      T1."ItmsGrpCod"
      ${isIMEI ? `, R."DistNumber"` : ''}
    ORDER BY MAX(T1."U_Model") DESC
    LIMIT ${limit}
    OFFSET ${offset}
`;

    const countSql = `
    SELECT COUNT(DISTINCT ${isIMEI ? `R."DistNumber"` : `T0."ItemCode"`}) AS "total"
    ${baseFrom}
`;

    try {
      this.logger.info(`📦 [SAP] getItems query executed (search=${search})`);
      const [data, totalResult] = await Promise.all([
        this.hana.executeOnce<ISapItem>(dataSql),
        this.hana.executeOnce<{ total: number }>(countSql),
      ]);

      return {
        data,
        total: (totalResult[0] as any)?.total || 0,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error('❌ [SAP] getItems failed', message);
      throw new Error(`SAP query failed (getItems)`);
    }
  }
}
