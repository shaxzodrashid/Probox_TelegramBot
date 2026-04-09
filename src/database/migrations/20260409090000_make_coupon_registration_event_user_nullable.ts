import type { Knex } from 'knex';

const TABLE_NAME = 'coupon_registration_events';
const COLUMN_NAME = 'user_id';
const FOREIGN_KEY_NAME = 'coupon_registration_events_user_id_foreign';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TABLE_NAME);
  if (!hasTable) {
    return;
  }

  await knex.raw(`
    ALTER TABLE "${TABLE_NAME}"
    ALTER COLUMN "${COLUMN_NAME}" DROP NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TABLE_NAME);
  if (!hasTable) {
    return;
  }

  await knex.raw(`
    DELETE FROM "${TABLE_NAME}"
    WHERE "${COLUMN_NAME}" IS NULL
  `);

  await knex.raw(`
    ALTER TABLE "${TABLE_NAME}"
    DROP CONSTRAINT IF EXISTS "${FOREIGN_KEY_NAME}"
  `);

  await knex.raw(`
    ALTER TABLE "${TABLE_NAME}"
    ALTER COLUMN "${COLUMN_NAME}" SET NOT NULL
  `);

  await knex.raw(`
    ALTER TABLE "${TABLE_NAME}"
    ADD CONSTRAINT "${FOREIGN_KEY_NAME}"
    FOREIGN KEY ("${COLUMN_NAME}")
    REFERENCES "users"("id")
    ON DELETE CASCADE
  `);
}
