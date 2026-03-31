import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
    return knex.schema.createTable("coupon_user_mappings", (table) => {
        table.bigIncrements("id").primary();
        table.bigInteger("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
        table.bigInteger("coupon_id").notNullable().references("id").inTable("coupons").onDelete("CASCADE");
        table.timestamps(true, true);

        table.unique(["coupon_id"]);
        table.index(["user_id"]);
    });
}


export async function down(knex: Knex): Promise<void> {
    return knex.schema.dropTable("coupon_user_mappings");
}
