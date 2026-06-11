import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('scheduled_broadcasts', (table) => {
    table.string('schedule_type', 30).notNullable().defaultTo('weekly');
    table.jsonb('week_days');
    table.jsonb('month_days');
    table.string('scheduled_date', 10);
    table.string('start_date', 10);
  });

  await knex.raw(`
    UPDATE scheduled_broadcasts
    SET week_days = jsonb_build_array(week_day)
    WHERE week_days IS NULL
  `);

  await knex.schema.alterTable('scheduled_broadcasts', (table) => {
    table.smallint('week_day').nullable().alter();
    table.index(['is_active', 'scheduled_time', 'schedule_type'], 'scheduled_broadcasts_due_index');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    UPDATE scheduled_broadcasts
    SET week_day = COALESCE(week_day, (week_days->>0)::smallint, 1)
  `);

  await knex.raw('DROP INDEX IF EXISTS scheduled_broadcasts_due_index');

  await knex.schema.alterTable('scheduled_broadcasts', (table) => {
    table.smallint('week_day').notNullable().alter();
    table.dropColumn('schedule_type');
    table.dropColumn('week_days');
    table.dropColumn('month_days');
    table.dropColumn('scheduled_date');
    table.dropColumn('start_date');
  });
}
