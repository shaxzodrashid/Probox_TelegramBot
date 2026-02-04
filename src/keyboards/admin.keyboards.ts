import { InlineKeyboard, Keyboard } from 'grammy';
import { i18n } from '../i18n';

/**
 * Admin Panel keyboards
 */

/**
 * Get admin panel main menu keyboard
 */
export const getAdminMenuKeyboard = (locale: string) => {
    return new Keyboard()
        .text(i18n.t(locale, 'admin_users'))
        .text(i18n.t(locale, 'admin_broadcast')).row()
        .text(i18n.t(locale, 'admin_stats'))
        .text(i18n.t(locale, 'admin_export')).row()
        .text(i18n.t(locale, 'back_to_user_menu'))
        .resized();
};

/**
 * Get admin user list pagination keyboard
 */
export const getAdminUsersKeyboard = (
    currentPage: number,
    totalPages: number,
    locale: string
) => {
    const keyboard = new InlineKeyboard();

    // Pagination row
    if (totalPages > 1) {
        if (currentPage > 1) {
            keyboard.text('⬅️', `admin_users_page:${currentPage - 1}`);
        }
        keyboard.text(`${currentPage}/${totalPages}`, 'noop');
        if (currentPage < totalPages) {
            keyboard.text('➡️', `admin_users_page:${currentPage + 1}`);
        }
        keyboard.row();
    }

    keyboard.text(i18n.t(locale, 'back'), 'admin_back_to_menu');

    return keyboard;
};

/**
 * Get user detail keyboard with actions
 */
export const getAdminUserDetailKeyboard = (
    telegramId: number,
    isSupportBanned: boolean,
    locale: string
) => {
    const keyboard = new InlineKeyboard();

    // Block/Unblock support
    if (isSupportBanned) {
        keyboard.text(i18n.t(locale, 'admin_unblock_support'), `admin_unblock_support:${telegramId}`);
    } else {
        keyboard.text(i18n.t(locale, 'admin_block_support'), `admin_block_support:${telegramId}`);
    }
    keyboard.row();

    // Send message
    keyboard.text(i18n.t(locale, 'admin_send_message'), `admin_send_message:${telegramId}`);
    keyboard.row();

    // Back
    keyboard.text(i18n.t(locale, 'back'), 'admin_back_to_users');

    return keyboard;
};

/**
 * Get broadcast target selection keyboard
 */
export const getBroadcastTargetKeyboard = (locale: string) => {
    return new InlineKeyboard()
        .text(i18n.t(locale, 'admin_broadcast_all'), 'admin_broadcast_all')
        .row()
        .text(i18n.t(locale, 'admin_broadcast_single'), 'admin_broadcast_single')
        .row()
        .text(i18n.t(locale, 'admin_cancel'), 'admin_cancel');
};

/**
 * Get broadcast confirmation keyboard
 */
export const getBroadcastConfirmKeyboard = (locale: string) => {
    return new InlineKeyboard()
        .text(i18n.t(locale, 'admin_confirm_yes'), 'admin_broadcast_confirm')
        .text(i18n.t(locale, 'admin_confirm_no'), 'admin_cancel');
};

/**
 * Get cancel keyboard for conversations
 */
export const getAdminCancelKeyboard = (locale: string) => {
    return new Keyboard()
        .text(i18n.t(locale, 'admin_cancel'))
        .resized()
        .oneTime();
};

/**
 * Get search users keyboard results
 */
export const getSearchResultsKeyboard = (
    users: { telegram_id: number; first_name?: string; last_name?: string; phone_number?: string }[],
    locale: string
) => {
    const keyboard = new InlineKeyboard();

    users.forEach((user, index) => {
        const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Unknown';
        const phone = user.phone_number ? ` (${user.phone_number})` : '';
        keyboard.text(`${index + 1}. ${name}${phone}`, `admin_user_detail:${user.telegram_id}`);
        keyboard.row();
    });

    keyboard.text(i18n.t(locale, 'back'), 'admin_back_to_menu');

    return keyboard;
};
