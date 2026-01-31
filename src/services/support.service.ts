import db from '../database/database';
import { SupportTicket, CreateTicketParams, SupportTicketWithUser } from '../types/support.types';
import { logger } from '../utils/logger';
import { redisService } from '../redis/redis.service';

/**
 * SupportService - Support ticket management
 */
export class SupportService {
    private static readonly TICKET_CACHE_PREFIX = 'ticket:msg:';
    private static readonly TICKET_CACHE_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

    /**
     * Generate unique ticket number (format: ABC123)
     */
    private static generateTicketNumber(): string {
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const randomLetters = Array.from({ length: 3 }, () =>
            letters.charAt(Math.floor(Math.random() * letters.length))
        ).join('');
        const randomNumbers = Math.floor(100 + Math.random() * 900).toString();
        return `${randomLetters}${randomNumbers}`;
    }

    /**
     * Create a new support ticket
     * @param params - Ticket creation parameters
     * @returns Created support ticket
     */
    static async createTicket(params: CreateTicketParams): Promise<SupportTicket> {
        const { userTelegramId, messageText, messageId, photoFileId } = params;

        // Generate unique ticket number (retry if collision)
        let ticketNumber = this.generateTicketNumber();
        let attempts = 0;
        const maxAttempts = 5;

        while (attempts < maxAttempts) {
            const existing = await db('support_tickets')
                .where('ticket_number', ticketNumber)
                .first();

            if (!existing) break;

            ticketNumber = this.generateTicketNumber();
            attempts++;
        }

        if (attempts >= maxAttempts) {
            throw new Error('Failed to generate unique ticket number');
        }

        const [result] = await db('support_tickets')
            .insert({
                ticket_number: ticketNumber,
                user_telegram_id: userTelegramId,
                message_text: messageText,
                message_id: messageId,
                photo_file_id: photoFileId,
                status: 'open',
            })
            .returning('*');

        logger.info(`Created support ticket ${ticketNumber} for user ${userTelegramId}`);

        return result;
    }

    /**
     * Update ticket with group message ID (after forwarding to admin group)
     * Also caches the mapping for quick lookup
     */
    static async updateGroupMessageId(
        ticketId: number,
        groupMessageId: number
    ): Promise<void> {
        await db('support_tickets')
            .where('id', ticketId)
            .update({
                group_message_id: groupMessageId,
                updated_at: new Date(),
            });

        // Cache the mapping for quick lookup
        const cacheKey = `${this.TICKET_CACHE_PREFIX}${groupMessageId}`;
        await redisService.set(cacheKey, ticketId.toString(), this.TICKET_CACHE_TTL);

        logger.info(`Updated ticket ${ticketId} with group message ID ${groupMessageId}`);
    }

    /**
     * Get ticket by group message ID (from cache or database)
     */
    static async getTicketByGroupMessageId(
        groupMessageId: number
    ): Promise<SupportTicket | null> {
        // Try cache first
        const cacheKey = `${this.TICKET_CACHE_PREFIX}${groupMessageId}`;
        const cachedTicketId = await redisService.get<string>(cacheKey);

        if (cachedTicketId) {
            const ticket = await db('support_tickets')
                .where('id', parseInt(cachedTicketId, 10))
                .first();
            return ticket || null;
        }

        // Fallback to database
        const ticket = await db('support_tickets')
            .where('group_message_id', groupMessageId)
            .first();

        if (ticket) {
            // Update cache
            await redisService.set(cacheKey, ticket.id.toString(), this.TICKET_CACHE_TTL);
        }

        return ticket || null;
    }

    /**
     * Get ticket by ticket number
     */
    static async getTicketByTicketNumber(
        ticketNumber: string
    ): Promise<SupportTicket | null> {
        const ticket = await db('support_tickets')
            .where('ticket_number', ticketNumber.toUpperCase())
            .first();
        return ticket || null;
    }

    /**
     * Get ticket by ID
     */
    static async getTicketById(ticketId: number): Promise<SupportTicket | null> {
        const ticket = await db('support_tickets')
            .where('id', ticketId)
            .first();
        return ticket || null;
    }

    /**
     * Mark ticket as replied
     * @param ticketId - Ticket ID
     * @param adminTelegramId - Admin who replied
     * @param replyMessage - The reply message
     * @returns true if updated, false if already replied
     */
    static async markAsReplied(
        ticketId: number,
        adminTelegramId: number,
        replyMessage: string
    ): Promise<boolean> {
        const ticket = await this.getTicketById(ticketId);

        if (!ticket || ticket.status === 'replied') {
            return false;
        }

        await db('support_tickets')
            .where('id', ticketId)
            .update({
                status: 'replied',
                replied_by_admin_id: adminTelegramId,
                replied_at: new Date(),
                reply_message: replyMessage,
                updated_at: new Date(),
            });

        logger.info(`Ticket ${ticketId} marked as replied by admin ${adminTelegramId}`);
        return true;
    }

    /**
     * Check if ticket can be replied to
     */
    static async canReply(ticketId: number): Promise<boolean> {
        const ticket = await this.getTicketById(ticketId);
        return ticket !== null && ticket.status === 'open';
    }

    /**
     * Get user's open tickets
     */
    static async getUserOpenTickets(
        userTelegramId: number
    ): Promise<SupportTicket[]> {
        const tickets = await db('support_tickets')
            .where('user_telegram_id', userTelegramId)
            .where('status', 'open')
            .orderBy('created_at', 'desc');
        return tickets;
    }

    /**
     * Close ticket without reply
     */
    static async closeTicket(ticketId: number): Promise<boolean> {
        const ticket = await this.getTicketById(ticketId);

        if (!ticket || ticket.status === 'closed') {
            return false;
        }

        await db('support_tickets')
            .where('id', ticketId)
            .update({
                status: 'closed',
                updated_at: new Date(),
            });

        logger.info(`Ticket ${ticketId} closed`);
        return true;
    }

    /**
     * Get all support tickets with user details (for export)
     */
    static async getAllTickets(): Promise<SupportTicketWithUser[]> {
        const tickets = await db('support_tickets')
            .join('users', 'support_tickets.user_telegram_id', 'users.telegram_id')
            .select(
                'support_tickets.*',
                'users.first_name',
                'users.last_name',
                'users.phone_number'
            )
            .orderBy('support_tickets.created_at', 'desc');
        return tickets;
    }

    /**
     * Get ticket statistics
     */
    static async getTicketStats(): Promise<{
        total: number;
        open: number;
        replied: number;
        closed: number;
    }> {
        const stats = await db('support_tickets')
            .select('status')
            .count('id as count')
            .groupBy('status');

        const result = { total: 0, open: 0, replied: 0, closed: 0 };

        for (const row of stats) {
            const count = parseInt(row.count as string, 10);
            result.total += count;
            if (row.status === 'open') result.open = count;
            if (row.status === 'replied') result.replied = count;
            if (row.status === 'closed') result.closed = count;
        }

        return result;
    }
}
