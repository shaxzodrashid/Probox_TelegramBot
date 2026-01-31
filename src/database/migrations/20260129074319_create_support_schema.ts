import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    // Add columns to existing users table
    await knex.schema.alterTable("users", (table) => {
        table.boolean("is_support_banned").defaultTo(false);
    });

    // Create support_tickets table
    await knex.schema.createTable("support_tickets", (table) => {
        table.bigIncrements("id").primary();
        table.string("ticket_number", 20).notNullable().unique();
        table.bigInteger("user_telegram_id").notNullable().references("telegram_id").inTable("users").onDelete("CASCADE");
        table.text("message_text").notNullable();
        table.bigInteger("message_id");
        table.bigInteger("group_message_id");
        table.string("photo_file_id", 255);
        table.string("status", 20).defaultTo("open"); // open, replied, closed
        table.bigInteger("replied_by_admin_id"); //.references("telegram_id").inTable("users"); // Admin who replied
        table.timestamp("replied_at");
        table.text("reply_message");
        table.timestamp("created_at").defaultTo(knex.fn.now());
        table.timestamp("updated_at").defaultTo(knex.fn.now());

        // Indexes
        table.index("user_telegram_id");
        table.index("status");
        table.index("group_message_id");
    });

    // Create broadcast_messages table
    await knex.schema.createTable("broadcast_messages", (table) => {
        table.bigIncrements("id").primary();
        table.bigInteger("admin_telegram_id").notNullable(); //.references("telegram_id").inTable("users");
        table.text("message_text");
        table.string("photo_file_id", 255);
        table.string("target_type", 20).notNullable(); // all, single
        table.bigInteger("target_user_id");
        table.integer("total_recipients").defaultTo(0);
        table.integer("successful_sends").defaultTo(0);
        table.integer("failed_sends").defaultTo(0);
        table.string("status", 20).defaultTo("pending"); // pending, in_progress, completed, failed
        table.timestamp("created_at").defaultTo(knex.fn.now());
        table.timestamp("completed_at");
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists("broadcast_messages");
    await knex.schema.dropTableIfExists("support_tickets");
    await knex.schema.alterTable("users", (table) => {
        table.dropColumn("is_support_banned");
    });
}
