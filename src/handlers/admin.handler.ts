import { BotContext, PromotionEditableField, PromotionPrizeEditableField } from '../types/context';
import { AdminService } from '../services/admin.service';
import { ExportService } from '../services/export.service';
import { SupportService } from '../services/support.service';
import { UserService } from '../services/user.service';
import { BranchService } from '../services/branch.service';
import { PromotionService } from '../services/promotion.service';
import { InputFile } from 'grammy';
import {
    getAdminMenuKeyboard,
    getAdminUsersKeyboard,
    getAdminUserDetailKeyboard,
} from '../keyboards/admin.keyboards';
import {
    getAdminBranchDeactivateConfirmKeyboard,
    getAdminBranchDetailKeyboard,
    getAdminBranchesKeyboard,
} from '../keyboards/branch.keyboards';
import { getMainKeyboardByLocale } from '../keyboards';
import {
    ADMIN_PRIZE_BACK_TO_LIST_CALLBACK,
    ADMIN_PRIZE_CREATE_CALLBACK,
    ADMIN_PRIZE_DELETE_CALLBACK_PREFIX,
    ADMIN_PRIZE_DETAIL_CALLBACK_PREFIX,
    ADMIN_PRIZE_EDIT_CALLBACK_PREFIX,
    ADMIN_PRIZE_PAGE_CALLBACK_PREFIX,
    ADMIN_PRIZE_TOGGLE_CALLBACK_PREFIX,
    ADMIN_PROMOTION_ARCHIVE_CALLBACK_PREFIX,
    ADMIN_PROMOTION_DETAIL_CALLBACK_PREFIX,
    ADMIN_PROMOTION_IMAGE_REMOVE_CALLBACK_PREFIX,
    ADMIN_PROMOTION_PAGE_CALLBACK_PREFIX,
    ADMIN_PROMOTION_TOGGLE_CALLBACK_PREFIX,
    ADMIN_PROMOTION_ASSIGN_COUPONS_TOGGLE_CALLBACK_PREFIX,
    ADMIN_WINNER_PRIZE_SELECT_CALLBACK_PREFIX,
    getAdminMissingPrizeKeyboard,
} from '../keyboards/campaign.keyboards';
import { CouponExportService } from '../services/coupon-export.service';
import { CouponService } from '../services/coupon.service';
import { BotNotificationService } from '../services/bot-notification.service';
import { MessageTemplateService } from '../services/message-template.service';
import { i18n } from '../i18n';
import { logger } from '../utils/logger';
import { isCallbackQueryExpiredError, isMessageToDeleteNotFoundError } from '../utils/telegram-errors';
import { formatUzPhone } from '../utils/uz-phone.util';
import { formatBranchDetails } from '../utils/branch.util';
import {
    showAdminPrizeDetailCard,
    showAdminPrizesList,
    showAdminPromotionDetailCard,
    showAdminPromotionsList,
    showAdminWinnerPrizeSelection,
} from '../conversations/admin-campaign.conversation';
import {
    showAdminTemplateDetailCard,
    showAdminTemplatesList,
} from '../conversations/admin-template.conversation';
import {
    ADMIN_TEMPLATE_BACK_TO_LIST_CALLBACK,
    ADMIN_TEMPLATE_CREATE_CALLBACK,
    ADMIN_TEMPLATE_DETAIL_CALLBACK_PREFIX,
    ADMIN_TEMPLATE_DELETE_CALLBACK_PREFIX,
    ADMIN_TEMPLATE_EDIT_CALLBACK_PREFIX,
    ADMIN_TEMPLATE_PAGE_CALLBACK_PREFIX,
    ADMIN_TEMPLATE_TOGGLE_CALLBACK_PREFIX,
    getAdminMissingTemplateKeyboard
} from '../keyboards/template.keyboards';
import { MessageTemplateEditableField } from '../types/context';
import { escapeHtml } from '../utils/telegram-rich-text.util';

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

const cleanupCallbackMessage = async (ctx: BotContext) => {
    if (!ctx.callbackQuery) {
        return;
    }

    await ctx.answerCallbackQuery().catch((err) => {
        if (!isCallbackQueryExpiredError(err)) throw err;
    });
    await ctx.deleteMessage().catch((err) => {
        if (!isMessageToDeleteNotFoundError(err)) throw err;
    });
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

            message += `${num}. <b>${escapeHtml(name)}</b>${banned}\n`;
            message += `   📱 ${escapeHtml(phone)}\n`;
            message += `   🆔 <code>${escapeHtml(user.telegram_id.toString())}</code>\n\n`;
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
                parse_mode: 'HTML',
            }).catch((err) => {
                if (!isMessageToDeleteNotFoundError(err)) throw err;
            });
        } else {
            await ctx.reply(message, {
                reply_markup: keyboard,
                parse_mode: 'HTML',
            });
        }
    } catch (error) {
        logger.error('Error in showUsersList:', error);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

const showBranchesList = async (
    ctx: BotContext,
    locale: string,
    edit: boolean = false
) => {
    try {
        const branches = await BranchService.listAll();
        let message = `${i18n.t(locale, 'admin_branches_header')}\n\n`;

        if (branches.length === 0) {
            message += i18n.t(locale, 'admin_branches_empty');
        } else {
            branches.forEach((branch, index) => {
                const statusKey = branch.is_active
                    ? 'admin_branch_status_active'
                    : 'admin_branch_status_inactive';

                message += `${index + 1}. ${branch.name}\n`;
                message += `   ${i18n.t(locale, 'admin_branch_status_label')}: ${i18n.t(locale, statusKey)}\n`;
                message += `   ${i18n.t(locale, 'branch_work_time_label')}: ${branch.work_start_time || '--:--'}-${branch.work_end_time || '--:--'}\n\n`;
            });
        }

        const keyboard = getAdminBranchesKeyboard(branches, locale);

        if (edit && ctx.callbackQuery) {
            await ctx.editMessageText(message, { reply_markup: keyboard });
        } else {
            await ctx.reply(message, { reply_markup: keyboard });
        }
    } catch (error) {
        logger.error('Error in showBranchesList:', error);
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
        message += `👤 <b>${escapeHtml(name)}</b>\n`;
        message += `🆔 Telegram: <code>${escapeHtml(user.telegram_id.toString())}</code>\n`;
        message += `📱 ${i18n.t(locale, 'admin_phone')}: ${escapeHtml(formatUzPhone(user.phone_number))}\n`;
        message += `💼 SAP: ${escapeHtml(user.sap_card_code || '-')}\n`;
        message += `🌐 ${i18n.t(locale, 'admin_language')}: ${escapeHtml(user.language_code?.toUpperCase() || 'UZ')}\n`;
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
            parse_mode: 'HTML',
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
        message += `📊 <b>${i18n.t(locale, 'admin_stats_users')}</b>\n`;
        message += `├ ${i18n.t(locale, 'admin_stats_total')}: ${userStats.total}\n`;
        message += `├ ${i18n.t(locale, 'admin_stats_admins')}: ${userStats.admins}\n`;
        message += `├ ${i18n.t(locale, 'admin_stats_with_sap')}: ${userStats.withSapCode}\n`;
        message += `└ ${i18n.t(locale, 'admin_stats_support_banned')}: ${userStats.supportBanned}\n\n`;

        // Ticket statistics
        message += `🎫 <b>${i18n.t(locale, 'admin_stats_tickets')}</b>\n`;
        message += `├ ${i18n.t(locale, 'admin_stats_total')}: ${ticketStats.total}\n`;
        message += `├ 🔵 ${i18n.t(locale, 'admin_stats_open')}: ${ticketStats.open}\n`;
        message += `├ 🟢 ${i18n.t(locale, 'admin_stats_replied')}: ${ticketStats.replied}\n`;
        message += `└ ⚫ ${i18n.t(locale, 'admin_stats_closed')}: ${ticketStats.closed}\n`;

        await ctx.reply(message, { parse_mode: 'HTML' });
    } catch (error) {
        logger.error('Error in adminStatsHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

export const adminBranchesHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);

        if (ctx.callbackQuery) {
            await ctx.answerCallbackQuery();
        }

        await showBranchesList(ctx, locale, Boolean(ctx.callbackQuery));
    } catch (error) {
        logger.error('Error in adminBranchesHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

export const adminBranchDetailHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);
        const callbackData = ctx.callbackQuery?.data || '';
        const branchId = callbackData.split(':')[1];

        await ctx.answerCallbackQuery();

        const branch = await BranchService.getById(branchId);

        if (!branch) {
            await ctx.reply(i18n.t(locale, 'admin_branch_not_found'));
            return;
        }

        await ctx.editMessageText(
            `${i18n.t(locale, 'admin_branch_detail_header')}\n\n${formatBranchDetails(branch, locale, { includeStatus: true })}`,
            { reply_markup: getAdminBranchDetailKeyboard(branch.id, branch.is_active, locale) }
        );
    } catch (error) {
        logger.error('Error in adminBranchDetailHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

export const adminBranchCreateHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        if (ctx.callbackQuery) {
            await ctx.answerCallbackQuery();
            await ctx.deleteMessage().catch(() => { });
        }

        await ctx.conversation.exitAll();
        await ctx.conversation.enter('adminAddBranchConversation');
    } catch (error) {
        logger.error('Error in adminBranchCreateHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

export const adminBranchDeactivateConfirmHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);
        const callbackData = ctx.callbackQuery?.data || '';
        const branchId = callbackData.split(':')[1];

        await ctx.answerCallbackQuery();

        const branch = await BranchService.getById(branchId);

        if (!branch) {
            await ctx.reply(i18n.t(locale, 'admin_branch_not_found'));
            return;
        }

        await ctx.editMessageText(
            i18n.t(locale, 'admin_branch_deactivate_confirm', { name: branch.name }),
            { reply_markup: getAdminBranchDeactivateConfirmKeyboard(branch.id, locale) }
        );
    } catch (error) {
        logger.error('Error in adminBranchDeactivateConfirmHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

export const adminBranchDeactivateHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);
        const callbackData = ctx.callbackQuery?.data || '';
        const branchId = callbackData.split(':')[1];

        const updated = await BranchService.markInactive(branchId);

        await ctx.answerCallbackQuery({
            text: updated ? i18n.t(locale, 'admin_branch_deactivated') : i18n.t(locale, 'admin_action_failed'),
            show_alert: !updated,
        });

        await showBranchesList(ctx, locale, true);
    } catch (error) {
        logger.error('Error in adminBranchDeactivateHandler:', error);
        const locale = getLocale(ctx);
        await ctx.answerCallbackQuery({ text: i18n.t(locale, 'admin_error'), show_alert: true });
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

export const adminCampaignPromotionsHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;
        const locale = getLocale(ctx);
        ctx.session.adminPromotionListPage = 1;
        await showAdminPromotionsList(ctx, locale, 1);
    } catch (error) {
        logger.error('Error in adminCampaignPromotionsHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

export const adminPromotionPageHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);
        const page = Number(ctx.callbackQuery?.data?.slice(ADMIN_PROMOTION_PAGE_CALLBACK_PREFIX.length) || 1) || 1;
        await cleanupCallbackMessage(ctx);
        await showAdminPromotionsList(ctx, locale, page);
    } catch (error) {
        logger.error('Error in adminPromotionPageHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

export const adminPromotionDetailHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);
        const promotionId = Number(ctx.callbackQuery?.data?.slice(ADMIN_PROMOTION_DETAIL_CALLBACK_PREFIX.length) || 0);
        await cleanupCallbackMessage(ctx);
        await showAdminPromotionDetailCard(ctx, locale, promotionId);
    } catch (error) {
        logger.error('Error in adminPromotionDetailHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

export const adminPromotionBackToListHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);
        const page = ctx.session.adminPromotionListPage || 1;
        await cleanupCallbackMessage(ctx);
        await showAdminPromotionsList(ctx, locale, page);
    } catch (error) {
        logger.error('Error in adminPromotionBackToListHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

export const adminPromotionCreateHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        if (ctx.callbackQuery) {
            await cleanupCallbackMessage(ctx);
        }

        await ctx.conversation.exitAll();
        await ctx.conversation.enter('adminPromotionCreateConversation');
    } catch (error) {
        logger.error('Error in adminPromotionCreateHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

export const adminPromotionEditHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);
        const parts = ctx.callbackQuery?.data?.split(':') || [];
        const promotionId = Number(parts[1] || 0);
        const field = parts[2];

        if (!promotionId || !field) {
            await ctx.answerCallbackQuery({ text: i18n.t(locale, 'admin_error'), show_alert: true }).catch(() => undefined);
            return;
        }

        await cleanupCallbackMessage(ctx);
        ctx.session.adminPromotionEditTarget = {
            promotionId,
            field: field as PromotionEditableField,
        };

        await ctx.conversation.exitAll();
        await ctx.conversation.enter('adminPromotionEditConversation');
    } catch (error) {
        logger.error('Error in adminPromotionEditHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

export const adminPromotionToggleHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);
        const promotionId = Number(ctx.callbackQuery?.data?.slice(ADMIN_PROMOTION_TOGGLE_CALLBACK_PREFIX.length) || 0);
        const promotion = await PromotionService.getPromotionForAdmin(promotionId);

        if (!promotion) {
            await ctx.answerCallbackQuery({ text: i18n.t(locale, 'campaign_promotion_not_found'), show_alert: true }).catch(() => undefined);
            return;
        }

        await cleanupCallbackMessage(ctx);
        await PromotionService.setPromotionActiveState(promotionId, !promotion.is_active);
        await ctx.reply(i18n.t(locale, 'admin_campaign_status_updated'));
        await showAdminPromotionDetailCard(ctx, locale, promotionId);
    } catch (error) {
        logger.error('Error in adminPromotionToggleHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

export const adminPromotionAssignCouponsToggleHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);
        const promotionId = Number(ctx.callbackQuery?.data?.slice(ADMIN_PROMOTION_ASSIGN_COUPONS_TOGGLE_CALLBACK_PREFIX.length) || 0);
        const promotion = await PromotionService.getPromotionForAdmin(promotionId);

        if (!promotion) {
            await ctx.answerCallbackQuery({ text: i18n.t(locale, 'campaign_promotion_not_found'), show_alert: true }).catch(() => undefined);
            return;
        }

        await cleanupCallbackMessage(ctx);
        await PromotionService.setPromotionAssignCouponsState(promotionId, !promotion.assign_coupons);
        await ctx.reply(i18n.t(locale, 'admin_campaign_assign_coupons_status_updated'));
        await showAdminPromotionDetailCard(ctx, locale, promotionId);
    } catch (error) {
        logger.error('Error in adminPromotionAssignCouponsToggleHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

export const adminPromotionArchiveHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);
        const promotionId = Number(ctx.callbackQuery?.data?.slice(ADMIN_PROMOTION_ARCHIVE_CALLBACK_PREFIX.length) || 0);
        const archived = await PromotionService.archivePromotion(promotionId);

        await cleanupCallbackMessage(ctx);

        if (!archived) {
            await ctx.reply(i18n.t(locale, 'campaign_promotion_not_found'), {
                reply_markup: getAdminMenuKeyboard(locale),
            });
            return;
        }

        await ctx.reply(i18n.t(locale, 'admin_campaign_promotion_archived'));
        await showAdminPromotionsList(ctx, locale, ctx.session.adminPromotionListPage || 1);
    } catch (error) {
        logger.error('Error in adminPromotionArchiveHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

export const adminPromotionImageRemoveHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);
        const promotionId = Number(ctx.callbackQuery?.data?.slice(ADMIN_PROMOTION_IMAGE_REMOVE_CALLBACK_PREFIX.length) || 0);
        const updated = await PromotionService.removePromotionImage(promotionId);

        await cleanupCallbackMessage(ctx);

        if (!updated) {
            await ctx.reply(i18n.t(locale, 'campaign_promotion_not_found'), {
                reply_markup: getAdminMenuKeyboard(locale),
            });
            return;
        }

        await ctx.reply(i18n.t(locale, 'admin_campaign_image_removed'));
        await showAdminPromotionDetailCard(ctx, locale, promotionId);
    } catch (error) {
        logger.error('Error in adminPromotionImageRemoveHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

export const adminCampaignPrizesHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;
        const locale = getLocale(ctx);
        ctx.session.adminPrizeListPage = 1;

        if (ctx.callbackQuery) {
            await cleanupCallbackMessage(ctx);
        }

        await showAdminPrizesList(ctx, locale, 1);
    } catch (error) {
        logger.error('Error in adminCampaignPrizesHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

export const adminPrizePageHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);
        const page = Number(ctx.callbackQuery?.data?.slice(ADMIN_PRIZE_PAGE_CALLBACK_PREFIX.length) || 1) || 1;
        await cleanupCallbackMessage(ctx);
        await showAdminPrizesList(ctx, locale, page);
    } catch (error) {
        logger.error('Error in adminPrizePageHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

export const adminPrizeDetailHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);
        const prizeId = Number(ctx.callbackQuery?.data?.slice(ADMIN_PRIZE_DETAIL_CALLBACK_PREFIX.length) || 0);
        await cleanupCallbackMessage(ctx);
        await showAdminPrizeDetailCard(ctx, locale, prizeId);
    } catch (error) {
        logger.error('Error in adminPrizeDetailHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

export const adminPrizeBackToListHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);
        const page = ctx.session.adminPrizeListPage || 1;
        await cleanupCallbackMessage(ctx);
        await showAdminPrizesList(ctx, locale, page);
    } catch (error) {
        logger.error('Error in adminPrizeBackToListHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

export const adminPrizeCreateHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        if (ctx.callbackQuery) {
            await cleanupCallbackMessage(ctx);
        }

        await ctx.conversation.exitAll();
        await ctx.conversation.enter('adminPrizeCreateConversation');
    } catch (error) {
        logger.error('Error in adminPrizeCreateHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

export const adminPrizeEditHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);
        const parts = ctx.callbackQuery?.data?.split(':') || [];
        const prizeId = Number(parts[1] || 0);
        const field = parts[2];

        if (!prizeId || !field) {
            await ctx.answerCallbackQuery({ text: i18n.t(locale, 'admin_error'), show_alert: true }).catch(() => undefined);
            return;
        }

        await cleanupCallbackMessage(ctx);
        ctx.session.adminPrizeEditTarget = {
            prizeId,
            field: field as PromotionPrizeEditableField,
        };

        await ctx.conversation.exitAll();
        await ctx.conversation.enter('adminPrizeEditConversation');
    } catch (error) {
        logger.error('Error in adminPrizeEditHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

export const adminPrizeToggleHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);
        const prizeId = Number(ctx.callbackQuery?.data?.slice(ADMIN_PRIZE_TOGGLE_CALLBACK_PREFIX.length) || 0);
        const prize = await PromotionService.getPrizeById(prizeId);

        if (!prize) {
            await ctx.answerCallbackQuery({ text: i18n.t(locale, 'admin_campaign_prize_not_found'), show_alert: true }).catch(() => undefined);
            return;
        }

        await cleanupCallbackMessage(ctx);
        await PromotionService.setPrizeActiveState(prizeId, !prize.is_active);
        await ctx.reply(i18n.t(locale, 'admin_campaign_prize_status_updated'));
        await showAdminPrizeDetailCard(ctx, locale, prizeId);
    } catch (error) {
        logger.error('Error in adminPrizeToggleHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

export const adminPrizeDeleteHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);
        const prizeId = Number(ctx.callbackQuery?.data?.slice(ADMIN_PRIZE_DELETE_CALLBACK_PREFIX.length) || 0);
        const deleted = await PromotionService.deletePrize(prizeId);
        await cleanupCallbackMessage(ctx);

        if (deleted) {
            await ctx.reply(i18n.t(locale, 'admin_campaign_prize_deleted'));
        } else {
            await ctx.reply(i18n.t(locale, 'admin_campaign_prize_not_found'));
        }

        await showAdminPrizesList(ctx, locale, ctx.session.adminPrizeListPage || 1);
    } catch (error) {
        logger.error('Error in adminPrizeDeleteHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

export const adminCampaignTemplatesHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;
        const locale = getLocale(ctx);
        
        if (ctx.callbackQuery) {
            await cleanupCallbackMessage(ctx);
        }

        await showAdminTemplatesList(ctx, locale);
    } catch (error) {
        logger.error('Error in adminCampaignTemplatesHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

export const adminTemplateDetailHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);
        const templateId = Number(ctx.callbackQuery?.data?.slice(ADMIN_TEMPLATE_DETAIL_CALLBACK_PREFIX.length) || 0);
        await cleanupCallbackMessage(ctx);
        await showAdminTemplateDetailCard(ctx, locale, templateId);
    } catch (error) {
        logger.error('Error in adminTemplateDetailHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

export const adminTemplateBackToListHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);
        await cleanupCallbackMessage(ctx);
        await showAdminTemplatesList(ctx, locale);
    } catch (error) {
        logger.error('Error in adminTemplateBackToListHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

export const adminTemplateCreateHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        if (ctx.callbackQuery) {
            await cleanupCallbackMessage(ctx);
        }

        await ctx.conversation.exitAll();
        await ctx.conversation.enter('adminTemplateCreateConversation');
    } catch (error) {
        logger.error('Error in adminTemplateCreateHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

export const adminTemplateEditHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);
        const parts = ctx.callbackQuery?.data?.split(':') || [];
        const templateId = Number(parts[1] || 0);
        const field = parts[2];

        if (!templateId || !field) {
            await ctx.answerCallbackQuery({ text: i18n.t(locale, 'admin_error'), show_alert: true }).catch(() => undefined);
            return;
        }

        await cleanupCallbackMessage(ctx);
        ctx.session.adminTemplateEditTarget = {
            templateId,
            field: field as MessageTemplateEditableField,
        };

        await ctx.conversation.exitAll();
        await ctx.conversation.enter('adminTemplateEditConversation');
    } catch (error) {
        logger.error('Error in adminTemplateEditHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

export const adminTemplateToggleHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);
        const templateId = Number(ctx.callbackQuery?.data?.slice(ADMIN_TEMPLATE_TOGGLE_CALLBACK_PREFIX.length) || 0);
        const template = await MessageTemplateService.getById(templateId);

        if (!template) {
            await ctx.answerCallbackQuery({ text: i18n.t(locale, 'admin_error'), show_alert: true }).catch(() => undefined);
            return;
        }

        await cleanupCallbackMessage(ctx);
        await MessageTemplateService.setTemplateActiveState(templateId, !template.is_active);
        await ctx.reply(i18n.t(locale, 'admin_template_status_updated'));
        await showAdminTemplateDetailCard(ctx, locale, templateId);
    } catch (error) {
        logger.error('Error in adminTemplateToggleHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

export const adminTemplateDeleteHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);
        const templateId = Number(ctx.callbackQuery?.data?.slice(ADMIN_TEMPLATE_DELETE_CALLBACK_PREFIX.length) || 0);
        
        const deleted = await MessageTemplateService.delete(templateId);
        await cleanupCallbackMessage(ctx);

        if (deleted) {
            await ctx.reply(i18n.t(locale, 'admin_template_deleted'));
        } else {
             await ctx.reply(i18n.t(locale, 'admin_error'));
        }
        
        await showAdminTemplatesList(ctx, locale);
    } catch (error) {
        logger.error('Error in adminTemplateDeleteHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

export const adminTemplatePageHandler = async (ctx: BotContext) => {
     // For now just refresh, but we could implement actual paging if templates list is long
     return adminCampaignTemplatesHandler(ctx);
};

export const adminCampaignCouponSearchHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;
        await ctx.conversation.enter('adminCouponSearchConversation');
    } catch (error) {
        logger.error('Error in adminCampaignCouponSearchHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_error'));
    }
};

export const adminCampaignCouponExportHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);
        const statusMsg = await ctx.reply(i18n.t(locale, 'admin_export_generating'));
        const buffer = await CouponExportService.exportActiveCouponsToExcel();

        await ctx.api.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => undefined);

        await ctx.replyWithDocument(new InputFile(buffer, `active_coupons_${new Date().toISOString().slice(0, 10)}.xlsx`), {
            caption: i18n.t(locale, 'admin_campaign_coupon_export_ready'),
        });
    } catch (error) {
        logger.error('Error in adminCampaignCouponExportHandler:', error);
        const locale = getLocale(ctx);
        await ctx.reply(i18n.t(locale, 'admin_export_error'));
    }
};

export const adminCouponMarkWinnerHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);
        const code = ctx.callbackQuery?.data?.split(':')[1] || '';
        const coupon = await CouponService.findCouponByCode(code);
        if (!coupon || coupon.status !== 'active') {
            await ctx.answerCallbackQuery({ text: i18n.t(locale, 'admin_campaign_coupon_not_found'), show_alert: true });
            return;
        }

        const promotionId = coupon.promotion_id || undefined;
        if (!promotionId) {
            await ctx.answerCallbackQuery({ text: i18n.t(locale, 'admin_campaign_prize_not_found'), show_alert: true });
            return;
        }

        const prizes = await PromotionService.listActivePrizesForPromotion(promotionId);

        const winnerTemplate = await MessageTemplateService.getActiveTemplateByType('winner_notification');
        if (!winnerTemplate) {
            await cleanupCallbackMessage(ctx);
            await ctx.reply(i18n.t(locale, 'admin_campaign_winner_template_missing'), {
                reply_markup: getAdminMissingTemplateKeyboard(locale),
            });
            return;
        }

        if (prizes.length === 0) {
            await cleanupCallbackMessage(ctx);
            await ctx.reply(i18n.t(locale, 'admin_campaign_no_prizes_in_db'), {
                reply_markup: getAdminMissingPrizeKeyboard(locale),
            });
            return;
        }

        await cleanupCallbackMessage(ctx);
        ctx.session.adminWinnerCouponCode = code;
        await showAdminWinnerPrizeSelection(ctx, locale, code, prizes);
    } catch (error) {

        logger.error('Error in adminCouponMarkWinnerHandler:', error);
        const locale = getLocale(ctx);
        await ctx.answerCallbackQuery({ text: i18n.t(locale, 'admin_error'), show_alert: true }).catch(() => undefined);
    }
};

export const adminWinnerPrizeSelectHandler = async (ctx: BotContext) => {
    try {
        if (!await requireAdmin(ctx)) return;

        const locale = getLocale(ctx);
        const raw = ctx.callbackQuery?.data?.slice(ADMIN_WINNER_PRIZE_SELECT_CALLBACK_PREFIX.length) || '';
        const separatorIndex = raw.lastIndexOf(':');
        const code = separatorIndex >= 0 ? raw.slice(0, separatorIndex) : '';
        const prizeId = Number(separatorIndex >= 0 ? raw.slice(separatorIndex + 1) : 0);

        if (!code || !prizeId) {
            await ctx.answerCallbackQuery({ text: i18n.t(locale, 'admin_error'), show_alert: true }).catch(() => undefined);
            return;
        }

        const coupon = await CouponService.findCouponByCode(code);
        const prize = await PromotionService.getPrizeById(prizeId);

        if (!coupon || coupon.status !== 'active') {
            await ctx.answerCallbackQuery({ text: i18n.t(locale, 'admin_campaign_coupon_not_found'), show_alert: true }).catch(() => undefined);
            return;
        }

        if (!prize || !prize.is_active || prize.promotion_id !== coupon.promotion_id) {
            await ctx.answerCallbackQuery({ text: i18n.t(locale, 'admin_campaign_prize_not_found'), show_alert: true }).catch(() => undefined);
            return;
        }

        const updated = await CouponService.markCouponAsWinner(code);
        const user = await UserService.getUserByPhoneNumber(coupon.phone_number || '');

        await cleanupCallbackMessage(ctx);

        if (updated && user) {
            await BotNotificationService.sendTemplateMessage({
                user,
                templateType: 'winner_notification',
                placeholders: {
                    customer_name: [coupon.first_name, coupon.last_name].filter(Boolean).join(' ') || 'Mijoz',
                    coupon_code: code,
                    prize_name: prize.title,
                    referrer_name: '',
                    product_name: '',
                    payment_due_date: '',
                },
                couponId: updated.id,
                dispatchType: 'winner_notification',
            });
        }

        ctx.session.adminWinnerCouponCode = undefined;
        await ctx.reply(i18n.t(locale, 'admin_campaign_winner_marked'));
    } catch (error) {
        logger.error('Error in adminWinnerPrizeSelectHandler:', error);
        const locale = getLocale(ctx);
        await ctx.answerCallbackQuery({ text: i18n.t(locale, 'admin_error'), show_alert: true }).catch(() => undefined);
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

        if (ctx.callbackQuery) {
            await ctx.answerCallbackQuery().catch(() => { });
            await ctx.deleteMessage().catch(() => { });
        }

        await ctx.reply(
            i18n.t(locale, 'welcome_message'),
            { reply_markup: getMainKeyboardByLocale(locale, true, true) }
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
