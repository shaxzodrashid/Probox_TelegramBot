import db from '../database/database';
import { BroadcastMessage, CreateBroadcastParams, BroadcastStatus } from '../types/support.types';
import { AdminService } from './admin.service';
import { UserService } from './user.service';
import { config } from '../config';
import { logger } from '../utils/logger';
import { isUserBlockedError } from '../utils/telegram-errors';
import { bot } from '../bot';

/**
 * BroadcastService - Broadcasting logic for admin messages
 */
export class BroadcastService {
    /**
     * Create a broadcast record
     */
    static async createBroadcast(params: CreateBroadcastParams): Promise<BroadcastMessage> {
        const { adminTelegramId, messageText, photoFileId, targetType, targetUserId } = params;

        let totalRecipients = 1;
        if (targetType === 'all') {
            totalRecipients = await AdminService.getUserCount();
        }

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
                    caption: message,
                    parse_mode: 'Markdown',
                });
            } else {
                await bot.api.sendMessage(telegramId, message, {
                    parse_mode: 'Markdown',
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

        const users = await AdminService.getAllUsers();
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
