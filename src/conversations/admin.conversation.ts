import { BotConversation, BotContext } from '../types/context';
import { BroadcastService } from '../services/broadcast.service';
import { AdminService } from '../services/admin.service';
import { UserService } from '../services/user.service';
import { getAdminCancelKeyboard, getAdminMenuKeyboard, getBroadcastConfirmKeyboard, getBroadcastTargetKeyboard } from '../keyboards/admin.keyboards';
import { i18n } from '../i18n';
import { logger } from '../utils/logger';
import { formatUzPhone } from '../utils/uz-phone.util';

/**
 * Admin Broadcast Conversation
 * Allows admins to send messages to all users or a single user
 */
export async function adminBroadcastConversation(
    conversation: BotConversation,
    ctx: BotContext
) {
    const locale = ctx.session?.__language_code || 'uz';
    const adminId = ctx.from!.id;

    // Check if there's already a broadcast in progress
    const activeBroadcast = await conversation.external(async () => {
        return await BroadcastService.hasActiveBroadcast();
    });

    if (activeBroadcast) {
        await ctx.reply(
            i18n.t(locale, 'admin_broadcast_already_in_progress'),
            { reply_markup: getAdminMenuKeyboard(locale) }
        );
        return;
    }

    // Ask for target type
    await ctx.reply(
        i18n.t(locale, 'admin_broadcast_select_target'),
        { reply_markup: getBroadcastTargetKeyboard(locale) }
    );

    // Wait for target selection
    const targetCtx = await conversation.waitFor('callback_query:data');
    const targetData = targetCtx.callbackQuery.data;
    await targetCtx.answerCallbackQuery();

    if (targetData === 'admin_cancel') {
        await targetCtx.editMessageText(i18n.t(locale, 'admin_cancelled'));
        return;
    }

    const isAll = targetData === 'admin_broadcast_all';
    let targetUserId: number | undefined;
    let userCount = 0;

    if (!isAll) {
        // Ask for user ID or phone
        await targetCtx.editMessageText(i18n.t(locale, 'admin_broadcast_enter_user'));
        await ctx.reply(
            i18n.t(locale, 'admin_broadcast_enter_user_prompt'),
            { reply_markup: getAdminCancelKeyboard(locale) }
        );

        const userInputCtx = await conversation.waitFor('message:text');
        const userInput = userInputCtx.message.text.trim();

        if (userInput === i18n.t(locale, 'admin_cancel')) {
            await ctx.reply(
                i18n.t(locale, 'admin_cancelled'),
                { reply_markup: getAdminMenuKeyboard(locale) }
            );
            return;
        }

        // Try to find user by telegram ID or phone
        const targetUser = await conversation.external(async () => {
            const digits = userInput.replace(/\D+/g, '');
            const isNumeric = /^\d+$/.test(userInput);

            // Priority 1: Exact Phone Match (Normalized)
            // Checks for 9 digits (local) or 12 digits starting with 998 (international)
            if (digits.length === 9 || (digits.length === 12 && digits.startsWith('998'))) {
                const normalized = formatUzPhone(userInput);
                const usersByPhone = await AdminService.searchUsers(normalized, 1);
                // Ensure it's an exact match for the phone number
                const exactPhoneUser = usersByPhone.find(u => u.phone_number === normalized);
                if (exactPhoneUser) return exactPhoneUser;
            }

            // Priority 2: Exact Telegram ID Match
            if (isNumeric) {
                const userById = await UserService.getUserByTelegramId(parseInt(userInput, 10));
                if (userById) return userById;
            }

            // Priority 3: General Search (Name, partial phone, or Telegram ID via smarter searchUsers)
            const users = await AdminService.searchUsers(userInput, 1);
            return users[0] || null;
        });

        if (!targetUser) {
            await ctx.reply(
                i18n.t(locale, 'admin_user_not_found'),
                { reply_markup: getAdminMenuKeyboard(locale) }
            );
            return;
        }

        // Show found user details
        const name = [targetUser.first_name, targetUser.last_name].filter(Boolean).join(' ') || i18n.t(locale, 'admin_unknown_user');
        const phone = formatUzPhone(targetUser.phone_number);
        const lang = targetUser.language_code === 'uz' ? i18n.t('uz', 'uz_button') : i18n.t('ru', 'ru_button');
        const registeredDate = new Date(targetUser.created_at).toLocaleDateString(locale === 'uz' ? 'uz-UZ' : 'ru-RU');

        let details = `${i18n.t(locale, 'admin_user_detail_header')}\n\n`;
        details += `🆔 ID: \`${targetUser.telegram_id}\`\n`;
        details += `👤 ${i18n.t(locale, 'admin_user_name')}: ${name}\n`;
        details += `📱 ${i18n.t(locale, 'admin_phone')}: ${phone}\n`;
        details += `🌐 ${i18n.t(locale, 'admin_language')}: ${lang}\n`;
        if (targetUser.sap_card_code) {
            details += `💳 SAP: \`${targetUser.sap_card_code}\`\n`;
        }
        details += `📅 ${i18n.t(locale, 'admin_registered')}: ${registeredDate}`;

        await ctx.reply(details, { parse_mode: 'Markdown' });

        targetUserId = targetUser.telegram_id;
        userCount = 1;
    } else {
        // Get total user count
        userCount = await conversation.external(async () => {
            return await AdminService.getUserCount();
        });
    }

    // Ask for message
    await ctx.reply(
        i18n.t(locale, 'admin_broadcast_enter_message'),
        { reply_markup: getAdminCancelKeyboard(locale) }
    );

    const msgCtx = await conversation.wait();

    // Check for cancel
    if (msgCtx.message?.text === i18n.t(locale, 'admin_cancel')) {
        await ctx.reply(
            i18n.t(locale, 'admin_cancelled'),
            { reply_markup: getAdminMenuKeyboard(locale) }
        );
        return;
    }

    const messageText = msgCtx.message?.text || msgCtx.message?.caption || '';
    const photoFileId = msgCtx.message?.photo?.[msgCtx.message.photo.length - 1]?.file_id;

    if (!messageText && !photoFileId) {
        await ctx.reply(
            i18n.t(locale, 'admin_broadcast_invalid_message'),
            { reply_markup: getAdminMenuKeyboard(locale) }
        );
        return;
    }

    // Show confirmation
    const confirmMessage = isAll
        ? i18n.t(locale, 'admin_broadcast_confirm', { count: userCount.toString() })
        : i18n.t(locale, 'admin_broadcast_confirm_single', { count: '1' });

    await ctx.reply(confirmMessage, { reply_markup: getBroadcastConfirmKeyboard(locale) });

    const confirmCtx = await conversation.waitFor('callback_query:data');
    const confirmData = confirmCtx.callbackQuery.data;
    await confirmCtx.answerCallbackQuery();

    if (confirmData !== 'admin_broadcast_confirm') {
        await confirmCtx.editMessageText(i18n.t(locale, 'admin_cancelled'));
        return;
    }

    // Create broadcast record
    const broadcast = await conversation.external(async () => {
        return await BroadcastService.createBroadcast({
            adminTelegramId: adminId,
            messageText: messageText,
            photoFileId: photoFileId,
            targetType: isAll ? 'all' : 'single',
            targetUserId: targetUserId,
        });
    });

    await confirmCtx.editMessageText(i18n.t(locale, 'admin_broadcast_started'));

    // Process broadcast
    if (isAll) {
        // For all users, process in background
        conversation.external(async () => {
            try {
                const result = await BroadcastService.processBroadcast(broadcast.id);

                // Notify admin of completion
                await ctx.api.sendMessage(
                    adminId,
                    i18n.t(locale, 'admin_broadcast_complete', {
                        success: result.success.toString(),
                        total: userCount.toString(),
                    })
                );
            } catch (error) {
                logger.error('Broadcast error:', error);
                await ctx.api.sendMessage(adminId, i18n.t(locale, 'admin_broadcast_error'));
            }
        });

        await ctx.reply(
            i18n.t(locale, 'admin_broadcast_processing', { count: userCount.toString() }),
            { reply_markup: getAdminMenuKeyboard(locale) }
        );
    } else {
        // For single user, send immediately
        const success = await conversation.external(async () => {
            return await BroadcastService.sendToUser(
                targetUserId!,
                messageText,
                photoFileId
            );
        });

        if (success) {
            await ctx.reply(
                i18n.t(locale, 'admin_broadcast_sent'),
                { reply_markup: getAdminMenuKeyboard(locale) }
            );
        } else {
            await ctx.reply(
                i18n.t(locale, 'admin_broadcast_failed'),
                { reply_markup: getAdminMenuKeyboard(locale) }
            );
        }

        // Update broadcast status
        await conversation.external(async () => {
            await BroadcastService.updateBroadcastStatus(
                broadcast.id,
                success ? 'completed' : 'failed',
                success ? 1 : 0,
                success ? 0 : 1
            );
        });
    }
}

/**
 * Admin Search Conversation
 * Allows admins to search for users
 */
export async function adminSearchConversation(
    conversation: BotConversation,
    ctx: BotContext
) {
    const locale = ctx.session?.__language_code || 'uz';

    // Ask for search term
    await ctx.reply(
        i18n.t(locale, 'admin_search_prompt'),
        { reply_markup: getAdminCancelKeyboard(locale) }
    );

    const searchCtx = await conversation.waitFor('message:text');
    const searchTerm = searchCtx.message.text.trim();

    if (searchTerm === i18n.t(locale, 'admin_cancel')) {
        await ctx.reply(
            i18n.t(locale, 'admin_cancelled'),
            { reply_markup: getAdminMenuKeyboard(locale) }
        );
        return;
    }

    // Search users
    const users = await conversation.external(async () => {
        return await AdminService.searchUsers(searchTerm, 10);
    });

    if (users.length === 0) {
        await ctx.reply(
            i18n.t(locale, 'admin_search_no_results', { query: searchTerm }),
            { reply_markup: getAdminMenuKeyboard(locale) }
        );
        return;
    }

    // Build results message
    let message = i18n.t(locale, 'admin_search_results', { query: searchTerm }) + '\n\n';

    users.forEach((user, index) => {
        const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || i18n.t(locale, 'admin_unknown_user');
        const phone = formatUzPhone(user.phone_number);
        const banned = user.is_support_banned ? ' 🚫' : '';

        message += `${index + 1}. *${name}*${banned}\n`;
        message += `   📱 ${phone}\n`;
        message += `   🆔 \`${user.telegram_id}\`\n\n`;
    });

    await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: getAdminMenuKeyboard(locale),
    });
}

/**
 * Admin Send Message Conversation
 * Allows admins to send a message to a specific user
 */
export async function adminSendMessageConversation(
    conversation: BotConversation,
    ctx: BotContext
) {
    const locale = ctx.session?.__language_code || 'uz';
    const targetUserId = ctx.session.adminSendTargetUser;

    if (!targetUserId) {
        await ctx.reply(i18n.t(locale, 'admin_error'));
        return;
    }


    // Ask for message
    await ctx.reply(
        i18n.t(locale, 'admin_send_enter_message'),
        { reply_markup: getAdminCancelKeyboard(locale) }
    );

    const msgCtx = await conversation.wait();

    // Check for cancel
    if (msgCtx.message?.text === i18n.t(locale, 'admin_cancel')) {
        await ctx.reply(
            i18n.t(locale, 'admin_cancelled'),
            { reply_markup: getAdminMenuKeyboard(locale) }
        );
        // Clear session
        ctx.session.adminSendTargetUser = undefined;
        return;
    }

    const messageText = msgCtx.message?.text || msgCtx.message?.caption || '';
    const photoFileId = msgCtx.message?.photo?.[msgCtx.message.photo.length - 1]?.file_id;

    if (!messageText && !photoFileId) {
        await ctx.reply(
            i18n.t(locale, 'admin_send_invalid_message'),
            { reply_markup: getAdminMenuKeyboard(locale) }
        );
        return;
    }

    // Send message
    const success = await conversation.external(async () => {
        return await BroadcastService.sendToUser(targetUserId, messageText, photoFileId);
    });

    if (success) {
        await ctx.reply(
            i18n.t(locale, 'admin_send_success'),
            { reply_markup: getAdminMenuKeyboard(locale) }
        );
    } else {
        await ctx.reply(
            i18n.t(locale, 'admin_send_failed'),
            { reply_markup: getAdminMenuKeyboard(locale) }
        );
    }

    // Clear session
    ctx.session.adminSendTargetUser = undefined;
}
