import { BotConversation, BotContext } from '../types/context';
import { Keyboard } from 'grammy';
import { getMainKeyboardByLocale, getSupportTicketKeyboard } from '../keyboards';
import { getAdminMenuKeyboard } from '../keyboards/admin.keyboards';
import { i18n } from '../i18n';
import { UserService } from '../services/user.service';
import { SupportService } from '../services/support.service';
import { logger } from '../utils/logger';
import { getLocaleFromConversation } from '../utils/locale';
import { config } from '../config';
import { bot } from '../bot';
import { formatUzPhone } from '../utils/uz-phone.util';

/**
 * Format user support message for admin group
 */
function formatAdminGroupMessage(
    ticketNumber: string,
    user: {
        first_name?: string;
        last_name?: string;
        phone_number?: string;
        telegram_id: number;
        username?: string;
        sap_card_code?: string;
        language_code: string;
    },
    messageText: string,
    createdAt: Date
): string {
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || i18n.t(user.language_code, 'admin_unknown_user');
    const phone = formatUzPhone(user.phone_number);
    const username = user.username ? `@${user.username}` : i18n.t(user.language_code, 'admin_no');
    const sapCode = user.sap_card_code || i18n.t(user.language_code, 'admin_no');
    const language = user.language_code === 'ru' ? i18n.t('ru', 'ru_button') : i18n.t('uz', 'uz_button');
    const dateStr = createdAt.toLocaleString('uz-UZ', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });

    return `📩 Yangi murojaat #${ticketNumber}

👤 Foydalanuvchi: ${fullName}
📱 Telefon: ${phone}
🆔 Telegram: ${username} (ID: ${user.telegram_id})
💼 SAP Kod: ${sapCode}
🌐 Til: ${language}
📅 Sana: ${dateStr}

━━━━━━━━━━━━━━━━━━━━━━━━

💬 Xabar:
${messageText}`;
}

/**
 * Support Conversation - Handles user support requests
 */
export async function supportConversation(conversation: BotConversation, ctx: BotContext) {
    const locale = await getLocaleFromConversation(conversation);
    try {
        const telegramId = ctx.from?.id;

        if (!telegramId) {
            logger.error('Support conversation: No telegram ID found');
            return;
        }

        // 1. Get user data (includes ban status)
        const user = await conversation.external(() =>
            UserService.getUserByTelegramId(telegramId)
        );

        if (!user) {
            // User not registered, shouldn't happen but handle gracefully
            await ctx.reply(i18n.t(locale, 'support_not_registered'), {
                reply_markup: getMainKeyboardByLocale(locale),
            });
            return;
        }

        // 2. Check if user is banned from support
        if (user.is_support_banned) {
            const isAdmin = user.is_admin || false;

            if (isAdmin) {
                await ctx.reply(i18n.t(locale, 'admin_menu_header'), {
                    reply_markup: getAdminMenuKeyboard(locale),
                });
            } else {
                await ctx.reply(i18n.t(locale, 'support_banned'), {
                    reply_markup: getMainKeyboardByLocale(locale),
                });
            }
            return;
        }

        // 3. Show cancel keyboard and ask for message
        const cancelKeyboard = new Keyboard()
            .text(i18n.t(locale, 'support_cancel'))
            .resized()
            .oneTime();

        await ctx.reply(i18n.t(locale, 'support_ask_message'), {
            reply_markup: cancelKeyboard,
        });

        // 4. Wait for user's message (text or photo)
        while (true) {
            const messageContext = await conversation.wait();
            const message = messageContext.message;

            // Check for cancel
            if (message?.text === i18n.t(locale, 'support_cancel') ||
                message?.text === '/start' ||
                message?.text === i18n.t(locale, 'menu_contracts') ||
                message?.text === i18n.t(locale, 'menu_payments') ||
                message?.text === i18n.t(locale, 'menu_settings') ||
                message?.text === i18n.t(locale, 'menu_support')) {

                if (user?.is_admin) {
                    await messageContext.reply(i18n.t(locale, 'admin_menu_header'), {
                        reply_markup: getAdminMenuKeyboard(locale),
                    });
                } else {
                    const isLoggedIn = user ? !user.is_logged_out : false;
                    await messageContext.reply(i18n.t(locale, 'welcome_message'), {
                        reply_markup: getMainKeyboardByLocale(locale, false, isLoggedIn),
                    });
                }
                return;
            }

            // Check for text message
            if (message?.text) {
                await processSupport(
                    conversation,
                    messageContext,
                    user,
                    message.text,
                    message.message_id,
                    undefined,
                    locale
                );
                return;
            }

            // Check for photo with caption
            if (message?.photo) {
                const photoFileId = message.photo[message.photo.length - 1].file_id;
                const caption = message.caption || `[${i18n.t(locale, 'admin_broadcast_enter_message')}]`;

                await processSupport(
                    conversation,
                    messageContext,
                    user,
                    caption,
                    message.message_id,
                    photoFileId,
                    locale
                );
                return;
            }

            // Invalid input, ask again
            await messageContext.reply(i18n.t(locale, 'support_ask_message'), {
                reply_markup: cancelKeyboard,
            });
        }
    } catch (error) {
        logger.error('Error in support conversation:', error);
        await ctx.reply(i18n.t(locale, 'support_error'), {
            reply_markup: getMainKeyboardByLocale(locale),
        });
    }
}

/**
 * Process support request: create ticket and forward to admin group
 */
async function processSupport(
    conversation: BotConversation,
    ctx: BotContext,
    user: Awaited<ReturnType<typeof UserService.getUserByTelegramId>>,
    messageText: string,
    messageId: number,
    photoFileId: string | undefined,
    locale: string
): Promise<void> {
    if (!user) return;

    try {
        // 1. Create the ticket
        const ticket = await conversation.external(() =>
            SupportService.createTicket({
                userTelegramId: user.telegram_id,
                messageText,
                messageId,
                photoFileId,
            })
        );

        logger.info(`Created support ticket ${ticket.ticket_number} for user ${user.telegram_id}`);

        // 2. Format message for admin group
        const adminMessage = formatAdminGroupMessage(
            ticket.ticket_number,
            {
                first_name: user.first_name ?? undefined,
                last_name: user.last_name ?? undefined,
                phone_number: user.phone_number ?? undefined,
                telegram_id: user.telegram_id,
                username: user.username ?? undefined,
                sap_card_code: user.sap_card_code ?? undefined,
                language_code: user.language_code,
            },
            messageText,
            ticket.created_at
        );

        // 3. Send to admin group
        const adminGroupId = config.ADMIN_GROUP_ID;

        if (!adminGroupId) {
            logger.error('ADMIN_GROUP_ID not configured');
            await ctx.reply(i18n.t(locale, 'support_sent'), {
                reply_markup: getMainKeyboardByLocale(locale),
            });
            return;
        }

        let groupMessage;

        if (photoFileId) {
            // Send photo with caption and buttons
            groupMessage = await bot.api.sendPhoto(adminGroupId, photoFileId, {
                caption: adminMessage,
                reply_markup: getSupportTicketKeyboard(ticket.ticket_number, locale),
            });
        } else {
            // Send text message with buttons
            groupMessage = await bot.api.sendMessage(adminGroupId, adminMessage, {
                reply_markup: getSupportTicketKeyboard(ticket.ticket_number, locale),
            });
        }

        // 4. Update ticket with group message ID
        await conversation.external(() =>
            SupportService.updateGroupMessageId(ticket.id, groupMessage.message_id)
        );

        logger.info(`Forwarded ticket ${ticket.ticket_number} to admin group, message ID: ${groupMessage.message_id}`);

        // 5. Confirm to user
        if (user?.is_admin) {
            await ctx.reply(i18n.t(locale, 'support_sent') + "\n\n" + i18n.t(locale, 'admin_menu_header'), {
                reply_markup: getAdminMenuKeyboard(locale),
            });
        } else {
            const isLoggedIn = user ? !user.is_logged_out : false;
            await ctx.reply(i18n.t(locale, 'support_sent'), {
                reply_markup: getMainKeyboardByLocale(locale, false, isLoggedIn),
            });
        }

    } catch (error) {
        logger.error('Error processing support request:', error);
        const isAdmin = user?.is_admin || false;
        if (isAdmin) {
            await ctx.reply(i18n.t(locale, 'admin_error'), {
                reply_markup: getAdminMenuKeyboard(locale),
            });
        } else {
            const isLoggedIn = user ? !user.is_logged_out : false;
            await ctx.reply(i18n.t(locale, 'support_error'), {
                reply_markup: getMainKeyboardByLocale(locale, false, isLoggedIn),
            });
        }
    }
}
