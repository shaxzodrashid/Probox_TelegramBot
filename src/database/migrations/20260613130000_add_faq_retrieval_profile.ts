import type { Knex } from 'knex';

const TABLE_NAME = 'faqs';

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TABLE_NAME, 'retrieval_profile');
  if (hasColumn) {
    return;
  }

  await knex.schema.alterTable(TABLE_NAME, (table) => {
    table.jsonb('retrieval_profile').notNullable().defaultTo('{}');
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TABLE_NAME, 'retrieval_profile');
  if (!hasColumn) {
    return;
  }

  await knex.schema.alterTable(TABLE_NAME, (table) => {
    table.dropColumn('retrieval_profile');
  });
}
