import { db } from './src/config/database';
import { SupportService } from './src/services/support/support.service';
import { SupportTicketMessage } from './src/types/database.types';

async function run() {
    // create a bunch of messages
    await db('support_ticket_messages').del();
    await db('support_tickets').del();

    const [ticket] = await db('support_tickets').insert({
        user_telegram_id: 12345,
        status: 'open',
        handling_mode: 'human',
        ticket_number: '123'
    }).returning('*');

    const ticketId = ticket.id;

    for (let i = 0; i < 1000; i++) {
        await db('support_ticket_messages').insert({
            ticket_id: ticketId,
            sender_type: 'user',
            user_telegram_id: 12345,
            message_text: `message ${i}`,
            message_id: i,
        });
    }

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
        await SupportService.updateLatestMessageGroupMessageId(ticketId, 'user', 1000 + i);
    }
    const end = performance.now();

    console.log(`Time taken: ${end - start}ms`);

    process.exit(0);
}

run().catch(console.error);
