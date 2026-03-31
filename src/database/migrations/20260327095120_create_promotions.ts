import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    return knex.schema.createTable("promotions", (table) => {
        table.bigIncrements("id").primary();
        table.string("slug", 120).notNullable().unique();
        table.string("title_uz", 255).notNullable();
        table.string("title_ru", 255).notNullable();
        table.text("about_uz").notNullable();
        table.text("about_ru").notNullable();
        table.boolean("is_active").notNullable().defaultTo(true);
        table.boolean("assign_coupons").notNullable().defaultTo(false);
        table.timestamp("starts_at").nullable();
        table.timestamp("ends_at").nullable();
        table.timestamp("created_at").defaultTo(knex.fn.now());
        table.timestamp("updated_at").defaultTo(knex.fn.now());

        table.index(["is_active"]);
        table.index(["assign_coupons"]);
    });
}

export async function down(knex: Knex): Promise<void> {
    return knex.schema.dropTableIfExists("promotions");
}
