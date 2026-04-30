import db from '../database/database';
import {
    BroadcastMessage,
    BroadcastTargetType,
    CreateBroadcastParams,
    CreateScheduledBroadcastParams,
    ScheduledBroadcast,
    BroadcastStatus,
} from '../types/support.types';
import { AdminService } from './admin.service';
import { UserService } from './user.service';
import { config } from '../config';
import { logger } from '../utils/logger';
import { isUserBlockedError } from '../utils/telegram/telegram-errors';
import { bot } from '../bot';
import { markdownToTelegramHtml } from '../utils/telegram/telegram-rich-text.util';
import {
    getTashkentDateKey,
    getTashkentTimeKey,
    getTashkentWeekDay,
} from '../utils/time/tashkent-time.util';

/**
 * BroadcastService - Broadcasting logic for admin messages
 */
export class BroadcastService {
    private static async getRecipientUsers(
        targetType: BroadcastTargetType,
        targetUserId?: number | null
    ) {
        if (targetType === 'single') {
            if (!targetUserId) {
                return [];
            }

            const user = await UserService.getUserByTelegramId(targetUserId);
            return user ? [user] : [];
        }

        return AdminService.getAllUsers();
    }

    private static async getRecipientCount(
        targetType: BroadcastTargetType,
        targetUserId?: number | null
    ): Promise<number> {
        if (targetType === 'single') {
            return targetUserId ? 1 : 0;
        }

        const users = await AdminService.getAllUsers();
        return users.length;
    }

    /**
     * Create a broadcast record
     */
    static async createBroadcast(params: CreateBroadcastParams): Promise<BroadcastMessage> {
        const { adminTelegramId, messageText, photoFileId, targetType, targetUserId } = params;

        const totalRecipients = await this.getRecipientCount(targetType, targetUserId);

        const [result] = await db('broadcast_messages')
            .insert({
                admin_telegram_id: adminTelegramId,
                message_text: messageText,
                photo_file_id: photoFileId,
                target_type: targetType,
                target_user_id: targetUserId,
                total_recipients: totalRecipients,
                status: 'pending',
            })
            .returning('*');

        logger.info(`Broadcast created by admin ${adminTelegramId} for ${targetType} (${totalRecipients} recipients)`);

        return result;
    }

    static async createScheduledBroadcast(
        params: CreateScheduledBroadcastParams
    ): Promise<ScheduledBroadcast> {
        const [result] = await db('scheduled_broadcasts')
            .insert({
                admin_telegram_id: params.adminTelegramId,
                message_text: params.messageText,
                photo_file_id: params.photoFileId,
                target_type: params.targetType,
                target_user_id: params.targetUserId,
                week_day: params.weekDay,
                scheduled_time: params.scheduledTime,
                is_active: true,
            })
            .returning('*');

        logger.info(
            `Scheduled weekly broadcast ${result.id} created by admin ${params.adminTelegramId} for ${params.targetType} at ${params.weekDay} ${params.scheduledTime}`,
        );

        return result;
    }

    /**
     * Get broadcast by ID
     */
    static async getBroadcastById(broadcastId: number): Promise<BroadcastMessage | null> {
        const broadcast = await db('broadcast_messages')
            .where('id', broadcastId)
            .first();
        return broadcast || null;
    }

    /**
     * Check if there's an active broadcast in progress
     * Only one broadcast can be "in_progress" at a time
     * @returns The active broadcast if exists, null otherwise
     */
    static async hasActiveBroadcast(): Promise<BroadcastMessage | null> {
        const activeBroadcast = await db('broadcast_messages')
            .where('status', 'in_progress')
            .first();
        return activeBroadcast || null;
    }

    /**
     * Update broadcast status
     */
    static async updateBroadcastStatus(
        broadcastId: number,
        status: BroadcastStatus,
        successfulSends?: number,
        failedSends?: number
    ): Promise<void> {
        const updateData: Record<string, unknown> = { status };

        if (successfulSends !== undefined) {
            updateData.successful_sends = successfulSends;
        }
        if (failedSends !== undefined) {
            updateData.failed_sends = failedSends;
        }
        if (status === 'completed' || status === 'failed') {
            updateData.completed_at = new Date();
        }

        await db('broadcast_messages')
            .where('id', broadcastId)
            .update(updateData);
    }

    /**
     * Send message to a single user
     * If the user has blocked the bot, marks them as blocked in the database
     */
    static async sendToUser(
        telegramId: number,
        message: string,
        photoFileId?: string
    ): Promise<boolean> {
        try {
            if (photoFileId) {
                await bot.api.sendPhoto(telegramId, photoFileId, {
                    caption: markdownToTelegramHtml(message),
                    parse_mode: 'HTML',
                });
            } else {
                await bot.api.sendMessage(telegramId, markdownToTelegramHtml(message), {
                    parse_mode: 'HTML',
                });
            }

            // Should unblock user if they were strictly blocked but now we can send messages
            await UserService.unblockUserIfBlocked(telegramId);

            return true;
        } catch (error) {
            // Check if the error indicates user blocked the bot
            if (isUserBlockedError(error)) {
                logger.info(`User ${telegramId} has blocked the bot - marking as blocked in database`);
                try {
                    await UserService.markUserAsBlocked(telegramId);
                } catch (dbError) {
                    logger.error(`Failed to mark user ${telegramId} as blocked in database:`, dbError);
                }
            } else {
                logger.warn(`Failed to send message to user ${telegramId}: ${error}`);
            }
            return false;
        }
    }

    /**
     * Process broadcast - sends to all users with batching
     */
    static async processBroadcast(broadcastId: number): Promise<{ success: number; failed: number }> {
        const broadcast = await this.getBroadcastById(broadcastId);

        if (!broadcast) {
            throw new Error('Broadcast not found');
        }

        await this.updateBroadcastStatus(broadcastId, 'in_progress');

        const users = await this.getRecipientUsers(broadcast.target_type, broadcast.target_user_id);
        let successCount = 0;
        let failedCount = 0;

        const batchSize = config.BROADCAST_BATCH_SIZE;
        const delay = config.BROADCAST_DELAY_MS;

        for (let i = 0; i < users.length; i += batchSize) {
            const batch = users.slice(i, i + batchSize);

            const promises = batch.map(async (user) => {
                const success = await this.sendToUser(
                    user.telegram_id,
                    broadcast.message_text || '',
                    broadcast.photo_file_id ?? undefined
                );
                if (success) {
                    successCount++;
                } else {
                    failedCount++;
                }
            });

            await Promise.all(promises);

            // Update progress periodically
            if (i % (batchSize * 5) === 0) {
                await this.updateBroadcastStatus(broadcastId, 'in_progress', successCount, failedCount);
            }

            // Delay between batches
            if (i + batchSize < users.length) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        await this.updateBroadcastStatus(broadcastId, 'completed', successCount, failedCount);

        logger.info(`Broadcast ${broadcastId} completed: ${successCount}/${users.length} successful`);

        return { success: successCount, failed: failedCount };
    }

    static async getDueScheduledBroadcasts(now: Date = new Date()): Promise<ScheduledBroadcast[]> {
        const today = getTashkentDateKey(now);
        const weekDay = getTashkentWeekDay(now);
        const time = getTashkentTimeKey(now);

        return db('scheduled_broadcasts')
            .where({
                is_active: true,
                week_day: weekDay,
                scheduled_time: time,
            })
            .where((builder) => {
                builder.whereNull('last_run_date').orWhere('last_run_date', '<>', today);
            })
            .orderBy('id', 'asc');
    }

    private static async claimScheduledBroadcastRun(
        scheduledBroadcastId: number,
        today: string,
        now: Date
    ): Promise<boolean> {
        const updated = await db('scheduled_broadcasts')
            .where({
                id: scheduledBroadcastId,
                is_active: true,
            })
            .where((builder) => {
                builder.whereNull('last_run_date').orWhere('last_run_date', '<>', today);
            })
            .update({
                last_run_date: today,
                last_run_at: now,
                updated_at: now,
            });

        return updated > 0;
    }

    private static async processScheduledBroadcast(
        scheduledBroadcast: ScheduledBroadcast
    ): Promise<{ broadcastId: number; success: number; failed: number }> {
        const broadcast = await this.createBroadcast({
            adminTelegramId: scheduledBroadcast.admin_telegram_id,
            messageText: scheduledBroadcast.message_text || undefined,
            photoFileId: scheduledBroadcast.photo_file_id || undefined,
            targetType: scheduledBroadcast.target_type,
            targetUserId: scheduledBroadcast.target_user_id || undefined,
        });

        await db('scheduled_broadcasts')
            .where('id', scheduledBroadcast.id)
            .update({
                last_broadcast_message_id: broadcast.id,
                updated_at: new Date(),
            });

        try {
            const result = await this.processBroadcast(broadcast.id);
            return {
                broadcastId: broadcast.id,
                success: result.success,
                failed: result.failed,
            };
        } catch (error) {
            await this.updateBroadcastStatus(broadcast.id, 'failed');
            throw error;
        }
    }

    static async processDueScheduledBroadcasts(now: Date = new Date()): Promise<{
        checked: number;
        processed: number;
        failed: number;
    }> {
        const dueBroadcasts = await this.getDueScheduledBroadcasts(now);
        const today = getTashkentDateKey(now);
        let processed = 0;
        let failed = 0;

        for (const scheduledBroadcast of dueBroadcasts) {
            const claimed = await this.claimScheduledBroadcastRun(scheduledBroadcast.id, today, now);
            if (!claimed) {
                continue;
            }

            try {
                const result = await this.processScheduledBroadcast(scheduledBroadcast);
                processed++;
                logger.info(
                    `[SCHEDULED_BROADCAST] Scheduled broadcast ${scheduledBroadcast.id} created broadcast ${result.broadcastId}: ${result.success} successful, ${result.failed} failed`,
                );
            } catch (error) {
                failed++;
                logger.error(
                    `[SCHEDULED_BROADCAST] Scheduled broadcast ${scheduledBroadcast.id} failed`,
                    error,
                );
            }
        }

        return {
            checked: dueBroadcasts.length,
            processed,
            failed,
        };
    }

    /**
     * Get broadcast statistics
     */
    static async getBroadcastStats(): Promise<{
        total: number;
        pending: number;
        inProgress: number;
        completed: number;
        failed: number;
    }> {
        const stats = await db('broadcast_messages')
            .select('status')
            .count('id as count')
            .groupBy('status');

        const result = { total: 0, pending: 0, inProgress: 0, completed: 0, failed: 0 };

        for (const row of stats) {
            const count = parseInt(row.count as string, 10);
            result.total += count;
            if (row.status === 'pending') result.pending = count;
            if (row.status === 'in_progress') result.inProgress = count;
            if (row.status === 'completed') result.completed = count;
            if (row.status === 'failed') result.failed = count;
        }

        return result;
    }
}
