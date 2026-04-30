import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('scheduled_broadcasts', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('admin_telegram_id').notNullable();
    table.text('message_text');
    table.string('photo_file_id', 255);
    table.string('target_type', 20).notNullable();
    table.bigInteger('target_user_id');
    table.smallint('week_day').notNullable();
    table.string('scheduled_time', 5).notNullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.string('last_run_date', 10);
    table.timestamp('last_run_at');
    table.bigInteger('last_broadcast_message_id');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index(['is_active', 'week_day', 'scheduled_time']);
    table.index('target_user_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('scheduled_broadcasts');
}
