import type { Knex } from 'knex';

const TABLE_NAME = 'faqs';
const FAQ_STATUS = ['draft', 'published'];
const FAQ_WORKFLOW_STAGE = ['awaiting_answer', 'completed'];

export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS vector;');

  const hasTable = await knex.schema.hasTable(TABLE_NAME);
  if (!hasTable) {
    await knex.schema.createTable(TABLE_NAME, (table) => {
      table.bigIncrements('id').primary();
      table.text('question_uz').notNullable();
      table.text('question_ru').notNullable();
      table.text('question_en').notNullable();
      table.text('answer_uz').notNullable().defaultTo('');
      table.text('answer_ru').notNullable().defaultTo('');
      table.text('answer_en').notNullable().defaultTo('');
      table
        .enu('status', FAQ_STATUS, {
          useNative: true,
          enumName: 'faq_status',
        })
        .notNullable()
        .defaultTo('draft');
      table.bigInteger('created_by_admin_telegram_id').notNullable();
      table.bigInteger('locked_by_admin_telegram_id').nullable();
      table
        .enu('workflow_stage', FAQ_WORKFLOW_STAGE, {
          useNative: true,
          enumName: 'faq_workflow_stage',
        })
        .nullable()
        .defaultTo('awaiting_answer');
      table.specificType('vector_embedding', 'vector(1536)').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.index(['status']);
      table.index(['created_by_admin_telegram_id']);
      table.index(['locked_by_admin_telegram_id']);
      table.index(['workflow_stage']);
    });
  }

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_faqs_embedding_hnsw
    ON ${TABLE_NAME}
    USING hnsw (vector_embedding vector_cosine_ops);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_faqs_embedding_hnsw;');
  await knex.schema.dropTableIfExists(TABLE_NAME);
  await knex.raw('DROP TYPE IF EXISTS faq_workflow_stage;');
  await knex.raw('DROP TYPE IF EXISTS faq_status;');
}
