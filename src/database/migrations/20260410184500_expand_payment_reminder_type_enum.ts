import type { Knex } from 'knex';

const ENUM_NAME = 'payment_reminder_type';
const OLD_VALUES = ['d2', 'd1', 'd0'];
const NEW_VALUES = ['d2', 'd1', 'd0', 'overdue', 'paid_late'];

const quoteEnumValues = (values: string[]): string => values.map((value) => `'${value}'`).join(', ');

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TYPE "${ENUM_NAME}" RENAME TO "${ENUM_NAME}_old";
  `);

  await knex.raw(`
    CREATE TYPE "${ENUM_NAME}" AS ENUM (${quoteEnumValues(NEW_VALUES)});
  `);

  await knex.raw(`
    ALTER TABLE "payment_reminder_logs"
    ALTER COLUMN "reminder_type" TYPE "${ENUM_NAME}"
    USING "reminder_type"::text::"${ENUM_NAME}";
  `);

  await knex.raw(`
    DROP TYPE "${ENUM_NAME}_old";
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DELETE FROM "payment_reminder_logs"
    WHERE "reminder_type" IN ('overdue', 'paid_late');
  `);

  await knex.raw(`
    ALTER TYPE "${ENUM_NAME}" RENAME TO "${ENUM_NAME}_new";
  `);

  await knex.raw(`
    CREATE TYPE "${ENUM_NAME}" AS ENUM (${quoteEnumValues(OLD_VALUES)});
  `);

  await knex.raw(`
    ALTER TABLE "payment_reminder_logs"
    ALTER COLUMN "reminder_type" TYPE "${ENUM_NAME}"
    USING "reminder_type"::text::"${ENUM_NAME}";
  `);

  await knex.raw(`
    DROP TYPE "${ENUM_NAME}_new";
  `);
}
