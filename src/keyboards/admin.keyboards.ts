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
        .text(i18n.t(locale, 'admin_branches')).row()
        .text(i18n.t(locale, 'admin_broadcast'))
        .text(i18n.t(locale, 'admin_scheduled_broadcasts')).row()
        .text(i18n.t(locale, 'admin_stats'))
        .text(i18n.t(locale, 'admin_export')).row()
        .text(i18n.t(locale, 'admin_campaign_promotions'))
        .text(i18n.t(locale, 'admin_campaign_prizes')).row()
        .text(i18n.t(locale, 'admin_campaign_templates'))
        .text(i18n.t(locale, 'admin_faqs')).row()
        .text(i18n.t(locale, 'admin_campaign_coupon_search'))
        .text(i18n.t(locale, 'admin_campaign_coupon_export')).row()
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

export const getBroadcastDeliveryModeKeyboard = (locale: string) => {
    return getBroadcastScheduleTypeKeyboard(locale, true);
};

export const getBroadcastScheduleTypeKeyboard = (locale: string, includeSendNow: boolean = false) => {
    const keyboard = new InlineKeyboard();

    if (includeSendNow) {
        keyboard
        .text(i18n.t(locale, 'admin_broadcast_send_now'), 'admin_broadcast_send_now')
        .row();
    }

    return keyboard
        .text(i18n.t(locale, 'schedule_once'), 'admin_broadcast_schedule_type:once')
        .text(i18n.t(locale, 'schedule_daily'), 'admin_broadcast_schedule_type:daily')
        .row()
        .text(i18n.t(locale, 'schedule_weekdays'), 'admin_broadcast_schedule_type:weekdays')
        .text(i18n.t(locale, 'schedule_weekly'), 'admin_broadcast_schedule_type:weekly')
        .row()
        .text(i18n.t(locale, 'schedule_twice_weekly'), 'admin_broadcast_schedule_type:twice_weekly')
        .text(i18n.t(locale, 'schedule_biweekly'), 'admin_broadcast_schedule_type:biweekly')
        .row()
        .text(i18n.t(locale, 'schedule_monthly'), 'admin_broadcast_schedule_type:monthly')
        .text(i18n.t(locale, 'schedule_twice_monthly'), 'admin_broadcast_schedule_type:twice_monthly')
        .row()
        .text(i18n.t(locale, 'admin_cancel'), 'admin_cancel');
};

export const getBroadcastWeekDayKeyboard = (locale: string) => {
    return new InlineKeyboard()
        .text(i18n.t(locale, 'weekday_monday'), 'admin_broadcast_weekday:1')
        .text(i18n.t(locale, 'weekday_tuesday'), 'admin_broadcast_weekday:2')
        .row()
        .text(i18n.t(locale, 'weekday_wednesday'), 'admin_broadcast_weekday:3')
        .text(i18n.t(locale, 'weekday_thursday'), 'admin_broadcast_weekday:4')
        .row()
        .text(i18n.t(locale, 'weekday_friday'), 'admin_broadcast_weekday:5')
        .text(i18n.t(locale, 'weekday_saturday'), 'admin_broadcast_weekday:6')
        .row()
        .text(i18n.t(locale, 'weekday_sunday'), 'admin_broadcast_weekday:0')
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

export const ADMIN_SCHEDULED_LIST_CALLBACK = 'admin_scheduled_list';
export const ADMIN_SCHEDULED_PAGE_CALLBACK_PREFIX = 'admin_scheduled_page:';
export const ADMIN_SCHEDULED_DETAIL_CALLBACK_PREFIX = 'admin_scheduled_detail:';
export const ADMIN_SCHEDULED_EDIT_MESSAGE_CALLBACK_PREFIX = 'admin_scheduled_edit_message:';
export const ADMIN_SCHEDULED_RESCHEDULE_CALLBACK_PREFIX = 'admin_scheduled_reschedule:';
export const ADMIN_SCHEDULED_TOGGLE_CALLBACK_PREFIX = 'admin_scheduled_toggle:';

export const getScheduledBroadcastsKeyboard = (
    items: Array<{ id: number; is_active: boolean }>,
    currentPage: number,
    totalPages: number,
    locale: string,
) => {
    const keyboard = new InlineKeyboard();

    items.forEach((item) => {
        const status = item.is_active ? '🟢' : '⚫';
        keyboard.text(
            `${status} #${item.id}`,
            `${ADMIN_SCHEDULED_DETAIL_CALLBACK_PREFIX}${item.id}`,
        ).row();
    });

    if (totalPages > 1) {
        if (currentPage > 1) {
            keyboard.text('⬅️', `${ADMIN_SCHEDULED_PAGE_CALLBACK_PREFIX}${currentPage - 1}`);
        }
        keyboard.text(`${currentPage}/${totalPages}`, 'noop');
        if (currentPage < totalPages) {
            keyboard.text('➡️', `${ADMIN_SCHEDULED_PAGE_CALLBACK_PREFIX}${currentPage + 1}`);
        }
        keyboard.row();
    }

    keyboard.text(i18n.t(locale, 'back'), 'admin_back_to_menu');
    return keyboard;
};

export const getScheduledBroadcastDetailKeyboard = (
    id: number,
    isActive: boolean,
    locale: string,
) => new InlineKeyboard()
    .text(
        i18n.t(locale, 'admin_scheduled_edit_message'),
        `${ADMIN_SCHEDULED_EDIT_MESSAGE_CALLBACK_PREFIX}${id}`,
    )
    .row()
    .text(
        i18n.t(locale, 'admin_scheduled_reschedule'),
        `${ADMIN_SCHEDULED_RESCHEDULE_CALLBACK_PREFIX}${id}`,
    )
    .row()
    .text(
        i18n.t(
            locale,
            isActive ? 'admin_scheduled_make_inactive' : 'admin_scheduled_make_active',
        ),
        `${ADMIN_SCHEDULED_TOGGLE_CALLBACK_PREFIX}${id}`,
    )
    .row()
    .text(i18n.t(locale, 'back'), ADMIN_SCHEDULED_LIST_CALLBACK);

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
