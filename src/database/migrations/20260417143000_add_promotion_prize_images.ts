import type { Knex } from 'knex';

const TABLE_NAME = 'promotion_prizes';

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TABLE_NAME))) {
    return;
  }

  if (!(await knex.schema.hasColumn(TABLE_NAME, 'image_object_key'))) {
    await knex.schema.alterTable(TABLE_NAME, (table) => {
      table.string('image_object_key', 255).nullable();
    });
  }

  if (!(await knex.schema.hasColumn(TABLE_NAME, 'image_mime_type'))) {
    await knex.schema.alterTable(TABLE_NAME, (table) => {
      table.string('image_mime_type', 100).nullable();
    });
  }

  if (!(await knex.schema.hasColumn(TABLE_NAME, 'image_file_name'))) {
    await knex.schema.alterTable(TABLE_NAME, (table) => {
      table.string('image_file_name', 255).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TABLE_NAME))) {
    return;
  }

  if (await knex.schema.hasColumn(TABLE_NAME, 'image_file_name')) {
    await knex.schema.alterTable(TABLE_NAME, (table) => {
      table.dropColumn('image_file_name');
    });
  }

  if (await knex.schema.hasColumn(TABLE_NAME, 'image_mime_type')) {
    await knex.schema.alterTable(TABLE_NAME, (table) => {
      table.dropColumn('image_mime_type');
    });
  }

  if (await knex.schema.hasColumn(TABLE_NAME, 'image_object_key')) {
    await knex.schema.alterTable(TABLE_NAME, (table) => {
      table.dropColumn('image_object_key');
    });
  }
}
