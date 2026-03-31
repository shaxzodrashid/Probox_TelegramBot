import { BotContext } from '../types/context';
import { SupportService } from '../services/support.service';
import { i18n } from '../i18n';
import { config } from '../config';
import { logger } from '../utils/logger';
import { formatUzPhone } from './uz-phone.util';
import { escapeHtml } from './telegram-rich-text.util';
import { getSupportTicketKeyboard, getMainKeyboardByLocale } from '../keyboards';
import { getAdminMenuKeyboard } from '../keyboards/admin.keyboards';
import { Api, RawApi } from 'grammy';

/**
 * Format user support message for admin group
 */
export function formatAdminGroupMessage(
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
    const fullName = escapeHtml(`${user.first_name || ''} ${user.last_name || ''}`.trim() || i18n.t(user.language_code, 'admin_unknown_user'));
    const phone = escapeHtml(formatUzPhone(user.phone_number));
    const username = user.username ? `<b>@${escapeHtml(user.username)}</b>` : i18n.t(user.language_code, 'admin_no');
    const sapCode = escapeHtml(user.sap_card_code || i18n.t(user.language_code, 'admin_no'));
    const language = user.language_code === 'ru' ? i18n.t('ru', 'ru_button') : i18n.t('uz', 'uz_button');
    const dateStr = escapeHtml(createdAt.toLocaleString('uz-UZ', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    }));

    return `📩 <b>Yangi murojaat #${escapeHtml(ticketNumber)}</b>
    
👤 <b>Foydalanuvchi:</b> ${fullName}
📱 <b>Telefon:</b> ${phone}
🆔 <b>Telegram:</b> ${username} (ID: <code>${escapeHtml(user.telegram_id.toString())}</code>)
💼 <b>SAP Kod:</b> ${sapCode}
🌐 <b>Til:</b> ${language}
📅 <b>Sana:</b> ${dateStr}

━━━━━━━━━━━━━━━━━━━━━━━━

💬 <b>Xabar:</b>
${escapeHtml(messageText)}`;
}

/**
 * Shared logic to process a support request: create ticket and forward to admin group
 */
export async function processSupportRequest(
    api: Api<RawApi>,
    ctx: BotContext,
    user: any,
    messageText: string,
    messageId: number,
    photoFileId: string | undefined,
    locale: string,
    isExternal: boolean = false
): Promise<void> {
    if (!user) return;

    try {
        // 1. Create the ticket
        const ticket = await SupportService.createTicket({
            userTelegramId: user.telegram_id,
            messageText,
            messageId,
            photoFileId,
        });

        logger.info(`Created support ticket ${ticket.ticket_number} for user ${user.telegram_id}`);

        // 2. Format message for admin group
        const adminMessage = formatAdminGroupMessage(
            ticket.ticket_number,
            {
                first_name: user.first_name ?? undefined,
                last_name: user.last_name ?? undefined,
                phone_number: user.phone_number ?? undefined,
                telegram_id: user.telegram_id,
                username: ctx.from?.username ?? undefined,
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
            const isLoggedIn = user ? !user.is_logged_out : false;
            await ctx.reply(i18n.t(locale, 'support_sent'), {
                reply_markup: getMainKeyboardByLocale(locale, false, isLoggedIn),
            });
            return;
        }

        let groupMessage;

        if (photoFileId) {
            // Send photo with caption and buttons
            groupMessage = await api.sendPhoto(adminGroupId, photoFileId, {
                caption: adminMessage,
                parse_mode: 'HTML',
                reply_markup: getSupportTicketKeyboard(ticket.ticket_number, locale),
            });
        } else {
            // Send text message with buttons
            groupMessage = await api.sendMessage(adminGroupId, adminMessage, {
                parse_mode: 'HTML',
                reply_markup: getSupportTicketKeyboard(ticket.ticket_number, locale),
            });
        }

        // 4. Update ticket with group message ID
        await SupportService.updateGroupMessageId(ticket.id, groupMessage.message_id);

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
        throw error; // Rethrow to let conversation handle it if needed
    }
}
