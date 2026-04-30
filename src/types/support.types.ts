/**
 * Support System Type Definitions
 */

export type TicketStatus = 'open' | 'replied' | 'closed';
export type SupportHandlingMode = 'human' | 'agent';
export type SupportMessageSenderType = 'user' | 'agent' | 'admin' | 'system';
export type BroadcastStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
export type BroadcastTargetType = 'all' | 'single';
export type ScheduledBroadcastWeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface SupportTicket {
    id: number;
    ticket_number: string;
    user_telegram_id: number;
    message_text: string;
    message_id?: number;
    group_message_id?: number;
    photo_file_id?: string;
    status: TicketStatus;
    handling_mode: SupportHandlingMode;
    matched_faq_id?: number | null;
    agent_token?: string | null;
    agent_escalation_reason?: string | null;
    replied_by_admin_id?: number;
    replied_at?: Date;
    reply_message?: string;
    created_at: Date;
    updated_at: Date;
}

export interface SupportTicketMessage {
    id: number;
    ticket_id: number;
    sender_type: SupportMessageSenderType;
    message_text: string;
    photo_file_id?: string | null;
    telegram_message_id?: number | null;
    group_message_id?: number | null;
    created_at: Date;
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
    handlingMode?: SupportHandlingMode;
    matchedFaqId?: number | null;
    agentToken?: string | null;
}

export interface ScheduledBroadcast {
    id: number;
    admin_telegram_id: number;
    message_text?: string | null;
    photo_file_id?: string | null;
    target_type: BroadcastTargetType;
    target_user_id?: number | null;
    week_day: ScheduledBroadcastWeekDay;
    scheduled_time: string;
    is_active: boolean;
    last_run_date?: string | null;
    last_run_at?: Date | null;
    last_broadcast_message_id?: number | null;
    created_at: Date;
    updated_at: Date;
}

export interface CreateBroadcastParams {
    adminTelegramId: number;
    messageText?: string;
    photoFileId?: string;
    targetType: BroadcastTargetType;
    targetUserId?: number;
}

export interface CreateScheduledBroadcastParams extends CreateBroadcastParams {
    weekDay: ScheduledBroadcastWeekDay;
    scheduledTime: string;
}
