import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
    return knex.schema.createTable("message_templates", (table) => {
        table.bigIncrements("id").primary();
        table.string("template_key", 120).notNullable().unique();
        table
            .enu(
                "template_type",
                [
                    "store_visit",
                    "purchase",
                    "referral",
                    "payment_reminder_d2",
                    "payment_reminder_d1",
                    "payment_reminder_d0",
                    "payment_paid_on_time",
                    "payment_overdue",
                    "payment_paid_late",
                    "winner_notification",
                ],
                {
                    useNative: true,
                    enumName: "message_template_type",
                },
            )
            .notNullable();
        table.string("title", 255).notNullable();
        table.text("content_uz").notNullable();
        table.text("content_ru").notNullable();
        table.string("channel", 50).notNullable().defaultTo("telegram_bot");
        table.boolean("is_active").notNullable().defaultTo(true);
        table.timestamp("created_at").defaultTo(knex.fn.now());
        table.timestamp("updated_at").defaultTo(knex.fn.now());

        table.index(["template_type"]);
        table.index(["is_active"]);
    });
}


export async function down(knex: Knex): Promise<void> {
    return knex.schema.dropTableIfExists("message_templates");
}
