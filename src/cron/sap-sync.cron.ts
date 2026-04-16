import cron from 'node-cron';
import { logger } from '../utils/logger';
import { UserService } from '../services/user.service';
import { SapService } from '../sap/sap-hana.service';
import { HanaService } from '../sap/hana.service';
import { normalizeUzPhone } from '../utils/uz-phone.util';
import {
  isSapBusinessPartnerAdmin,
  selectPreferredSapBusinessPartner,
} from '../utils/sap-business-partner.util';

export class SapSyncCron {
  private static readonly logger = logger;
  private static readonly sapService = new SapService(new HanaService());

  static init() {
    const schedule = process.env.SAP_SYNC_CRON_SCHEDULE || '0 0 * * *';
    
    this.logger.info(`🕐 [CRON] SAP sync job scheduled: ${schedule}`);

    cron.schedule(schedule, async () => {
      try {
        await this.syncUsers();
      } catch (error) {
        this.logger.error('❌ [CRON] SAP sync job failed', error);
      }
    });
  }

  private static async syncUsers() {
    this.logger.info('📦 [SAP-SYNC] Starting user sync job...');

    // 1. Get all users without SAP card code
    const users = await UserService.getUsersWithoutSapCardCode();
    
    if (users.length === 0) {
      this.logger.info('📦 [SAP-SYNC] No users to sync.');
      return;
    }

    this.logger.info(`📦 [SAP-SYNC] Found ${users.length} users without SAP card code`);

    // 2. Collect and normalize phone numbers
    const validPhones: string[] = [];
    const userMap = new Map<string, typeof users[0]>();

    for (const user of users) {
      if (!user.phone_number) continue;
      try {
        const { full } = normalizeUzPhone(user.phone_number);
        validPhones.push(full);
        userMap.set(full, user);
      } catch {
        this.logger.warn(`⚠️ [SAP-SYNC] Skipping invalid phone number for user ${user.telegram_id}: ${user.phone_number}`);
      }
    }

    if (validPhones.length === 0) {
      this.logger.info('📦 [SAP-SYNC] No valid phone numbers to query.');
      return;
    }

    // 3. Batch query SAP
    const sapPartners = await this.sapService.getBusinessPartnersByPhones(validPhones);
    
    this.logger.info(`📦 [SAP-SYNC] SAP returned ${sapPartners.length} business partners`);

    if (sapPartners.length === 0) {
      this.logger.info('📦 [SAP-SYNC] No matches found in SAP.');
      return;
    }

    // 4. Update users
    let updatedCount = 0;

    for (const user of users) {
      if (!user.phone_number) {
        continue;
      }

      let userPhoneFull: string;

      try {
        userPhoneFull = normalizeUzPhone(user.phone_number).full;
      } catch {
        this.logger.warn(`⚠️ [SAP-SYNC] Skipping invalid phone number for user ${user.telegram_id}: ${user.phone_number}`);
        continue;
      }

      const matchingPartners = sapPartners.filter((partner) => {
        const partnerPhone1 = partner.Phone1 ? normalizeUzPhone(partner.Phone1).full : null;
        const partnerPhone2 = partner.Phone2 ? normalizeUzPhone(partner.Phone2).full : null;

        return userPhoneFull === partnerPhone1 || userPhoneFull === partnerPhone2;
      });

      const selectedPartner = selectPreferredSapBusinessPartner(matchingPartners);
      if (!selectedPartner) {
        continue;
      }

      try {
        const isAdmin = isSapBusinessPartnerAdmin(selectedPartner);
        this.logger.info(`📦 [SAP-SYNC] Updating user ${user.telegram_id} (CardCode: ${selectedPartner.CardCode}, isAdmin: ${isAdmin})`);
        await UserService.syncUserWithSap(user.telegram_id, selectedPartner.CardCode, isAdmin);
        updatedCount++;
      } catch (error) {
        this.logger.error(`❌ [SAP-SYNC] Failed to update user ${user.telegram_id}`, error);
      }
    }

    this.logger.info(`📦 [SAP-SYNC] Sync complete: ${updatedCount} users updated.`);
  }
}
