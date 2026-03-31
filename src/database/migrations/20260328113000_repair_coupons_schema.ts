import type { Knex } from 'knex';

const COUPON_SOURCE_TYPE = 'coupon_source_type';
const COUPON_STATUS_TYPE = 'coupon_status';

const ensureEnum = async (knex: Knex, enumName: string, values: string[]): Promise<void> => {
  const escapedValues = values.map((value) => `'${value}'`).join(', ');
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = '${enumName}'
      ) THEN
        CREATE TYPE "${enumName}" AS ENUM (${escapedValues});
      END IF;
    END
    $$;
  `);
};

const ensureConstraint = async (
  knex: Knex,
  tableName: string,
  constraintName: string,
  sql: string,
): Promise<void> => {
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = '${constraintName}'
      ) THEN
        ALTER TABLE "${tableName}" ADD CONSTRAINT "${constraintName}" ${sql};
      END IF;
    END
    $$;
  `);
};

const ensureCouponsTable = async (knex: Knex): Promise<void> => {
  const hasTable = await knex.schema.hasTable('coupons');

  if (!hasTable) {
    await knex.schema.createTable('coupons', (table) => {
      table.bigIncrements('id').primary();
      table.string('code', 7).notNullable().unique();
      table.bigInteger('promotion_id').nullable();
      table
        .specificType('source_type', COUPON_SOURCE_TYPE)
        .notNullable();
      table
        .specificType('status', COUPON_STATUS_TYPE)
        .notNullable()
        .defaultTo('active');
      table.string('issued_phone_snapshot', 20).notNullable();
      table.timestamp('expires_at').notNullable();
      table.timestamp('won_at').nullable();
      table.boolean('is_active').notNullable().defaultTo(true);
      table.timestamps(true, true);
    });

    return;
  }

  if (!(await knex.schema.hasColumn('coupons', 'promotion_id'))) {
    await knex.schema.alterTable('coupons', (table) => {
      table.bigInteger('promotion_id').nullable();
    });
  }

  if (!(await knex.schema.hasColumn('coupons', 'source_type'))) {
    await knex.schema.alterTable('coupons', (table) => {
      table
        .specificType('source_type', COUPON_SOURCE_TYPE)
        .notNullable()
        .defaultTo('store_visit');
    });
  }

  if (!(await knex.schema.hasColumn('coupons', 'status'))) {
    await knex.schema.alterTable('coupons', (table) => {
      table
        .specificType('status', COUPON_STATUS_TYPE)
        .notNullable()
        .defaultTo('active');
    });
  }

  if (!(await knex.schema.hasColumn('coupons', 'issued_phone_snapshot'))) {
    await knex.schema.alterTable('coupons', (table) => {
      table.string('issued_phone_snapshot', 20).notNullable().defaultTo('');
    });
  }

  if (!(await knex.schema.hasColumn('coupons', 'expires_at'))) {
    await knex.schema.alterTable('coupons', (table) => {
      table.timestamp('expires_at').notNullable().defaultTo(knex.raw("now() + interval '30 days'"));
    });
  }

  if (!(await knex.schema.hasColumn('coupons', 'won_at'))) {
    await knex.schema.alterTable('coupons', (table) => {
      table.timestamp('won_at').nullable();
    });
  }

  if (!(await knex.schema.hasColumn('coupons', 'is_active'))) {
    await knex.schema.alterTable('coupons', (table) => {
      table.boolean('is_active').notNullable().defaultTo(true);
    });
  }

  if (!(await knex.schema.hasColumn('coupons', 'created_at'))) {
    await knex.schema.alterTable('coupons', (table) => {
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasColumn('coupons', 'updated_at'))) {
    await knex.schema.alterTable('coupons', (table) => {
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });
  }
};

export async function up(knex: Knex): Promise<void> {
  await ensureEnum(knex, COUPON_SOURCE_TYPE, ['store_visit', 'purchase', 'referral', 'payment_on_time']);
  await ensureEnum(knex, COUPON_STATUS_TYPE, ['active', 'won', 'expired']);
  await ensureCouponsTable(knex);

  await ensureConstraint(
    knex,
    'coupons',
    'coupons_promotion_id_foreign',
    'FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE SET NULL',
  );

  await knex.raw('CREATE UNIQUE INDEX IF NOT EXISTS "coupons_code_unique" ON "coupons" ("code")');
  await knex.raw('CREATE INDEX IF NOT EXISTS "coupons_promotion_id_index" ON "coupons" ("promotion_id")');
  await knex.raw('CREATE INDEX IF NOT EXISTS "coupons_status_index" ON "coupons" ("status")');
  await knex.raw('CREATE INDEX IF NOT EXISTS "coupons_is_active_index" ON "coupons" ("is_active")');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS "coupons_is_active_index"');
  await knex.raw('DROP INDEX IF EXISTS "coupons_status_index"');
  await knex.raw('DROP INDEX IF EXISTS "coupons_promotion_id_index"');
}
