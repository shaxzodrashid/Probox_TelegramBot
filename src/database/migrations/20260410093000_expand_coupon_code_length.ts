import type { Knex } from 'knex';

const TABLE_NAME = 'coupons';
const COLUMN_NAME = 'code';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TABLE_NAME);
  if (!hasTable) {
    return;
  }

  await knex.raw(`ALTER TABLE "${TABLE_NAME}" ALTER COLUMN "${COLUMN_NAME}" TYPE VARCHAR(10)`);
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TABLE_NAME);
  if (!hasTable) {
    return;
  }

  await knex.raw(`ALTER TABLE "${TABLE_NAME}" ALTER COLUMN "${COLUMN_NAME}" TYPE VARCHAR(7)`);
}
