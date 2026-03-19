import { BotContext } from '../types/context';
import { AdminService } from '../services/admin.service';
import { ExportService } from '../services/export.service';
import { SupportService } from '../services/support.service';
import { UserService } from '../services/user.service';
import { InputFile } from 'grammy';
import {
    getAdminMenuKeyboard,
    getAdminUsersKeyboard,
    getAdminUserDetailKeyboard,
} from '../keyboards/admin.keyboards';
import { getMainKeyboardByLocale } from '../keyboards';
import { i18n } from '../i18n';
import { logger } from '../utils/logger';
import { isCallbackQueryExpiredError, isMessageToDeleteNotFoundError } from '../utils/telegram-errors';
import { formatUzPhone } from '../utils/uz-phone.util';

/**
 * Check if user is an admin
 */
const requireAdmin = async (ctx: BotContext): Promise<boolean> => {
    try {
        const user = await UserService.getUserByTelegramId(ctx.from!.id);
        if (!user?.is_admin) {
            const locale = getLocale(ctx);
            await ctx.reply(i18n.t(locale, 'admin_access_denied'));
            return false;
        }
        return true;
    } catch (error) {
        logger.error('Error in requireAdmin:', error);
        return false;
    }
};

/**
 * Get locale from context or session
 */
const getLocale = (ctx: BotContext): string => {
    return ctx.session?.__language_code || 'uz';
};

/**
 * Admin panel menu handler
 */
export const adminMenuHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);

        await ctx.reply(
            i18n.t(locale, 'admin_menu_header'),
            { reply_markup: getAdminMenuKeyboard(locale) }
        );
    } catch (error) {
        logger.error('Error in adminMenuHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

/**
 * Admin users list handler
 */
export const adminUsersHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);
        const page = 1;

        await showUsersList(ctx, page, locale);
    } catch (error) {
        logger.error('Error in adminUsersHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

/**
 * Admin users pagination handler
 */
export const adminUsersPaginationHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);
        const callbackData = ctx.callbackQuery?.data || '';
        const page = parseInt(callbackData.split(':')[1], 10) || 1;

        await ctx.answerCallbackQuery().catch((err) => {
            if (!isCallbackQueryExpiredError(err)) throw err;
        });
        await showUsersList(ctx, page, locale, true);
    } catch (error) {
        logger.error('Error in adminUsersPaginationHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

/**
 * Show users list with pagination
 */
const showUsersList = async (
    ctx: BotContext,
    page: number,
    locale: string,
    edit: boolean = false
) => {
    try {
        const result = await AdminService.getUsers(page, 10, { isAdmin: false });

        let message = `${i18n.t(locale, 'admin_users_header')}\n\n`;

        result.data.forEach((user, index) => {
            const num = (page - 1) * 10 + index + 1;
            const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || i18n.t(locale, 'admin_unknown_user');
            const phone = formatUzPhone(user.phone_number);
            const banned = user.is_support_banned ? ' 🚫' : '';

            message += `${num}. *${name}*${banned}\n`;
            message += `   📱 ${phone}\n`;
            message += `   🆔 \`${user.telegram_id}\`\n\n`;
        });

        message += i18n.t(locale, 'admin_users_footer', {
            current: page.toString(),
            total: result.totalPages.toString(),
            count: result.total.toString(),
        });

        const keyboard = getAdminUsersKeyboard(page, result.totalPages, locale);

        if (edit && ctx.callbackQuery) {
            await ctx.editMessageText(message, {
                reply_markup: keyboard,
                parse_mode: 'Markdown',
            }).catch((err) => {
                if (!isMessageToDeleteNotFoundError(err)) throw err;
            });
        } else {
            await ctx.reply(message, {
                reply_markup: keyboard,
                parse_mode: 'Markdown',
            });
        }
    } catch (error) {
        logger.error('Error in showUsersList:', error);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

/**
 * Admin user detail handler
 */
export const adminUserDetailHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);
        const callbackData = ctx.callbackQuery?.data || '';
        const telegramId = parseInt(callbackData.split(':')[1], 10);

        await ctx.answerCallbackQuery().catch((err) => {
            if (!isCallbackQueryExpiredError(err)) throw err;
        });

        const user = await AdminService.getUserDetails(telegramId);

        if (!user) {
            await ctx.reply(i18n.t(locale, 'admin_user_not_found'));
            return;
        }

        const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Unknown';

        let message = `${i18n.t(locale, 'admin_user_detail_header')}\n\n`;
        message += `👤 *${name}*\n`;
        message += `🆔 Telegram: \`${user.telegram_id}\`\n`;
        message += `📱 ${i18n.t(locale, 'admin_phone')}: ${formatUzPhone(user.phone_number)}\n`;
        message += `💼 SAP: ${user.sap_card_code || '-'}\n`;
        message += `🌐 ${i18n.t(locale, 'admin_language')}: ${user.language_code?.toUpperCase() || 'UZ'}\n`;
        message += `👑 ${i18n.t(locale, 'admin_is_admin')}: ${user.is_admin ? i18n.t(locale, 'admin_yes') : i18n.t(locale, 'admin_no')}\n`;
        message += `🚫 ${i18n.t(locale, 'admin_support_banned')}: ${user.is_support_banned ? i18n.t(locale, 'admin_yes') : i18n.t(locale, 'admin_no')}\n`;
        message += `📅 ${i18n.t(locale, 'admin_registered')}: ${new Date(user.created_at).toLocaleDateString('uz-UZ')}\n`;

        const keyboard = getAdminUserDetailKeyboard(
            telegramId,
            user.is_support_banned || false,
            locale
        );

        await ctx.editMessageText(message, {
            reply_markup: keyboard,
            parse_mode: 'Markdown',
        }).catch((err) => {
            if (!isMessageToDeleteNotFoundError(err)) throw err;
        });
    } catch (error) {
        logger.error('Error in adminUserDetailHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

/**
 * Block user from support handler
 */
export const adminBlockSupportHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);
        const callbackData = ctx.callbackQuery?.data || '';
        const telegramId = parseInt(callbackData.split(':')[1], 10);

        // await ctx.answerCallbackQuery(); // Moved inside try allows better error handling if parsing fails? No, parsing is safe enough.

        const result = await AdminService.banUserFromSupport(telegramId, true);

        if (result) {
            await ctx.answerCallbackQuery({ text: i18n.t(locale, 'admin_user_blocked'), show_alert: true }).catch((err) => {
                if (!isCallbackQueryExpiredError(err)) throw err;
            });
            // Refresh the user detail view
            await adminUserDetailHandler(ctx);
        } else {
            await ctx.answerCallbackQuery({ text: i18n.t(locale, 'admin_action_failed'), show_alert: true }).catch((err) => {
                if (!isCallbackQueryExpiredError(err)) throw err;
            });
        }
    } catch (error) {
        logger.error('Error in adminBlockSupportHandler:', error);
        const locale = getLocale(ctx);
        await ctx.answerCallbackQuery({ text: i18n.t(locale, 'admin_error'), show_alert: true }).catch((err) => {
            if (!isCallbackQueryExpiredError(err)) throw err;
        });
    }
};

/**
 * Unblock user from support handler
 */
export const adminUnblockSupportHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);
        const callbackData = ctx.callbackQuery?.data || '';
        const telegramId = parseInt(callbackData.split(':')[1], 10);

        // await ctx.answerCallbackQuery();

        const result = await AdminService.banUserFromSupport(telegramId, false);

        if (result) {
            await ctx.answerCallbackQuery({ text: i18n.t(locale, 'admin_user_unblocked'), show_alert: true }).catch((err) => {
                if (!isCallbackQueryExpiredError(err)) throw err;
            });
            // Refresh the user detail view
            await adminUserDetailHandler(ctx);
        } else {
            await ctx.answerCallbackQuery({ text: i18n.t(locale, 'admin_action_failed'), show_alert: true }).catch((err) => {
                if (!isCallbackQueryExpiredError(err)) throw err;
            });
        }
    } catch (error) {
        logger.error('Error in adminUnblockSupportHandler:', error);
        const locale = getLocale(ctx);
        await ctx.answerCallbackQuery({ text: i18n.t(locale, 'admin_error'), show_alert: true }).catch((err) => {
            if (!isCallbackQueryExpiredError(err)) throw err;
        });
    }
};

/**
 * Admin statistics handler
 */
export const adminStatsHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);

        const userStats = await AdminService.getUserStats();
        const ticketStats = await SupportService.getTicketStats();

        let message = `${i18n.t(locale, 'admin_stats_header')}\n\n`;

        // User statistics
        message += `📊 *${i18n.t(locale, 'admin_stats_users')}*\n`;
        message += `├ ${i18n.t(locale, 'admin_stats_total')}: ${userStats.total}\n`;
        message += `├ ${i18n.t(locale, 'admin_stats_admins')}: ${userStats.admins}\n`;
        message += `├ ${i18n.t(locale, 'admin_stats_with_sap')}: ${userStats.withSapCode}\n`;
        message += `└ ${i18n.t(locale, 'admin_stats_support_banned')}: ${userStats.supportBanned}\n\n`;

        // Ticket statistics
        message += `🎫 *${i18n.t(locale, 'admin_stats_tickets')}*\n`;
        message += `├ ${i18n.t(locale, 'admin_stats_total')}: ${ticketStats.total}\n`;
        message += `├ 🔵 ${i18n.t(locale, 'admin_stats_open')}: ${ticketStats.open}\n`;
        message += `├ 🟢 ${i18n.t(locale, 'admin_stats_replied')}: ${ticketStats.replied}\n`;
        message += `└ ⚫ ${i18n.t(locale, 'admin_stats_closed')}: ${ticketStats.closed}\n`;

        await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
        logger.error('Error in adminStatsHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

/**
 * Admin export handler
 */
export const adminExportHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);
        const adminId = ctx.from!.id;

        // Check rate limit
        const canExport = await ExportService.checkRateLimit(adminId);

        if (!canExport) {
            const remaining = await ExportService.getRateLimitRemaining(adminId);
            const minutes = Math.ceil(remaining / 60);
            await ctx.reply(i18n.t(locale, 'admin_export_rate_limit', { minutes: minutes.toString() }));
            return;
        }

        // Send "generating" message
        const statusMsg = await ctx.reply(i18n.t(locale, 'admin_export_generating'));

        // Generate Excel
        const buffer = await ExportService.exportUsersToExcel();

        // Delete status message
        await ctx.api.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch((err) => {
            if (!isMessageToDeleteNotFoundError(err)) throw err;
        });

        // Send file
        const fileName = `users_${new Date().toISOString().split('T')[0]}.xlsx`;

        await ctx.replyWithDocument(
            new InputFile(buffer, fileName),
            {
                caption: i18n.t(locale, 'admin_export_ready'),
            }
        );

        logger.info(`Admin ${adminId} exported users to Excel`);

    } catch (error) {
        logger.error('Export error:', error);
        const locale = getLocale(ctx); // Re-fetch locale or pass it in? It is available in scope.
        await ctx.reply(i18n.t(locale, 'admin_export_error'));
    }
};

/**
 * Admin back to menu handler
 */
export const adminBackToMenuHandler = async (ctx: BotContext) => {
    try {
        const locale = getLocale(ctx);

        if (ctx.callbackQuery) {
            await ctx.answerCallbackQuery().catch((err) => {
                if (!isCallbackQueryExpiredError(err)) throw err;
            });
            await ctx.deleteMessage().catch((err) => {
                if (!isMessageToDeleteNotFoundError(err)) throw err;
            });
        }

        await ctx.reply(
            i18n.t(locale, 'admin_menu_header'),
            { reply_markup: getAdminMenuKeyboard(locale) }
        );
    } catch (error) {
        logger.error('Error in adminBackToMenuHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

/**
 * Admin back to main menu handler (exit admin panel)
 */
export const adminBackToMainMenuHandler = async (ctx: BotContext) => {
    try {
        const locale = getLocale(ctx);

        await ctx.reply(
            i18n.t(locale, 'welcome_message'),
            { reply_markup: getMainKeyboardByLocale(locale, true) }
        );
    } catch (error) {
        logger.error('Error in adminBackToMainMenuHandler:', error);
        // Fallback or ignore, since it's just navigation
    }
};

/**
 * Admin search handler - initiates search conversation
 */
export const adminSearchHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        await ctx.conversation.enter('adminSearchConversation');
    } catch (error) {
        logger.error('Error in adminSearchHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

/**
 * Admin broadcast handler - initiates broadcast conversation
 */
export const adminBroadcastHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        await ctx.conversation.enter('adminBroadcastConversation');
    } catch (error) {
        logger.error('Error in adminBroadcastHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

/**
 * Admin send message to user handler
 */
export const adminSendMessageHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const callbackData = ctx.callbackQuery?.data || '';
        const telegramId = parseInt(callbackData.split(':')[1], 10);

        await ctx.answerCallbackQuery().catch((err) => {
            if (!isCallbackQueryExpiredError(err)) throw err;
        });

        // Store target user in session and enter conversation
        ctx.session.adminSendTargetUser = telegramId;
        await ctx.conversation.enter('adminSendMessageConversation');
    } catch (error) {
        logger.error('Error in adminSendMessageHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};
