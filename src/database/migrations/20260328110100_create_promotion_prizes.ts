import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    return knex.schema.createTable("promotion_prizes", (table) => {
        table.bigIncrements("id").primary();
        table.bigInteger("promotion_id").notNullable().references("id").inTable("promotions").onDelete("CASCADE");
        table.string("title", 255).notNullable();
        table.text("description").nullable();
        table.boolean("is_active").notNullable().defaultTo(true);
        table.timestamp("created_at").defaultTo(knex.fn.now());
        table.timestamp("updated_at").defaultTo(knex.fn.now());

        table.index(["promotion_id"]);
    });
}

export async function down(knex: Knex): Promise<void> {
    return knex.schema.dropTableIfExists("promotion_prizes");
}
