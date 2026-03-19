import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
    return knex.schema.createTable('branches', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.string('name').notNullable();
        table.string('address').notNullable();
        table.string('support_phone').nullable();
        table.boolean('is_active').notNullable().defaultTo(true);
        table.string('longitude').nullable();
        table.string('latitude').nullable();
        table.string('work_start_time').nullable();
        table.string('work_end_time').nullable();
        table.timestamps(true, true);
    });
}


export async function down(knex: Knex): Promise<void> {
    return knex.schema.dropTable('branches');
}

