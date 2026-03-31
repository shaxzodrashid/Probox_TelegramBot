import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    return knex.schema.createTable("payment_reminder_logs", (table) => {
        table.bigIncrements("id").primary();
        table.bigInteger("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
        table.string("sap_card_code", 100).notNullable();
        table.integer("doc_entry").notNullable();
        table.integer("installment_id").notNullable();
        table
            .enu("reminder_type", ["d2", "d1", "d0"], {
                useNative: true,
                enumName: "payment_reminder_type",
            })
            .notNullable();
        table.date("due_date").notNullable();
        table.timestamp("sent_at").defaultTo(knex.fn.now());
        table.string("status", 50).notNullable();
        table.text("error_message").nullable();

        table.unique(["user_id", "doc_entry", "installment_id", "reminder_type"]);
        table.index(["sap_card_code"]);
    });
}

export async function down(knex: Knex): Promise<void> {
    return knex.schema.dropTableIfExists("payment_reminder_logs");
}
