import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
    return knex.schema.createTable("coupons", (table) => {
        table.bigIncrements("id").primary();
        table.string("code", 7).notNullable().unique();
        table.bigInteger("promotion_id").references("id").inTable("promotions").onDelete("SET NULL");
        table
            .enu("source_type", ["store_visit", "purchase", "referral", "payment_on_time"], {
                useNative: true,
                enumName: "coupon_source_type",
            })
            .notNullable();
        table
            .enu("status", ["active", "won", "expired"], {
                useNative: true,
                enumName: "coupon_status",
            })
            .notNullable()
            .defaultTo("active");
        table.string("issued_phone_snapshot", 20).notNullable();
        table.timestamp("expires_at").notNullable();
        table.timestamp("won_at").nullable();
        table.boolean("is_active").notNullable().defaultTo(true);
        table.timestamps(true, true);

        table.index(["promotion_id"]);
        table.index(["status"]);
        table.index(["is_active"]);
    });
}


export async function down(knex: Knex): Promise<void> {
    return knex.schema.dropTable("coupons");
}
