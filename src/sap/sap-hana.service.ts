import { HanaService } from './hana.service';
import { logger } from '../utils/logger';
import { IBusinessPartner } from '../interfaces/business-partner.interface';
import { loadSQL } from '../utils/sql-loader.utils';
import { normalizeUzPhone } from '../utils/uz-phone.util'

export class SapService {
  private readonly logger = logger;
  private readonly schema: string = process.env.SAP_SCHEMA || 'ALTITUDE_DB';

  constructor(private readonly hana: HanaService) {}

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
}
