import type { Knex } from 'knex';

const SUPPORT_TICKETS_TABLE = 'support_tickets';
const SUPPORT_MESSAGES_TABLE = 'support_ticket_messages';
const FAQS_TABLE = 'faqs';

export async function up(knex: Knex): Promise<void> {
  const hasFaqAgentEnabled = await knex.schema.hasColumn(FAQS_TABLE, 'agent_enabled');
  if (!hasFaqAgentEnabled) {
    await knex.schema.alterTable(FAQS_TABLE, (table) => {
      table.boolean('agent_enabled').notNullable().defaultTo(false);
    });
  }

  const hasFaqAgentToken = await knex.schema.hasColumn(FAQS_TABLE, 'agent_token');
  if (!hasFaqAgentToken) {
    await knex.schema.alterTable(FAQS_TABLE, (table) => {
      table.string('agent_token', 64).nullable();
    });
  }

  const hasHandlingMode = await knex.schema.hasColumn(SUPPORT_TICKETS_TABLE, 'handling_mode');
  const hasMatchedFaqId = await knex.schema.hasColumn(SUPPORT_TICKETS_TABLE, 'matched_faq_id');
  const hasAgentToken = await knex.schema.hasColumn(SUPPORT_TICKETS_TABLE, 'agent_token');
  const hasAgentEscalationReason = await knex.schema.hasColumn(SUPPORT_TICKETS_TABLE, 'agent_escalation_reason');

  if (!hasHandlingMode || !hasMatchedFaqId || !hasAgentToken || !hasAgentEscalationReason) {
    await knex.schema.alterTable(SUPPORT_TICKETS_TABLE, (table) => {
      if (!hasHandlingMode) {
        table.string('handling_mode', 20).notNullable().defaultTo('human');
      }
      if (!hasMatchedFaqId) {
        table.bigInteger('matched_faq_id').nullable();
      }
      if (!hasAgentToken) {
        table.string('agent_token', 64).nullable();
      }
      if (!hasAgentEscalationReason) {
        table.text('agent_escalation_reason').nullable();
      }
    });
  }

  const hasSupportMessagesTable = await knex.schema.hasTable(SUPPORT_MESSAGES_TABLE);
  if (!hasSupportMessagesTable) {
    await knex.schema.createTable(SUPPORT_MESSAGES_TABLE, (table) => {
      table.bigIncrements('id').primary();
      table.bigInteger('ticket_id').notNullable().references('id').inTable(SUPPORT_TICKETS_TABLE).onDelete('CASCADE');
      table.string('sender_type', 20).notNullable();
      table.text('message_text').notNullable().defaultTo('');
      table.string('photo_file_id', 255).nullable();
      table.bigInteger('telegram_message_id').nullable();
      table.bigInteger('group_message_id').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index('ticket_id');
      table.index('sender_type');
      table.index('group_message_id');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasSupportMessagesTable = await knex.schema.hasTable(SUPPORT_MESSAGES_TABLE);
  if (hasSupportMessagesTable) {
    await knex.schema.dropTableIfExists(SUPPORT_MESSAGES_TABLE);
  }

  const hasAgentEscalationReason = await knex.schema.hasColumn(SUPPORT_TICKETS_TABLE, 'agent_escalation_reason');
  const hasAgentToken = await knex.schema.hasColumn(SUPPORT_TICKETS_TABLE, 'agent_token');
  const hasMatchedFaqId = await knex.schema.hasColumn(SUPPORT_TICKETS_TABLE, 'matched_faq_id');
  const hasHandlingMode = await knex.schema.hasColumn(SUPPORT_TICKETS_TABLE, 'handling_mode');
  if (hasAgentEscalationReason || hasAgentToken || hasMatchedFaqId || hasHandlingMode) {
    await knex.schema.alterTable(SUPPORT_TICKETS_TABLE, (table) => {
      if (hasAgentEscalationReason) {
        table.dropColumn('agent_escalation_reason');
      }
      if (hasAgentToken) {
        table.dropColumn('agent_token');
      }
      if (hasMatchedFaqId) {
        table.dropColumn('matched_faq_id');
      }
      if (hasHandlingMode) {
        table.dropColumn('handling_mode');
      }
    });
  }

  const hasFaqAgentToken = await knex.schema.hasColumn(FAQS_TABLE, 'agent_token');
  const hasFaqAgentEnabled = await knex.schema.hasColumn(FAQS_TABLE, 'agent_enabled');
  if (hasFaqAgentToken || hasFaqAgentEnabled) {
    await knex.schema.alterTable(FAQS_TABLE, (table) => {
      if (hasFaqAgentToken) {
        table.dropColumn('agent_token');
      }
      if (hasFaqAgentEnabled) {
        table.dropColumn('agent_enabled');
      }
    });
  }
}
