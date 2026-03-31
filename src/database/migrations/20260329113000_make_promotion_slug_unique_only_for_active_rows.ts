import type { Knex } from 'knex';

const PROMOTIONS_SLUG_UNIQUE = 'promotions_slug_unique';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE "promotions" DROP CONSTRAINT IF EXISTS "${PROMOTIONS_SLUG_UNIQUE}"`);
  await knex.raw(`DROP INDEX IF EXISTS "${PROMOTIONS_SLUG_UNIQUE}"`);
  await knex.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS "${PROMOTIONS_SLUG_UNIQUE}" ON "promotions" ("slug") WHERE "deleted_at" IS NULL`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS "${PROMOTIONS_SLUG_UNIQUE}"`);
  await knex.raw(`ALTER TABLE "promotions" ADD CONSTRAINT "${PROMOTIONS_SLUG_UNIQUE}" UNIQUE ("slug")`);
}
