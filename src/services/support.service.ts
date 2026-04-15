import db from '../database/database';
import {
    CreateTicketParams,
    SupportHandlingMode,
    SupportMessageSenderType,
    SupportTicket,
    SupportTicketMessage,
    SupportTicketWithUser,
} from '../types/support.types';
import { logger } from '../utils/logger';
import { redisService } from '../redis/redis.service';

/**
 * SupportService - Support ticket management
 */
export class SupportService {
    private static readonly TICKET_CACHE_PREFIX = 'ticket:msg:';
    private static readonly TICKET_CACHE_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

    private static toSafeNumber(value: unknown): number {
        if (typeof value === 'number') {
            return value;
        }

        if (typeof value === 'string') {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }

        return 0;
    }

    private static normalizeTicket(ticket: SupportTicket | null | undefined): SupportTicket | null {
        if (!ticket) {
            return null;
        }

        return {
            ...ticket,
            id: this.toSafeNumber(ticket.id),
            user_telegram_id: this.toSafeNumber(ticket.user_telegram_id),
            message_id: ticket.message_id === undefined || ticket.message_id === null
                ? undefined
                : this.toSafeNumber(ticket.message_id),
            group_message_id: ticket.group_message_id === undefined || ticket.group_message_id === null
                ? undefined
                : this.toSafeNumber(ticket.group_message_id),
            handling_mode: (ticket.handling_mode || 'human') as SupportHandlingMode,
            matched_faq_id: ticket.matched_faq_id === undefined || ticket.matched_faq_id === null
                ? null
                : this.toSafeNumber(ticket.matched_faq_id),
            agent_token: ticket.agent_token?.trim() || null,
            agent_escalation_reason: ticket.agent_escalation_reason?.trim() || null,
            replied_by_admin_id: ticket.replied_by_admin_id === undefined || ticket.replied_by_admin_id === null
                ? undefined
                : this.toSafeNumber(ticket.replied_by_admin_id),
        };
    }

    private static normalizeMessage(message: SupportTicketMessage): SupportTicketMessage {
        return {
            ...message,
            id: this.toSafeNumber(message.id),
            ticket_id: this.toSafeNumber(message.ticket_id),
            telegram_message_id: message.telegram_message_id === undefined || message.telegram_message_id === null
                ? null
                : this.toSafeNumber(message.telegram_message_id),
            group_message_id: message.group_message_id === undefined || message.group_message_id === null
                ? null
                : this.toSafeNumber(message.group_message_id),
            photo_file_id: message.photo_file_id || null,
        };
    }

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
        const {
            userTelegramId,
            messageText,
            messageId,
            photoFileId,
            handlingMode = 'human',
            matchedFaqId = null,
            agentToken = null,
        } = params;

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
                handling_mode: handlingMode,
                matched_faq_id: matchedFaqId,
                agent_token: agentToken,
            })
            .returning('*');

        logger.info(`Created support ticket ${ticketNumber} for user ${userTelegramId}`);

        return this.normalizeTicket(result)!;
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
            return this.normalizeTicket(ticket);
        }

        // Fallback to database
        const ticket = await db('support_tickets')
            .where('group_message_id', groupMessageId)
            .first();

        if (ticket) {
            // Update cache
            await redisService.set(cacheKey, ticket.id.toString(), this.TICKET_CACHE_TTL);
        }

        return this.normalizeTicket(ticket);
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
        return this.normalizeTicket(ticket);
    }

    /**
     * Get ticket by ID
     */
    static async getTicketById(ticketId: number): Promise<SupportTicket | null> {
        const ticket = await db('support_tickets')
            .where('id', ticketId)
            .first();
        return this.normalizeTicket(ticket);
    }

    static async getOpenAgentTicketByUserTelegramId(userTelegramId: number): Promise<SupportTicket | null> {
        const ticket = await db<SupportTicket>('support_tickets')
            .where('user_telegram_id', userTelegramId)
            .where('status', 'open')
            .where('handling_mode', 'agent')
            .orderBy('created_at', 'desc')
            .first();

        return this.normalizeTicket(ticket);
    }

    static async appendMessage(params: {
        ticketId: number;
        senderType: SupportMessageSenderType;
        messageText: string;
        photoFileId?: string | null;
        telegramMessageId?: number | null;
        groupMessageId?: number | null;
    }): Promise<SupportTicketMessage> {
        const [result] = await db<SupportTicketMessage>('support_ticket_messages')
            .insert({
                ticket_id: params.ticketId,
                sender_type: params.senderType,
                message_text: params.messageText,
                photo_file_id: params.photoFileId || null,
                telegram_message_id: params.telegramMessageId || null,
                group_message_id: params.groupMessageId || null,
            })
            .returning('*');

        await db('support_tickets')
            .where('id', params.ticketId)
            .update({
                updated_at: new Date(),
            });

        return this.normalizeMessage(result);
    }

    static async syncTicketPreviewMessage(params: {
        ticketId: number;
        messageText: string;
        messageId?: number | null;
        photoFileId?: string | null;
    }): Promise<void> {
        await db('support_tickets')
            .where('id', params.ticketId)
            .update({
                message_text: params.messageText,
                message_id: params.messageId || null,
                photo_file_id: params.photoFileId || null,
                updated_at: new Date(),
            });
    }

    static async getTicketMessages(ticketId: number): Promise<SupportTicketMessage[]> {
        const messages = await db<SupportTicketMessage>('support_ticket_messages')
            .where('ticket_id', ticketId)
            .orderBy('created_at', 'asc')
            .orderBy('id', 'asc');

        return messages.map((message) => this.normalizeMessage(message));
    }

    static async updateLatestMessageGroupMessageId(
        ticketId: number,
        senderType: SupportMessageSenderType,
        groupMessageId: number,
    ): Promise<void> {
        const latestMessage = await db<SupportTicketMessage>('support_ticket_messages')
            .where('ticket_id', ticketId)
            .where('sender_type', senderType)
            .orderBy('created_at', 'desc')
            .orderBy('id', 'desc')
            .first();

        if (!latestMessage) {
            return;
        }

        await db('support_ticket_messages')
            .where('id', latestMessage.id)
            .update({
                group_message_id: groupMessageId,
            });
    }

    static async escalateAgentTicket(ticketId: number, reason: string): Promise<SupportTicket | null> {
        const [result] = await db<SupportTicket>('support_tickets')
            .where('id', ticketId)
            .update({
                handling_mode: 'human',
                agent_escalation_reason: reason,
                updated_at: new Date(),
            })
            .returning('*');

        return this.normalizeTicket(result);
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
        return tickets
            .map((ticket: SupportTicket) => this.normalizeTicket(ticket))
            .filter((ticket): ticket is SupportTicket => Boolean(ticket));
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
        return tickets
            .map((ticket: SupportTicketWithUser) => {
                const normalizedTicket = this.normalizeTicket(ticket);
                return normalizedTicket
                    ? {
                        ...ticket,
                        ...normalizedTicket,
                    }
                    : null;
            })
            .filter((ticket): ticket is SupportTicketWithUser => Boolean(ticket));
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
