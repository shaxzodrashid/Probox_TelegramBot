import { BotConversation, BotContext } from '../types/context';
import { SupportService } from '../services/support.service';
import { LockService } from '../services/lock.service';
import { UserService } from '../services/user.service';
import { redisService } from '../redis/redis.service';
import { getSupportTicketRepliedKeyboard, getAdminReplyCancelKeyboard } from '../keyboards';
import { logger } from '../utils/logger';
import { isUserBlockedError } from '../utils/telegram-errors';
import { bot } from '../bot';
import { config } from '../config';
import { i18n } from '../i18n';

// Redis key prefix for admin reply session data (must match handler)
const ADMIN_REPLY_KEY_PREFIX = 'admin:reply:';

// Interface for Redis-stored reply session data
interface AdminReplySession {
    ticketNumber: string;
    ticketId: number;
}

/**
 * Format the updated message for admin group after reply
 */
function formatRepliedMessage(
    originalMessage: string,
    ticketNumber: string,
    adminName: string,
    repliedAt: Date
): string {
    const dateStr = repliedAt.toLocaleString('uz-UZ', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });

    // Find where the message text starts and extract the header portion
    const lines = originalMessage.split('\n');
    const headerEndIndex = lines.findIndex(line => line.includes('━━━━━━'));

    let header = '';
    if (headerEndIndex > 0) {
        header = lines.slice(0, headerEndIndex).join('\n');
    } else {
        header = lines.slice(0, 8).join('\n');
    }

    // Replace the first line with replied status
    header = header.replace(
        /📩 Yangi murojaat #\w+/,
        `📩 Murojaat #${ticketNumber} ✅ JAVOB BERILDI`
    );

    return `${header}

━━━━━━━━━━━━━━━━━━━━━━━━

✅ Javob berildi: ${adminName}
   🕐 ${dateStr}`;
}

/**
 * Admin Reply Conversation
 * Handles the admin reply flow with locking
 */
export async function adminReplyConversation(
    conversation: BotConversation,
    ctx: BotContext
): Promise<void> {
    const adminId = ctx.from?.id;

    if (!adminId) {
        logger.error('Admin reply conversation: Missing admin ID');
        return;
    }

    // Get ticket info from Redis (set by handler before entering conversation)
    const replySessionKey = `${ADMIN_REPLY_KEY_PREFIX}${adminId}`;
    const replySession = await conversation.external(() =>
        redisService.get<AdminReplySession>(replySessionKey)
    );

    if (!replySession || !replySession.ticketNumber || !replySession.ticketId) {
        logger.error('Admin reply conversation: Missing ticket info in Redis');
        await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.', {
            reply_markup: { remove_keyboard: true }
        });
        return;
    }

    const ticketNumber = replySession.ticketNumber;
    const ticketId = replySession.ticketId;

    // Clean up Redis key
    await conversation.external(() =>
        redisService.delete(replySessionKey)
    );


    // Get ticket to verify it's still open
    const ticket = await conversation.external(() =>
        SupportService.getTicketById(ticketId)
    );

    if (!ticket || ticket.status !== 'open') {
        await ctx.reply(i18n.t('uz', 'admin-already-replied'));
        // Release lock
        await conversation.external(() =>
            LockService.releaseReplyLock(ticketId, adminId)
        );
        return;
    }

    // Get user to determine their locale
    const user = await conversation.external(() =>
        UserService.getUserByTelegramId(ticket.user_telegram_id)
    );

    if (!user) {
        await ctx.reply(i18n.t('uz', 'admin-ticket-not-found'));
        await conversation.external(() =>
            LockService.releaseReplyLock(ticketId, adminId)
        );
        return;
    }

    const userLocale = user.language_code || 'uz';

    // Show cancel keyboard and ask for message
    const cancelKeyboard = getAdminReplyCancelKeyboard();

    await ctx.reply(i18n.t('uz', 'admin-reply-ask-message'), {
        reply_markup: cancelKeyboard,
    });

    // Wait for admin's reply message
    while (true) {
        const messageContext = await conversation.wait();
        const message = messageContext.message;

        // Check for cancel
        if (message?.text === '🔙 Bekor qilish' ||
            message?.text === '🔙 Отмена' ||
            message?.text === '/cancel') {

            // Release lock
            await conversation.external(() =>
                LockService.releaseReplyLock(ticketId, adminId)
            );

            await messageContext.reply('❌ Javob bekor qilindi.', {
                reply_markup: { remove_keyboard: true }
            });

            logger.info(`Admin ${adminId} cancelled reply to ticket ${ticketNumber}`);
            return;
        }

        // Check for text message
        if (message?.text) {
            await processReply(
                conversation,
                messageContext,
                ticket,
                user,
                message.text,
                undefined,
                adminId,
                userLocale
            );
            return;
        }

        // Check for photo with caption
        if (message?.photo) {
            const photoFileId = message.photo[message.photo.length - 1].file_id;
            const caption = message.caption || '';

            await processReply(
                conversation,
                messageContext,
                ticket,
                user,
                caption,
                photoFileId,
                adminId,
                userLocale
            );
            return;
        }

        // Check if lock expired
        const stillHoldsLock = await conversation.external(() =>
            LockService.getLockHolder(ticketId)
        );

        if (stillHoldsLock !== adminId) {
            await messageContext.reply(i18n.t('uz', 'admin-lock-expired'), {
                reply_markup: { remove_keyboard: true }
            });
            return;
        }

        // Extend lock while waiting
        await conversation.external(() =>
            LockService.extendLock(ticketId, adminId)
        );

        // Invalid input, ask again
        await messageContext.reply(i18n.t('uz', 'admin-reply-ask-message'), {
            reply_markup: cancelKeyboard,
        });
    }
}

/**
 * Process the admin reply: send to user, update ticket, update group message
 */
async function processReply(
    conversation: BotConversation,
    ctx: BotContext,
    ticket: NonNullable<Awaited<ReturnType<typeof SupportService.getTicketById>>>,
    user: NonNullable<Awaited<ReturnType<typeof UserService.getUserByTelegramId>>>,
    replyText: string,
    photoFileId: string | undefined,
    adminId: number,
    userLocale: string
): Promise<void> {
    try {
        // 1. Confirm reply (prevents duplicate processing)
        const confirmed = await conversation.external(() =>
            LockService.confirmReply(ticket.id)
        );

        if (!confirmed) {
            // Reply was already confirmed by someone else
            await ctx.reply(i18n.t('uz', 'admin-already-replied'), {
                reply_markup: { remove_keyboard: true }
            });
            return;
        }

        // 2. Get admin info for the message
        const admin = await conversation.external(() =>
            UserService.getUserByTelegramId(adminId)
        );
        const adminName = admin
            ? `${admin.first_name || ''} ${admin.last_name || ''}`.trim() || 'Admin'
            : 'Admin';

        // 3. Mark ticket as replied in database
        await conversation.external(() =>
            SupportService.markAsReplied(ticket.id, adminId, replyText)
        );

        // 4. Send reply to user
        const userNotification = i18n.t(userLocale, 'support-reply-received', {
            ticket: ticket.ticket_number
        });

        const fullReplyMessage = `${userNotification}\n\n${replyText}`;

        try {
            if (photoFileId) {
                await bot.api.sendPhoto(ticket.user_telegram_id, photoFileId, {
                    caption: fullReplyMessage,
                    parse_mode: 'Markdown'
                });
            } else {
                await bot.api.sendMessage(ticket.user_telegram_id, fullReplyMessage, {
                    parse_mode: 'Markdown'
                });
            }
            logger.info(`Reply sent to user ${ticket.user_telegram_id} for ticket ${ticket.ticket_number}`);

            // Should unblock user if they were strictly blocked but now we can send messages
            await conversation.external(() =>
                UserService.unblockUserIfBlocked(ticket.user_telegram_id)
            );
        } catch (error) {
            // Check if the user has blocked the bot
            if (isUserBlockedError(error)) {
                logger.info(`User ${ticket.user_telegram_id} has blocked the bot - marking as blocked in database`);
                try {
                    await conversation.external(() =>
                        UserService.markUserAsBlocked(ticket.user_telegram_id)
                    );
                    // Notify admin that user has blocked the bot
                    await ctx.reply(`⚠️ Foydalanuvchi botni bloklagan. Xabar yetkazilmadi, lekin murojaat javob berilgan deb belgilandi.`);
                } catch (dbError) {
                    logger.error(`Failed to mark user ${ticket.user_telegram_id} as blocked:`, dbError);
                }
            } else {
                logger.error(`Failed to send reply to user ${ticket.user_telegram_id}:`, error);
            }
            // Continue anyway - the ticket is marked as replied
        }

        // 5. Update the message in admin group
        if (ticket.group_message_id && config.ADMIN_GROUP_ID) {
            try {
                // Get original message to format the updated version
                const repliedMessage = formatRepliedMessage(
                    ticket.message_text,
                    ticket.ticket_number,
                    adminName,
                    new Date()
                );

                if (ticket.photo_file_id) {
                    await bot.api.editMessageCaption(
                        config.ADMIN_GROUP_ID,
                        ticket.group_message_id,
                        {
                            caption: repliedMessage,
                            reply_markup: getSupportTicketRepliedKeyboard(ticket.ticket_number)
                        }
                    );
                } else {
                    await bot.api.editMessageText(
                        config.ADMIN_GROUP_ID,
                        ticket.group_message_id,
                        repliedMessage,
                        {
                            reply_markup: getSupportTicketRepliedKeyboard(ticket.ticket_number)
                        }
                    );
                }
                logger.info(`Updated admin group message for ticket ${ticket.ticket_number}`);
            } catch (error) {
                logger.error('Failed to update admin group message:', error);
            }
        }

        // 6. Release lock
        await conversation.external(() =>
            LockService.releaseReplyLock(ticket.id, adminId)
        );

        // 7. Confirm to admin
        await ctx.reply(i18n.t('uz', 'admin-reply-sent'), {
            reply_markup: { remove_keyboard: true }
        });

        logger.info(`Ticket ${ticket.ticket_number} replied by admin ${adminId}`);

    } catch (error) {
        logger.error('Error processing admin reply:', error);
        await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.', {
            reply_markup: { remove_keyboard: true }
        });

        // Release lock on error
        await conversation.external(() =>
            LockService.releaseReplyLock(ticket.id, adminId)
        );
    }
}
