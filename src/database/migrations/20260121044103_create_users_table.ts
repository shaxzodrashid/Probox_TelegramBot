import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("users", (table) => {
    table.bigIncrements("id").primary();
    table.bigInteger("telegram_id").notNullable().unique();
    table.string("first_name", 255);
    table.string("last_name", 255);
    table.string("phone_number", 20);
    table.string("sap_card_code");
    table.string("language_code", 10).defaultTo("uz");
    table.boolean("is_admin").defaultTo(false);
    table.boolean("is_blocked").defaultTo(false);
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("users");
}

