import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
  return knex.schema.table("users", (table) => {
    table.string("jshshir", 14).nullable();
    table.string("passport_series", 9).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.table("users", (table) => {
    table.dropColumn("jshshir");
    table.dropColumn("passport_series");
  });
}

