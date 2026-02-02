import { HanaService } from './hana.service';
import { logger } from '../utils/logger';
import { IBusinessPartner } from '../interfaces/business-partner.interface';
import { IPurchaseInstallment } from '../interfaces/purchase.interface';
import { loadSQL } from '../utils/sql-loader.utils';
import { normalizeUzPhone } from '../utils/uz-phone.util'

export class SapService {
  private readonly logger = logger;
  private readonly schema: string = process.env.SAP_SCHEMA || 'ALTITUDE_DB';

  constructor(private readonly hana: HanaService) { }

  async getBusinessPartnerByPhone(phone: string): Promise<IBusinessPartner[]> {
    const sql = loadSQL('sap/queries/get-business-partner.sql').replace(
      /{{schema}}/g,
      this.schema,
    );

    const { last9 } = normalizeUzPhone(phone);

    this.logger.info(`📦 [SAP] Fetching business partner by phone (last9=${last9})`);

    try {
      return await this.hana.executeOnce<IBusinessPartner>(sql, [last9, last9]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      this.logger.error('❌ [SAP] getBusinessPartnerByPhone failed', message);

      throw new Error(`SAP query failed (getBusinessPartnerByPhone)`);
    }
  }

  async getBPpurchasesByCardCode(cardCode: string): Promise<IPurchaseInstallment[]> {
    const sql = loadSQL('sap/queries/get-bp-purchases.sql').replace(
      /{{schema}}/g,
      this.schema,
    );

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

    const normalizedPhones = phones.map((p) => normalizeUzPhone(p).last9);
    const placeholders = normalizedPhones.map(() => '?').join(',');

    const sql = loadSQL('sap/queries/get-business-partners-batch.sql')
      .replace(/{{schema}}/g, this.schema)
      .replace(/{{phones}}/g, placeholders);

    this.logger.info(`📦 [SAP] Fetching batch business partners (${normalizedPhones.length} phones)`);

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
}
