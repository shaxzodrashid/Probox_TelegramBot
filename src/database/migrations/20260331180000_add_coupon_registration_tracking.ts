import type { Knex } from 'knex';

const COUPON_EVENT_UNIQUE = 'coupon_registration_events_phone_lead_status_unique';
const COUPON_EVENT_USER_INDEX = 'coupon_registration_events_user_id_index';
const REFERRAL_PAIR_UNIQUE = 'referrals_referrer_user_id_referred_phone_number_unique';
const REFERRAL_PHONE_INDEX = 'referrals_referred_phone_number_index';
const REFERRAL_EVENT_INDEX = 'referral_reward_logs_registration_event_id_index';
const COUPONS_EVENT_INDEX = 'coupons_registration_event_id_index';

export async function up(knex: Knex): Promise<void> {
  const hasEventsTable = await knex.schema.hasTable('coupon_registration_events');
  if (!hasEventsTable) {
    await knex.schema.createTable('coupon_registration_events', (table) => {
      table.bigIncrements('id').primary();
      table.bigInteger('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.bigInteger('promotion_id').nullable().references('id').inTable('promotions').onDelete('SET NULL');
      table.string('phone_number', 20).notNullable();
      table.string('lead_id', 255).notNullable();
      table.string('customer_full_name', 255).notNullable();
      table.string('status', 32).notNullable();
      table.string('product_name', 255).nullable();
      table.string('referred_phone_number', 20).nullable();
      table.timestamp('processed_at').notNullable().defaultTo(knex.fn.now());
      table.timestamps(true, true);

      table.unique(['phone_number', 'lead_id', 'status'], { indexName: COUPON_EVENT_UNIQUE });
      table.index(['user_id'], COUPON_EVENT_USER_INDEX);
    });
  }

  const hasReferralsTable = await knex.schema.hasTable('referrals');
  if (!hasReferralsTable) {
    await knex.schema.createTable('referrals', (table) => {
      table.bigIncrements('id').primary();
      table.bigInteger('referrer_user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.bigInteger('created_from_event_id').nullable().references('id').inTable('coupon_registration_events').onDelete('SET NULL');
      table.string('referrer_phone_snapshot', 20).nullable();
      table.string('referrer_full_name_snapshot', 255).nullable();
      table.string('referred_phone_number', 20).notNullable();
      table.timestamps(true, true);

      table.unique(['referrer_user_id', 'referred_phone_number'], { indexName: REFERRAL_PAIR_UNIQUE });
      table.index(['referred_phone_number'], REFERRAL_PHONE_INDEX);
    });
  }

  const hasReferralRewardLogsTable = await knex.schema.hasTable('referral_reward_logs');
  if (!hasReferralRewardLogsTable) {
    await knex.schema.createTable('referral_reward_logs', (table) => {
      table.bigIncrements('id').primary();
      table.bigInteger('referral_id').notNullable().references('id').inTable('referrals').onDelete('CASCADE');
      table.bigInteger('registration_event_id')
        .notNullable()
        .references('id')
        .inTable('coupon_registration_events')
        .onDelete('CASCADE');
      table.integer('rewarded_coupon_count').notNullable().defaultTo(0);
      table.timestamps(true, true);

      table.unique(['referral_id', 'registration_event_id']);
      table.index(['registration_event_id'], REFERRAL_EVENT_INDEX);
    });
  }

  if (!(await knex.schema.hasColumn('coupons', 'lead_id'))) {
    await knex.schema.alterTable('coupons', (table) => {
      table.string('lead_id', 255).nullable();
    });
  }

  if (!(await knex.schema.hasColumn('coupons', 'customer_full_name'))) {
    await knex.schema.alterTable('coupons', (table) => {
      table.string('customer_full_name', 255).nullable();
    });
  }

  if (!(await knex.schema.hasColumn('coupons', 'registration_event_id'))) {
    await knex.schema.alterTable('coupons', (table) => {
      table.bigInteger('registration_event_id').nullable();
    });
  }

  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'coupons_registration_event_id_foreign'
          AND table_name = 'coupons'
      ) THEN
        ALTER TABLE "coupons"
          ADD CONSTRAINT "coupons_registration_event_id_foreign"
          FOREIGN KEY ("registration_event_id")
          REFERENCES "coupon_registration_events"("id")
          ON DELETE SET NULL;
      END IF;
    END
    $$;
  `);

  await knex.raw(`CREATE INDEX IF NOT EXISTS "${COUPONS_EVENT_INDEX}" ON "coupons" ("registration_event_id")`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS "${COUPONS_EVENT_INDEX}"`);

  const hasCouponsTable = await knex.schema.hasTable('coupons');
  if (hasCouponsTable) {
    await knex.raw('ALTER TABLE "coupons" DROP CONSTRAINT IF EXISTS "coupons_registration_event_id_foreign"');

    if (await knex.schema.hasColumn('coupons', 'registration_event_id')) {
      await knex.schema.alterTable('coupons', (table) => {
        table.dropColumn('registration_event_id');
      });
    }

    if (await knex.schema.hasColumn('coupons', 'customer_full_name')) {
      await knex.schema.alterTable('coupons', (table) => {
        table.dropColumn('customer_full_name');
      });
    }

    if (await knex.schema.hasColumn('coupons', 'lead_id')) {
      await knex.schema.alterTable('coupons', (table) => {
        table.dropColumn('lead_id');
      });
    }
  }

  await knex.schema.dropTableIfExists('referral_reward_logs');
  await knex.schema.dropTableIfExists('referrals');
  await knex.schema.dropTableIfExists('coupon_registration_events');
}
