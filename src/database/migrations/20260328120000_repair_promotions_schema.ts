import type { Knex } from 'knex';

const ensurePromotionsTable = async (knex: Knex): Promise<void> => {
  const hasTable = await knex.schema.hasTable('promotions');

  if (!hasTable) {
    await knex.schema.createTable('promotions', (table) => {
      table.bigIncrements('id').primary();
      table.string('slug', 120).notNullable().unique();
      table.string('title_uz', 255).notNullable();
      table.string('title_ru', 255).notNullable();
      table.text('about_uz').notNullable();
      table.text('about_ru').notNullable();
      table.string('cover_image_object_key', 255).nullable();
      table.string('cover_image_mime_type', 100).nullable();
      table.string('cover_image_file_name', 255).nullable();
      table.boolean('is_active').notNullable().defaultTo(true);
      table.timestamp('starts_at').nullable();
      table.timestamp('ends_at').nullable();
      table.timestamp('deleted_at').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
    return;
  }

  if (!(await knex.schema.hasColumn('promotions', 'cover_image_object_key'))) {
    await knex.schema.alterTable('promotions', (table) => {
      table.string('cover_image_object_key', 255).nullable();
    });
  }

  if (!(await knex.schema.hasColumn('promotions', 'cover_image_mime_type'))) {
    await knex.schema.alterTable('promotions', (table) => {
      table.string('cover_image_mime_type', 100).nullable();
    });
  }

  if (!(await knex.schema.hasColumn('promotions', 'cover_image_file_name'))) {
    await knex.schema.alterTable('promotions', (table) => {
      table.string('cover_image_file_name', 255).nullable();
    });
  }

  if (!(await knex.schema.hasColumn('promotions', 'deleted_at'))) {
    await knex.schema.alterTable('promotions', (table) => {
      table.timestamp('deleted_at').nullable();
    });
  }
};

export async function up(knex: Knex): Promise<void> {
  await ensurePromotionsTable(knex);

  await knex.raw(
    'CREATE UNIQUE INDEX IF NOT EXISTS "promotions_slug_unique" ON "promotions" ("slug")',
  );
  await knex.raw(
    'CREATE INDEX IF NOT EXISTS "promotions_is_active_index" ON "promotions" ("is_active")',
  );
  await knex.raw(
    'CREATE INDEX IF NOT EXISTS "promotions_deleted_at_index" ON "promotions" ("deleted_at")',
  );
};

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS "promotions_deleted_at_index"');
  await knex.raw('DROP INDEX IF EXISTS "promotions_is_active_index"');
}
