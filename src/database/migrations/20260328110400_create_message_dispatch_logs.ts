import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    return knex.schema.createTable("message_dispatch_logs", (table) => {
        table.bigIncrements("id").primary();
        table.bigInteger("user_id").nullable().references("id").inTable("users").onDelete("SET NULL");
        table.bigInteger("coupon_id").nullable().references("id").inTable("coupons").onDelete("SET NULL");
        table.bigInteger("template_id").nullable().references("id").inTable("message_templates").onDelete("SET NULL");
        table.string("dispatch_type", 50).notNullable();
        table.string("status", 50).notNullable();
        table.text("error_message").nullable();
        table.timestamp("created_at").defaultTo(knex.fn.now());

        table.index(["user_id"]);
        table.index(["coupon_id"]);
        table.index(["dispatch_type"]);
    });
}

export async function down(knex: Knex): Promise<void> {
    return knex.schema.dropTableIfExists("message_dispatch_logs");
}
