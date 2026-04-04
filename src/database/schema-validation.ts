import { logger } from '../utils/logger';
import db from './database';

const REQUIRED_COLUMNS = {
  coupons: [
    'id',
    'code',
    'promotion_id',
    'registration_event_id',
    'source_type',
    'status',
    'issued_phone_snapshot',
    'lead_id',
    'customer_full_name',
    'expires_at',
    'won_at',
    'is_active',
    'created_at',
    'updated_at',
  ],
  message_templates: [
    'id',
    'template_key',
    'template_type',
    'title',
    'content_uz',
    'content_ru',
    'channel',
    'is_active',
    'created_at',
    'updated_at',
  ],
  promotions: [
    'id',
    'slug',
    'title_uz',
    'title_ru',
    'about_uz',
    'about_ru',
    'is_active',
    'created_at',
    'updated_at',
  ],
  coupon_registration_events: [
    'id',
    'user_id',
    'promotion_id',
    'phone_number',
    'lead_id',
    'customer_full_name',
    'status',
    'product_name',
    'referred_phone_number',
    'processed_at',
    'created_at',
    'updated_at',
  ],
  referrals: [
    'id',
    'referrer_user_id',
    'created_from_event_id',
    'referrer_phone_snapshot',
    'referrer_full_name_snapshot',
    'referred_phone_number',
    'created_at',
    'updated_at',
  ],
  referral_reward_logs: [
    'id',
    'referral_id',
    'registration_event_id',
    'rewarded_coupon_count',
    'created_at',
    'updated_at',
  ],
  faqs: [
    'id',
    'question_uz',
    'question_ru',
    'question_en',
    'answer_uz',
    'answer_ru',
    'answer_en',
    'status',
    'created_by_admin_telegram_id',
    'locked_by_admin_telegram_id',
    'workflow_stage',
    'vector_embedding',
    'created_at',
    'updated_at',
  ],
} as const;

const getMissingColumns = async (
  tableName: keyof typeof REQUIRED_COLUMNS,
): Promise<string[]> => {
  const missing: string[] = [];
  logger.info(`Validating columns for table: ${tableName}...`);

  const tableExists = await db.schema.hasTable(tableName);
  if (!tableExists) {
    logger.warn(`Missing table: ${tableName}`);
    return [...REQUIRED_COLUMNS[tableName]];
  }
  
  for (const columnName of REQUIRED_COLUMNS[tableName]) {
    try {
      const exists = await db.schema.hasColumn(tableName, columnName);
      if (!exists) {
        missing.push(columnName);
        logger.warn(`Missing column: ${tableName}.${columnName}`);
      }
    } catch (err) {
      logger.error(`Error checking column ${tableName}.${columnName}:`, err);
      throw err;
    }
  }

  return missing;
};

export const validateDatabaseSchema = async (): Promise<void> => {
  logger.info('Starting database schema validation...');
  const [completedMigrations, pendingMigrations] = await db.migrate.list();
  logger.info(`Found ${completedMigrations.length} completed and ${pendingMigrations.length} pending migrations.`);
  const missingCouponColumns = await getMissingColumns('coupons');
  const missingTemplateColumns = await getMissingColumns('message_templates');
  const missingPromotionColumns = await getMissingColumns('promotions');
  const missingCouponEventColumns = await getMissingColumns('coupon_registration_events');
  const missingReferralColumns = await getMissingColumns('referrals');
  const missingReferralRewardLogColumns = await getMissingColumns('referral_reward_logs');
  const missingFaqColumns = await getMissingColumns('faqs');

  const issues: string[] = [];
  const pendingMigrationNames = pendingMigrations.map((migration: { file?: string; name?: string } | string) =>
    typeof migration === 'string' ? migration : migration.file || migration.name || 'unknown-migration',
  );

  if (pendingMigrations.length > 0) {
    issues.push(
      `Pending migrations: ${pendingMigrationNames.join(', ')}`,
    );
  }

  if (completedMigrations.length === 0) {
    issues.push('No completed migrations recorded in knex_migrations.');
  }

  if (missingCouponColumns.length > 0) {
    issues.push(`Missing columns in coupons: ${missingCouponColumns.join(', ')}`);
  }

  if (missingTemplateColumns.length > 0) {
    issues.push(`Missing columns in message_templates: ${missingTemplateColumns.join(', ')}`);
  }

  if (missingPromotionColumns.length > 0) {
    issues.push(`Missing columns in promotions: ${missingPromotionColumns.join(', ')}`);
  }

  if (missingCouponEventColumns.length > 0) {
    issues.push(`Missing columns in coupon_registration_events: ${missingCouponEventColumns.join(', ')}`);
  }

  if (missingReferralColumns.length > 0) {
    issues.push(`Missing columns in referrals: ${missingReferralColumns.join(', ')}`);
  }

  if (missingReferralRewardLogColumns.length > 0) {
    issues.push(`Missing columns in referral_reward_logs: ${missingReferralRewardLogColumns.join(', ')}`);
  }

  if (missingFaqColumns.length > 0) {
    issues.push(`Missing columns in faqs: ${missingFaqColumns.join(', ')}`);
  }

  if (issues.length > 0) {
    throw new Error(
      `Database schema validation failed. Run \`npm run db:migrate\` and retry. ${issues.join(' | ')}`,
    );
  }
};
