import { BotContext } from '../types/context';
import { SupportService } from '../services/support.service';
import { AdminService } from '../services/admin.service';
import { LockService } from '../services/lock.service';
import { UserService } from '../services/user.service';
import { redisService } from '../redis/redis.service';
import { logger } from '../utils/logger';
import { bot } from '../bot';
import { config } from '../config';
import { i18n } from '../i18n';

// Redis key prefix for admin reply session data
const ADMIN_REPLY_KEY_PREFIX = 'admin:reply:';



/**
 * Handler for Reply button click in admin group
 * Attempts to acquire lock and starts reply conversation
 */
export async function handleReplyButton(ctx: BotContext): Promise<void> {
    try {
        await ctx.answerCallbackQuery();

        const callbackData = ctx.callbackQuery?.data;
        if (!callbackData) return;

        const ticketNumber = callbackData.replace('support_reply:', '');
        const adminId = ctx.from?.id;

        if (!adminId) return;

        // Get ticket
        const ticket = await SupportService.getTicketByTicketNumber(ticketNumber);

        if (!ticket) {
            await ctx.reply(i18n.t('uz', 'admin-ticket-not-found'));
            return;
        }

        // Check if already replied
        if (ticket.status === 'replied') {
            await ctx.reply(i18n.t('uz', 'admin-already-replied'));
            return;
        }

        if (ticket.status === 'closed') {
            await ctx.reply(i18n.t('uz', 'admin-ticket-closed'));
            return;
        }

        // Try to acquire lock
        const lockAcquired = await LockService.acquireReplyLock(ticket.id, adminId);

        if (!lockAcquired) {
            // Another admin is replying
            const lockHolder = await LockService.getLockHolder(ticket.id);
            await ctx.reply(i18n.t('uz', 'admin-another-replying'));
            logger.info(`Admin ${adminId} blocked from replying to ticket ${ticketNumber} - lock held by ${lockHolder}`);
            return;
        }

        logger.info(`Admin ${adminId} acquired lock for ticket ${ticketNumber}`);

        // Store ticket info in Redis for the conversation (TTL: 5 minutes)
        const replySessionKey = `${ADMIN_REPLY_KEY_PREFIX}${adminId}`;
        await redisService.set(replySessionKey, {
            ticketNumber: ticketNumber,
            ticketId: ticket.id
        }, 300); // 5 minutes TTL

        // Enter the reply conversation
        await ctx.conversation.enter('adminReplyConversation');
    } catch (error) {
        logger.error('Error in handleReplyButton:', error);
        await ctx.reply(i18n.t('uz', 'admin-error'));
    }
}


/**
 * Handler for Close button click in admin group
 * Closes the ticket without a reply
 */
export async function handleCloseButton(ctx: BotContext): Promise<void> {
    try {
        await ctx.answerCallbackQuery();

        const callbackData = ctx.callbackQuery?.data;
        if (!callbackData) return;

        const ticketNumber = callbackData.replace('support_close:', '');
        const adminId = ctx.from?.id;

        if (!adminId) return;

        // Get ticket
        const ticket = await SupportService.getTicketByTicketNumber(ticketNumber);

        if (!ticket) {
            await ctx.reply(i18n.t('uz', 'admin-ticket-not-found'));
            return;
        }

        if (ticket.status === 'closed') {
            await ctx.reply(i18n.t('uz', 'admin-ticket-closed'));
            return;
        }

        // Close the ticket
        const closed = await SupportService.closeTicket(ticket.id);

        if (closed) {
            await ctx.reply(i18n.t('uz', 'admin-ticket-closed'));

            // Update the message in admin group to show closed status
            try {
                if (ticket.group_message_id && config.ADMIN_GROUP_ID) {
                    const closedMessage = `📩 Murojaat #${ticketNumber} ⚫ YOPILDI\n\n✅ Murojaat yopildi.`;

                    if (ticket.photo_file_id) {
                        await bot.api.editMessageCaption(
                            config.ADMIN_GROUP_ID,
                            ticket.group_message_id,
                            { caption: closedMessage }
                        );
                    } else {
                        await bot.api.editMessageText(
                            config.ADMIN_GROUP_ID,
                            ticket.group_message_id,
                            closedMessage,
                            { reply_markup: undefined }
                        );
                    }
                }
            } catch (error) {
                logger.error('Failed to update closed ticket message:', error);
            }

            logger.info(`Ticket ${ticketNumber} closed by admin ${adminId}`);
        }
    } catch (error) {
        logger.error('Error in handleCloseButton:', error);
        await ctx.reply(i18n.t('uz', 'admin-error'));
    }
}

/**
 * Handler for Block button click in admin group
 * Bans the user from using support
 */
export async function handleBlockButton(ctx: BotContext): Promise<void> {
    try {
        await ctx.answerCallbackQuery();

        const callbackData = ctx.callbackQuery?.data;
        if (!callbackData) return;

        const ticketNumber = callbackData.replace('support_block:', '');
        const adminId = ctx.from?.id;

        if (!adminId) return;

        // Get ticket
        const ticket = await SupportService.getTicketByTicketNumber(ticketNumber);

        if (!ticket) {
            await ctx.reply(i18n.t('uz', 'admin-ticket-not-found'));
            return;
        }

        // Get user to check current ban status
        const user = await UserService.getUserByTelegramId(ticket.user_telegram_id);

        if (!user) {
            await ctx.reply(i18n.t('uz', 'admin-ticket-not-found'));
            return;
        }

        // Toggle ban status
        const newBanStatus = !user.is_support_banned;
        await AdminService.banUserFromSupport(ticket.user_telegram_id, newBanStatus);

        if (newBanStatus) {
            await ctx.reply(i18n.t('uz', 'admin-user-blocked'));
        } else {
            await ctx.reply(i18n.t('uz', 'admin-user-unblocked'));
        }

        logger.info(`User ${ticket.user_telegram_id} support ${newBanStatus ? 'banned' : 'unbanned'} by admin ${adminId}`);
    } catch (error) {
        logger.error('Error in handleBlockButton:', error);
        await ctx.reply(i18n.t('uz', 'admin-error'));
    }
}

/**
 * Handler for View Reply button click
 * Shows the reply that was sent
 */
export async function handleViewReplyButton(ctx: BotContext): Promise<void> {
    try {
        await ctx.answerCallbackQuery();

        const callbackData = ctx.callbackQuery?.data;
        if (!callbackData) return;

        const ticketNumber = callbackData.replace('support_view_reply:', '');

        // Get ticket
        const ticket = await SupportService.getTicketByTicketNumber(ticketNumber);

        if (!ticket) {
            await ctx.reply(i18n.t('uz', 'admin-ticket-not-found'));
            return;
        }

        if (!ticket.reply_message) {
            await ctx.reply('Javob topilmadi.');
            return;
        }

        // Get admin who replied
        let adminName = 'Nomaʼlum';
        if (ticket.replied_by_admin_id) {
            const admin = await UserService.getUserByTelegramId(ticket.replied_by_admin_id);
            if (admin) {
                adminName = `${admin.first_name || ''} ${admin.last_name || ''}`.trim() || 'Admin';
            }
        }

        const repliedAt = ticket.replied_at
            ? new Date(ticket.replied_at).toLocaleString('uz-UZ', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            })
            : 'N/A';

        const replyInfo = `📜 Javob #${ticketNumber}\n\n👤 Javob berdi: ${adminName}\n🕐 Vaqt: ${repliedAt}\n\n💬 Javob:\n${ticket.reply_message}`;

        await ctx.reply(replyInfo);
    } catch (error) {
        logger.error('Error in handleViewReplyButton:', error);
        await ctx.reply(i18n.t('uz', 'admin-error'));
    }
}
