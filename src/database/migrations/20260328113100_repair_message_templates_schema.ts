import type { Knex } from 'knex';

const MESSAGE_TEMPLATE_TYPE = 'message_template_type';

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

const ensureMessageTemplatesTable = async (knex: Knex): Promise<void> => {
  const hasTable = await knex.schema.hasTable('message_templates');

  if (!hasTable) {
    await knex.schema.createTable('message_templates', (table) => {
      table.bigIncrements('id').primary();
      table.string('template_key', 120).notNullable().unique();
      table
        .specificType('template_type', MESSAGE_TEMPLATE_TYPE)
        .notNullable();
      table.string('title', 255).notNullable();
      table.text('content_uz').notNullable();
      table.text('content_ru').notNullable();
      table.string('channel', 50).notNullable().defaultTo('telegram_bot');
      table.boolean('is_active').notNullable().defaultTo(true);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });

    return;
  }

  if (!(await knex.schema.hasColumn('message_templates', 'template_key'))) {
    await knex.schema.alterTable('message_templates', (table) => {
      table.string('template_key', 120).notNullable().defaultTo('');
    });
  }

  if (!(await knex.schema.hasColumn('message_templates', 'template_type'))) {
    await knex.schema.alterTable('message_templates', (table) => {
      table
        .specificType('template_type', MESSAGE_TEMPLATE_TYPE)
        .notNullable()
        .defaultTo('store_visit');
    });
  }

  if (!(await knex.schema.hasColumn('message_templates', 'title'))) {
    await knex.schema.alterTable('message_templates', (table) => {
      table.string('title', 255).notNullable().defaultTo('');
    });
  }

  if (!(await knex.schema.hasColumn('message_templates', 'channel'))) {
    await knex.schema.alterTable('message_templates', (table) => {
      table.string('channel', 50).notNullable().defaultTo('telegram_bot');
    });
  }

  if (!(await knex.schema.hasColumn('message_templates', 'is_active'))) {
    await knex.schema.alterTable('message_templates', (table) => {
      table.boolean('is_active').notNullable().defaultTo(true);
    });
  }

  if (!(await knex.schema.hasColumn('message_templates', 'created_at'))) {
    await knex.schema.alterTable('message_templates', (table) => {
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasColumn('message_templates', 'updated_at'))) {
    await knex.schema.alterTable('message_templates', (table) => {
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }
};

const backfillMessageTemplates = async (knex: Knex): Promise<void> => {
  await knex('message_templates')
    .whereNull('template_key')
    .orWhere('template_key', '')
    .update({
      template_key: knex.raw(`'legacy-' || id::text`),
    });

  await knex('message_templates')
    .whereNull('title')
    .orWhere('title', '')
    .update({
      title: knex.raw(`LEFT(COALESCE(NULLIF(content_uz, ''), 'Legacy template ' || id::text), 255)`),
    });

  await knex('message_templates')
    .whereNull('template_type')
    .update({
      template_type: knex.raw(`'store_visit'::${MESSAGE_TEMPLATE_TYPE}`),
    });

  await knex('message_templates')
    .whereNull('channel')
    .orWhere('channel', '')
    .update({
      channel: 'telegram_bot',
    });

  await knex('message_templates')
    .whereNull('is_active')
    .update({
      is_active: true,
    });
};

export async function up(knex: Knex): Promise<void> {
  await ensureEnum(knex, MESSAGE_TEMPLATE_TYPE, [
    'store_visit',
    'purchase',
    'referral',
    'payment_reminder_d2',
    'payment_reminder_d1',
    'payment_reminder_d0',
    'payment_paid_on_time',
    'payment_overdue',
    'payment_paid_late',
    'winner_notification',
  ]);

  await ensureMessageTemplatesTable(knex);
  await backfillMessageTemplates(knex);

  await knex.raw(
    'CREATE UNIQUE INDEX IF NOT EXISTS "message_templates_template_key_unique" ON "message_templates" ("template_key")',
  );
  await knex.raw(
    'CREATE INDEX IF NOT EXISTS "message_templates_template_type_index" ON "message_templates" ("template_type")',
  );
  await knex.raw(
    'CREATE INDEX IF NOT EXISTS "message_templates_is_active_index" ON "message_templates" ("is_active")',
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS "message_templates_is_active_index"');
  await knex.raw('DROP INDEX IF EXISTS "message_templates_template_type_index"');
  await knex.raw('DROP INDEX IF EXISTS "message_templates_template_key_unique"');
}
