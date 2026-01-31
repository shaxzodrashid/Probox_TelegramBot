/**
 * Support System Type Definitions
 */

export type TicketStatus = 'open' | 'replied' | 'closed';
export type BroadcastStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
export type BroadcastTargetType = 'all' | 'single';

export interface SupportTicket {
    id: number;
    ticket_number: string;
    user_telegram_id: number;
    message_text: string;
    message_id?: number;
    group_message_id?: number;
    photo_file_id?: string;
    status: TicketStatus;
    replied_by_admin_id?: number;
    replied_at?: Date;
    reply_message?: string;
    created_at: Date;
    updated_at: Date;
}

export interface BroadcastMessage {
    id: number;
    admin_telegram_id: number;
    message_text?: string;
    photo_file_id?: string;
    target_type: BroadcastTargetType;
    target_user_id?: number;
    total_recipients: number;
    successful_sends: number;
    failed_sends: number;
    status: BroadcastStatus;
    created_at: Date;
    completed_at?: Date;
}

export interface SupportTicketWithUser extends SupportTicket {
    first_name?: string;
    last_name?: string;
    phone_number?: string;
}

export interface CreateTicketParams {
    userTelegramId: number;
    messageText: string;
    messageId?: number;
    photoFileId?: string;
}

export interface CreateBroadcastParams {
    adminTelegramId: number;
    messageText?: string;
    photoFileId?: string;
    targetType: BroadcastTargetType;
    targetUserId?: number;
}
