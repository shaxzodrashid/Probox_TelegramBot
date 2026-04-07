import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable("coupons", (table) => {
        table.integer("sap_doc_entry").nullable();
        table.integer("sap_installment_id").nullable();
        table.index(["sap_doc_entry", "sap_installment_id"]);
    });

    await knex.schema.dropTableIfExists("payment_installment_state");
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.createTable("payment_installment_state", (table) => {
        table.bigIncrements("id").primary();
        table.string("sap_card_code", 100).notNullable();
        table.integer("doc_entry").notNullable();
        table.integer("installment_id").notNullable();
        table.date("due_date").notNullable();
        table.string("last_status", 50).nullable();
        table.decimal("last_paid_amount", 15, 2).nullable();
        table.timestamp("last_checked_at").nullable();
        table.timestamp("reward_issued_at").nullable();

        table.unique(["sap_card_code", "doc_entry", "installment_id"]);
        table.index(["due_date"]);
    });

    await knex.schema.alterTable("coupons", (table) => {
        table.dropIndex(["sap_doc_entry", "sap_installment_id"]);
        table.dropColumn("sap_doc_entry");
        table.dropColumn("sap_installment_id");
    });
}
