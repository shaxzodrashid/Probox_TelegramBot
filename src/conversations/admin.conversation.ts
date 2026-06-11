import { BotConversation, BotContext } from '../types/context';
import {
  ScheduledBroadcastScheduleType,
  ScheduledBroadcastWeekDay,
  UpdateScheduledBroadcastScheduleParams,
} from '../types/support.types';
import { BroadcastService } from '../services/broadcast.service';
import { AdminService } from '../services/admin.service';
import { BranchService } from '../services/branch.service';
import { UserService } from '../services/user.service';
import {
  getAdminCancelKeyboard,
  getAdminMenuKeyboard,
  getBroadcastConfirmKeyboard,
  getBroadcastDeliveryModeKeyboard,
  getBroadcastScheduleTypeKeyboard,
  getBroadcastTargetKeyboard,
  getBroadcastWeekDayKeyboard,
} from '../keyboards/admin.keyboards';
import { getAdminBranchPhoneKeyboard } from '../keyboards/branch.keyboards';
import { i18n } from '../i18n';
import {
  isCallbackQueryExpiredError,
  isMessageToDeleteNotFoundError,
} from '../utils/telegram/telegram-errors';
import { logger } from '../utils/logger';
import { formatUzPhone } from '../utils/uz-phone.util';
import { escapeHtml } from '../utils/telegram/telegram-rich-text.util';
import { parseWorkTimeRange } from '../utils/branch.util';
import {
  isValidScheduleDate,
  parseMonthDay,
  SCHEDULE_TYPES,
} from '../utils/scheduled-broadcast.util';

const BROADCAST_WEEKDAY_KEYS: Record<ScheduledBroadcastWeekDay, string> = {
  0: 'weekday_sunday',
  1: 'weekday_monday',
  2: 'weekday_tuesday',
  3: 'weekday_wednesday',
  4: 'weekday_thursday',
  5: 'weekday_friday',
  6: 'weekday_saturday',
};

const parseBroadcastTime = (value: string): string | null => {
  const trimmed = value.trim();
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(trimmed);
  return match ? trimmed : null;
};

const getBroadcastWeekDayLabel = (locale: string, weekDay: ScheduledBroadcastWeekDay): string =>
  i18n.t(locale, BROADCAST_WEEKDAY_KEYS[weekDay]);

const isCancelText = (value: string, locale: string): boolean =>
  value === i18n.t(locale, 'admin_cancel');

const waitForScheduleText = async (
  conversation: BotConversation,
  ctx: BotContext,
  locale: string,
  prompt: string,
  validator: (value: string) => boolean,
  invalidMessage: string,
): Promise<string | null> => {
  await ctx.reply(prompt, { reply_markup: getAdminCancelKeyboard(locale) });

  while (true) {
    const inputCtx = await conversation.waitFor('message:text');
    const value = inputCtx.message.text.trim();
    if (isCancelText(value, locale)) return null;
    if (validator(value)) return value;
    await inputCtx.reply(invalidMessage, { reply_markup: getAdminCancelKeyboard(locale) });
  }
};

const waitForScheduleWeekDay = async (
  conversation: BotConversation,
  ctx: BotContext,
  locale: string,
  prompt: string,
): Promise<ScheduledBroadcastWeekDay | null> => {
  await ctx.reply(prompt, { reply_markup: getBroadcastWeekDayKeyboard(locale) });
  const weekdayCtx = await conversation.waitFor('callback_query:data');
  const weekdayData = weekdayCtx.callbackQuery.data;
  await weekdayCtx.answerCallbackQuery().catch((err) => {
    if (!isCallbackQueryExpiredError(err)) throw err;
  });

  if (weekdayData === 'admin_cancel') return null;
  const parsedWeekDay = Number(weekdayData.split(':')[1]);
  if (!Number.isInteger(parsedWeekDay) || parsedWeekDay < 0 || parsedWeekDay > 6) return null;
  return parsedWeekDay as ScheduledBroadcastWeekDay;
};

const collectBroadcastSchedule = async (
  conversation: BotConversation,
  ctx: BotContext,
  locale: string,
  initialScheduleType?: ScheduledBroadcastScheduleType,
): Promise<UpdateScheduledBroadcastScheduleParams | null> => {
  let scheduleType = initialScheduleType;

  if (!scheduleType) {
    await ctx.reply(i18n.t(locale, 'admin_broadcast_select_schedule_type'), {
      reply_markup: getBroadcastScheduleTypeKeyboard(locale),
    });
    const typeCtx = await conversation.waitFor('callback_query:data');
    const typeData = typeCtx.callbackQuery.data;
    await typeCtx.answerCallbackQuery().catch((err) => {
      if (!isCallbackQueryExpiredError(err)) throw err;
    });

    if (typeData === 'admin_cancel') return null;
    const parsedType = typeData.split(':')[1] as ScheduledBroadcastScheduleType;
    if (!SCHEDULE_TYPES.includes(parsedType)) return null;
    scheduleType = parsedType;
  }

  const schedule: UpdateScheduledBroadcastScheduleParams = {
    scheduleType,
    scheduledTime: '',
  };

  if (scheduleType === 'weekly' || scheduleType === 'twice_weekly') {
    const firstWeekDay = await waitForScheduleWeekDay(
      conversation,
      ctx,
      locale,
      i18n.t(locale, 'admin_broadcast_select_weekday'),
    );
    if (firstWeekDay === null) return null;
    schedule.weekDays = [firstWeekDay];

    if (scheduleType === 'twice_weekly') {
      let secondWeekDay: ScheduledBroadcastWeekDay | null = null;
      while (secondWeekDay === null || secondWeekDay === firstWeekDay) {
        secondWeekDay = await waitForScheduleWeekDay(
          conversation,
          ctx,
          locale,
          i18n.t(locale, 'admin_broadcast_select_second_weekday', {
            weekday: getBroadcastWeekDayLabel(locale, firstWeekDay),
          }),
        );
        if (secondWeekDay === null) return null;
        if (secondWeekDay === firstWeekDay) {
          await ctx.reply(i18n.t(locale, 'admin_broadcast_weekdays_must_differ'));
        }
      }
      schedule.weekDays.push(secondWeekDay);
    }
  }

  if (scheduleType === 'once' || scheduleType === 'biweekly') {
    const date = await waitForScheduleText(
      conversation,
      ctx,
      locale,
      i18n.t(
        locale,
        scheduleType === 'once'
          ? 'admin_broadcast_enter_once_date'
          : 'admin_broadcast_enter_biweekly_start_date',
      ),
      isValidScheduleDate,
      i18n.t(locale, 'admin_broadcast_invalid_date'),
    );
    if (!date) return null;

    if (scheduleType === 'once') {
      schedule.scheduledDate = date;
    } else {
      schedule.startDate = date;
      schedule.weekDays = [
        new Date(`${date}T12:00:00.000Z`).getUTCDay() as ScheduledBroadcastWeekDay,
      ];
    }
  }

  if (scheduleType === 'monthly' || scheduleType === 'twice_monthly') {
    const firstDayValue = await waitForScheduleText(
      conversation,
      ctx,
      locale,
      i18n.t(locale, 'admin_broadcast_enter_month_day'),
      (value) => parseMonthDay(value) !== null,
      i18n.t(locale, 'admin_broadcast_invalid_month_day'),
    );
    if (!firstDayValue) return null;
    const firstDay = parseMonthDay(firstDayValue)!;
    schedule.monthDays = [firstDay];

    if (scheduleType === 'twice_monthly') {
      let secondDay: number | null = null;
      while (secondDay === null || secondDay === firstDay) {
        const secondDayValue = await waitForScheduleText(
          conversation,
          ctx,
          locale,
          i18n.t(locale, 'admin_broadcast_enter_second_month_day', {
            day: firstDay.toString(),
          }),
          (value) => parseMonthDay(value) !== null,
          i18n.t(locale, 'admin_broadcast_invalid_month_day'),
        );
        if (!secondDayValue) return null;
        secondDay = parseMonthDay(secondDayValue);
        if (secondDay === firstDay) {
          await ctx.reply(i18n.t(locale, 'admin_broadcast_month_days_must_differ'));
        }
      }
      schedule.monthDays.push(secondDay);
    }
  }

  const time = await waitForScheduleText(
    conversation,
    ctx,
    locale,
    i18n.t(locale, 'admin_broadcast_enter_time_generic'),
    (value) => parseBroadcastTime(value) !== null,
    i18n.t(locale, 'admin_broadcast_invalid_time'),
  );
  if (!time) return null;
  schedule.scheduledTime = time;
  return schedule;
};

const formatScheduleSummary = (
  locale: string,
  schedule: UpdateScheduledBroadcastScheduleParams,
): string => {
  const values = {
    time: schedule.scheduledTime,
    date: schedule.scheduledDate || schedule.startDate || '',
    weekday:
      schedule.weekDays?.[0] === undefined
        ? ''
        : getBroadcastWeekDayLabel(locale, schedule.weekDays[0]),
    weekday2:
      schedule.weekDays?.[1] === undefined
        ? ''
        : getBroadcastWeekDayLabel(locale, schedule.weekDays[1]),
    day: schedule.monthDays?.[0]?.toString() || '',
    day2: schedule.monthDays?.[1]?.toString() || '',
  };
  return i18n.t(locale, `schedule_summary_${schedule.scheduleType}`, values);
};

/**
 * Admin Broadcast Conversation
 * Allows admins to send messages to all users or a single user
 */
export async function adminBroadcastConversation(conversation: BotConversation, ctx: BotContext) {
  const session = await conversation.external((c) => c.session);
  const locale = session?.__language_code || 'uz';
  const adminId = ctx.from!.id;

  // Check if there's already a broadcast in progress
  const activeBroadcast = await conversation.external(async () => {
    return await BroadcastService.hasActiveBroadcast();
  });

  if (activeBroadcast) {
    await ctx.reply(i18n.t(locale, 'admin_broadcast_already_in_progress'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
    return;
  }

  // Ask for target type
  await ctx.reply(i18n.t(locale, 'admin_broadcast_select_target'), {
    reply_markup: getBroadcastTargetKeyboard(locale),
  });

  // Wait for target selection
  const targetCtx = await conversation.waitFor('callback_query:data');
  const targetData = targetCtx.callbackQuery.data;
  await targetCtx.answerCallbackQuery().catch((err) => {
    if (!isCallbackQueryExpiredError(err)) throw err;
  });

  if (targetData === 'admin_cancel') {
    await targetCtx.editMessageText(i18n.t(locale, 'admin_cancelled')).catch((err) => {
      if (!isMessageToDeleteNotFoundError(err)) throw err;
    });
    return;
  }

  const isAll = targetData === 'admin_broadcast_all';
  let targetUserId: number | undefined;
  let userCount = 0;

  if (!isAll) {
    // Ask for user ID or phone
    await targetCtx.editMessageText(i18n.t(locale, 'admin_broadcast_enter_user')).catch((err) => {
      if (!isMessageToDeleteNotFoundError(err)) throw err;
    });
    await ctx.reply(i18n.t(locale, 'admin_broadcast_enter_user_prompt'), {
      reply_markup: getAdminCancelKeyboard(locale),
    });

    const userInputCtx = await conversation.waitFor('message:text');
    const userInput = userInputCtx.message.text.trim();

    if (userInput === i18n.t(locale, 'admin_cancel')) {
      await ctx.reply(i18n.t(locale, 'admin_cancelled'), {
        reply_markup: getAdminMenuKeyboard(locale),
      });
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
        const exactPhoneUser = usersByPhone.find((u) => u.phone_number === normalized);
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
      await ctx.reply(i18n.t(locale, 'admin_user_not_found'), {
        reply_markup: getAdminMenuKeyboard(locale),
      });
      return;
    }

    // Show found user details
    const name =
      [targetUser.first_name, targetUser.last_name].filter(Boolean).join(' ') ||
      i18n.t(locale, 'admin_unknown_user');
    const phone = formatUzPhone(targetUser.phone_number);
    const lang =
      targetUser.language_code === 'uz' ? i18n.t('uz', 'uz_button') : i18n.t('ru', 'ru_button');
    const registeredDate = new Date(targetUser.created_at).toLocaleDateString(
      locale === 'uz' ? 'uz-UZ' : 'ru-RU',
    );

    let details = `${i18n.t(locale, 'admin_user_detail_header')}\n\n`;
    details += `🆔 ID: <code>${escapeHtml(targetUser.telegram_id.toString())}</code>\n`;
    details += `👤 ${i18n.t(locale, 'admin_user_name')}: ${escapeHtml(name)}\n`;
    details += `📱 ${i18n.t(locale, 'admin_phone')}: ${escapeHtml(phone)}\n`;
    details += `🌐 ${i18n.t(locale, 'admin_language')}: ${escapeHtml(lang)}\n`;
    if (targetUser.sap_card_code) {
      details += `💳 SAP: <code>${escapeHtml(targetUser.sap_card_code)}</code>\n`;
    }
    details += `📅 ${i18n.t(locale, 'admin_registered')}: ${escapeHtml(registeredDate)}`;

    await ctx.reply(details, { parse_mode: 'HTML' });

    targetUserId = targetUser.telegram_id;
    userCount = 1;
  } else {
    // Get total user count
    userCount = await conversation.external(async () => {
      return await AdminService.getUserCount();
    });
  }

  // Ask for message
  await ctx.reply(i18n.t(locale, 'admin_broadcast_enter_message'), {
    reply_markup: getAdminCancelKeyboard(locale),
  });

  const msgCtx = await conversation.wait();

  // Check for cancel
  if (msgCtx.message?.text === i18n.t(locale, 'admin_cancel')) {
    await ctx.reply(i18n.t(locale, 'admin_cancelled'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
    return;
  }

  const messageText = msgCtx.message?.text || msgCtx.message?.caption || '';
  const photoFileId = msgCtx.message?.photo?.[msgCtx.message.photo.length - 1]?.file_id;

  if (!messageText && !photoFileId) {
    await ctx.reply(i18n.t(locale, 'admin_broadcast_invalid_message'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
    return;
  }

  await ctx.reply(i18n.t(locale, 'admin_broadcast_select_delivery_mode'), {
    reply_markup: getBroadcastDeliveryModeKeyboard(locale),
  });

  const modeCtx = await conversation.waitFor('callback_query:data');
  const modeData = modeCtx.callbackQuery.data;
  await modeCtx.answerCallbackQuery().catch((err) => {
    if (!isCallbackQueryExpiredError(err)) throw err;
  });

  if (modeData === 'admin_cancel') {
    await modeCtx.editMessageText(i18n.t(locale, 'admin_cancelled')).catch((err) => {
      if (!isMessageToDeleteNotFoundError(err)) throw err;
    });
    return;
  }

  const isScheduled = modeData !== 'admin_broadcast_send_now';
  let schedule: UpdateScheduledBroadcastScheduleParams | null = null;

  if (isScheduled) {
    const parsedType = modeData.split(':')[1] as ScheduledBroadcastScheduleType;
    if (!SCHEDULE_TYPES.includes(parsedType)) {
      await ctx.reply(i18n.t(locale, 'admin_error'), {
        reply_markup: getAdminMenuKeyboard(locale),
      });
      return;
    }
    schedule = await collectBroadcastSchedule(conversation, ctx, locale, parsedType);
    if (!schedule) {
      await ctx.reply(i18n.t(locale, 'admin_cancelled'), {
        reply_markup: getAdminMenuKeyboard(locale),
      });
      return;
    }
  }

  // Show confirmation
  const confirmMessage = schedule
    ? i18n.t(locale, 'admin_broadcast_schedule_confirm', {
        count: userCount.toString(),
        schedule: formatScheduleSummary(locale, schedule),
      })
    : isAll
      ? i18n.t(locale, 'admin_broadcast_confirm', { count: userCount.toString() })
      : i18n.t(locale, 'admin_broadcast_confirm_single', { count: '1' });

  await ctx.reply(confirmMessage, { reply_markup: getBroadcastConfirmKeyboard(locale) });

  const confirmCtx = await conversation.waitFor('callback_query:data');
  const confirmData = confirmCtx.callbackQuery.data;
  await confirmCtx.answerCallbackQuery().catch((err) => {
    if (!isCallbackQueryExpiredError(err)) throw err;
  });

  if (confirmData !== 'admin_broadcast_confirm') {
    await confirmCtx.editMessageText(i18n.t(locale, 'admin_cancelled')).catch((err) => {
      if (!isMessageToDeleteNotFoundError(err)) throw err;
    });
    return;
  }

  if (schedule) {
    await conversation.external(async () => {
      return await BroadcastService.createScheduledBroadcast({
        adminTelegramId: adminId,
        messageText,
        photoFileId,
        targetType: isAll ? 'all' : 'single',
        targetUserId,
        ...schedule!,
      });
    });

    await confirmCtx
      .editMessageText(
        i18n.t(locale, 'admin_broadcast_schedule_saved', {
          schedule: formatScheduleSummary(locale, schedule),
        }),
      )
      .catch((err) => {
        if (!isMessageToDeleteNotFoundError(err)) throw err;
      });
    await ctx.reply(i18n.t(locale, 'admin_broadcast_schedule_saved_menu'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
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

  await confirmCtx.editMessageText(i18n.t(locale, 'admin_broadcast_started')).catch((err) => {
    if (!isMessageToDeleteNotFoundError(err)) throw err;
  });

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
          }),
        );
      } catch (error) {
        logger.error('Broadcast error:', error);
        await ctx.api.sendMessage(adminId, i18n.t(locale, 'admin_broadcast_error'));
      }
    });

    await ctx.reply(i18n.t(locale, 'admin_broadcast_processing', { count: userCount.toString() }), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
  } else {
    // For single user, send immediately
    const success = await conversation.external(async () => {
      return await BroadcastService.sendToUser(targetUserId!, messageText, photoFileId);
    });

    if (success) {
      await ctx.reply(i18n.t(locale, 'admin_broadcast_sent'), {
        reply_markup: getAdminMenuKeyboard(locale),
      });
    } else {
      await ctx.reply(i18n.t(locale, 'admin_broadcast_failed'), {
        reply_markup: getAdminMenuKeyboard(locale),
      });
    }

    // Update broadcast status
    await conversation.external(async () => {
      await BroadcastService.updateBroadcastStatus(
        broadcast.id,
        success ? 'completed' : 'failed',
        success ? 1 : 0,
        success ? 0 : 1,
      );
    });
  }
}

export async function adminScheduledBroadcastEditConversation(
  conversation: BotConversation,
  ctx: BotContext,
) {
  const session = await conversation.external((c) => c.session);
  const locale = session?.__language_code || 'uz';
  const target = session?.adminScheduledBroadcastEditTarget;

  if (!target) {
    await ctx.reply(i18n.t(locale, 'admin_error'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
    return;
  }

  try {
    const scheduledBroadcast = await conversation.external(() =>
      BroadcastService.getScheduledBroadcastById(target.broadcastId),
    );
    if (!scheduledBroadcast) {
      await ctx.reply(i18n.t(locale, 'admin_scheduled_not_found'), {
        reply_markup: getAdminMenuKeyboard(locale),
      });
      return;
    }

    if (target.field === 'message') {
      await ctx.reply(i18n.t(locale, 'admin_scheduled_enter_new_message'), {
        reply_markup: getAdminCancelKeyboard(locale),
      });
      const messageCtx = await conversation.wait();
      if (messageCtx.message?.text && isCancelText(messageCtx.message.text, locale)) {
        await ctx.reply(i18n.t(locale, 'admin_cancelled'), {
          reply_markup: getAdminMenuKeyboard(locale),
        });
        return;
      }

      const messageText = messageCtx.message?.text || messageCtx.message?.caption || '';
      const photoFileId = messageCtx.message?.photo?.[messageCtx.message.photo.length - 1]?.file_id;
      if (!messageText && !photoFileId) {
        await ctx.reply(i18n.t(locale, 'admin_broadcast_invalid_message'), {
          reply_markup: getAdminMenuKeyboard(locale),
        });
        return;
      }

      await conversation.external(() =>
        BroadcastService.updateScheduledBroadcastMessage(
          target.broadcastId,
          messageText,
          photoFileId,
        ),
      );
    } else {
      const schedule = await collectBroadcastSchedule(conversation, ctx, locale);
      if (!schedule) {
        await ctx.reply(i18n.t(locale, 'admin_cancelled'), {
          reply_markup: getAdminMenuKeyboard(locale),
        });
        return;
      }
      await conversation.external(() =>
        BroadcastService.updateScheduledBroadcastSchedule(target.broadcastId, schedule),
      );
    }

    await ctx.reply(
      i18n.t(
        locale,
        target.field === 'message'
          ? 'admin_scheduled_message_updated'
          : 'admin_scheduled_schedule_updated',
      ),
      { reply_markup: getAdminMenuKeyboard(locale) },
    );
  } finally {
    await conversation.external((c) => {
      if (c.session) c.session.adminScheduledBroadcastEditTarget = undefined;
    });
  }
}

/**
 * Admin Search Conversation
 * Allows admins to search for users
 */
export async function adminSearchConversation(conversation: BotConversation, ctx: BotContext) {
  const session = await conversation.external((c) => c.session);
  const locale = session?.__language_code || 'uz';

  // Ask for search term
  await ctx.reply(i18n.t(locale, 'admin_search_prompt'), {
    reply_markup: getAdminCancelKeyboard(locale),
  });

  const searchCtx = await conversation.waitFor('message:text');
  const searchTerm = searchCtx.message.text.trim();

  if (searchTerm === i18n.t(locale, 'admin_cancel')) {
    await ctx.reply(i18n.t(locale, 'admin_cancelled'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
    return;
  }

  // Search users
  const users = await conversation.external(async () => {
    return await AdminService.searchUsers(searchTerm, 10);
  });

  if (users.length === 0) {
    await ctx.reply(i18n.t(locale, 'admin_search_no_results', { query: searchTerm }), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
    return;
  }

  // Build results message
  let message = i18n.t(locale, 'admin_search_results', { query: searchTerm }) + '\n\n';

  users.forEach((user, index) => {
    const name =
      [user.first_name, user.last_name].filter(Boolean).join(' ') ||
      i18n.t(locale, 'admin_unknown_user');
    const phone = formatUzPhone(user.phone_number);
    const banned = user.is_support_banned ? ' 🚫' : '';

    message += `${index + 1}. <b>${escapeHtml(name)}</b>${banned}\n`;
    message += `   📱 ${escapeHtml(phone)}\n`;
    message += `   🆔 <code>${escapeHtml(user.telegram_id.toString())}</code>\n\n`;
  });

  await ctx.reply(message, {
    parse_mode: 'HTML',
    reply_markup: getAdminMenuKeyboard(locale),
  });
}

/**
 * Admin Send Message Conversation
 * Allows admins to send a message to a specific user
 */
export async function adminSendMessageConversation(conversation: BotConversation, ctx: BotContext) {
  const session = await conversation.external((c) => c.session);
  const locale = session?.__language_code || 'uz';
  const targetUserId = session?.adminSendTargetUser;

  if (!targetUserId) {
    await ctx.reply(i18n.t(locale, 'admin_error'));
    return;
  }

  // Ask for message
  await ctx.reply(i18n.t(locale, 'admin_send_enter_message'), {
    reply_markup: getAdminCancelKeyboard(locale),
  });

  const msgCtx = await conversation.wait();

  // Check for cancel
  if (msgCtx.message?.text === i18n.t(locale, 'admin_cancel')) {
    await ctx.reply(i18n.t(locale, 'admin_cancelled'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
    // Clear session
    await conversation.external((c) => {
      if (c.session) c.session.adminSendTargetUser = undefined;
    });
    return;
  }

  const messageText = msgCtx.message?.text || msgCtx.message?.caption || '';
  const photoFileId = msgCtx.message?.photo?.[msgCtx.message.photo.length - 1]?.file_id;

  if (!messageText && !photoFileId) {
    await ctx.reply(i18n.t(locale, 'admin_send_invalid_message'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
    return;
  }

  // Send message
  const success = await conversation.external(async () => {
    return await BroadcastService.sendToUser(targetUserId, messageText, photoFileId);
  });

  if (success) {
    await ctx.reply(i18n.t(locale, 'admin_send_success'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
  } else {
    await ctx.reply(i18n.t(locale, 'admin_send_failed'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
  }

  // Clear session
  await conversation.external((c) => {
    if (c.session) c.session.adminSendTargetUser = undefined;
  });
}

export async function adminAddBranchConversation(conversation: BotConversation, ctx: BotContext) {
  const session = await conversation.external((c) => c.session);
  const locale = session?.__language_code || 'uz';
  const cancelText = i18n.t(locale, 'admin_cancel');
  const cancelKeyboard = getAdminCancelKeyboard(locale);

  const cancelConversation = async (targetCtx: BotContext) => {
    await targetCtx.reply(i18n.t(locale, 'admin_cancelled'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
  };

  await ctx.reply(i18n.t(locale, 'admin_branch_ask_name'), {
    reply_markup: cancelKeyboard,
  });

  let branchName = '';

  while (true) {
    const nameCtx = await conversation.waitFor('message:text');
    const name = nameCtx.message.text.trim();

    if (name === cancelText) {
      await cancelConversation(nameCtx);
      return;
    }

    if (!name) {
      await nameCtx.reply(i18n.t(locale, 'admin_branch_name_required'), {
        reply_markup: cancelKeyboard,
      });
      continue;
    }

    const existingBranch = await conversation.external(() => BranchService.getByName(name));
    if (existingBranch) {
      await nameCtx.reply(i18n.t(locale, 'admin_branch_name_exists'), {
        reply_markup: cancelKeyboard,
      });
      continue;
    }

    branchName = name;
    break;
  }

  await ctx.reply(i18n.t(locale, 'admin_branch_ask_location'), {
    reply_markup: cancelKeyboard,
  });

  let latitude = 0;
  let longitude = 0;
  let address = '';

  while (true) {
    const locationCtx = await conversation.wait();

    if (locationCtx.message?.text === cancelText) {
      await cancelConversation(locationCtx);
      return;
    }

    if (!locationCtx.message?.location) {
      await locationCtx.reply(i18n.t(locale, 'admin_branch_location_required'), {
        reply_markup: cancelKeyboard,
      });
      continue;
    }

    latitude = locationCtx.message.location.latitude;
    longitude = locationCtx.message.location.longitude;

    const resolvedAddress = await conversation.external(() =>
      BranchService.reverseGeocode(latitude, longitude),
    );

    if (!resolvedAddress) {
      await locationCtx.reply(i18n.t(locale, 'admin_branch_address_lookup_failed'), {
        reply_markup: cancelKeyboard,
      });
      continue;
    }

    address = resolvedAddress;
    await locationCtx.reply(i18n.t(locale, 'admin_branch_address_detected', { address }));
    break;
  }

  await ctx.reply(i18n.t(locale, 'admin_branch_ask_work_time'), {
    reply_markup: cancelKeyboard,
  });

  let workTime = '';

  while (true) {
    const workTimeCtx = await conversation.waitFor('message:text');
    const value = workTimeCtx.message.text.trim();

    if (value === cancelText) {
      await cancelConversation(workTimeCtx);
      return;
    }

    if (!parseWorkTimeRange(value)) {
      await workTimeCtx.reply(i18n.t(locale, 'admin_branch_invalid_work_time'), {
        reply_markup: cancelKeyboard,
      });
      continue;
    }

    workTime = value;
    break;
  }

  await ctx.reply(i18n.t(locale, 'admin_branch_ask_phone'), {
    reply_markup: getAdminBranchPhoneKeyboard(locale),
  });

  let supportPhone: string | null = null;

  while (true) {
    const phoneCtx = await conversation.wait();

    if (phoneCtx.callbackQuery?.data === 'admin_branch_skip_phone') {
      await phoneCtx.answerCallbackQuery();
      break;
    }

    if (phoneCtx.message?.text === cancelText) {
      await cancelConversation(phoneCtx);
      return;
    }

    if (!phoneCtx.message?.text) {
      await phoneCtx.reply(i18n.t(locale, 'admin_branch_invalid_phone'), {
        reply_markup: getAdminBranchPhoneKeyboard(locale),
      });
      continue;
    }

    const normalizedPhone = formatUzPhone(phoneCtx.message.text);
    if (!/^\+998\d{9}$/.test(normalizedPhone)) {
      await phoneCtx.reply(i18n.t(locale, 'admin_branch_invalid_phone'), {
        reply_markup: getAdminBranchPhoneKeyboard(locale),
      });
      continue;
    }

    supportPhone = normalizedPhone;
    break;
  }

  try {
    await conversation.external(() =>
      BranchService.create({
        name: branchName,
        address,
        latitude,
        longitude,
        workTime,
        supportPhone,
      }),
    );

    await ctx.reply(i18n.t(locale, 'admin_branch_created'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
  } catch (error) {
    logger.error('Error creating branch:', error);
    await ctx.reply(i18n.t(locale, 'admin_branch_create_error'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
  }
}
