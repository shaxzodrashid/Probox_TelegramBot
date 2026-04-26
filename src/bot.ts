import { Bot, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { BotContext, SessionData } from './types/context';
import { i18n } from './i18n';
import { hears } from '@grammyjs/i18n';
import { config } from './config';
import { logger } from './utils/logger';
import { loggerMiddleware } from './middlewares/logger.middleware';
import { sessionRestorerMiddleware } from './middlewares/session.middleware';

import { startHandler } from './handlers/start.handler';
import { helpHandler, aboutHandler } from './handlers/help.handler';
import {
  contractsHandler,
  contractsPaginationHandler,
  contractDetailHandler,
  backToContractsHandler,
  backToMenuHandler,
  downloadPdfHandler,
  contractSelectionHandler,
  backFromContractsToMenuHandler
} from './handlers/contracts.handler';
import {
  paymentsHandler,
  paymentSelectionHandler,
  backFromPaymentsToMenuHandler
} from './handlers/payments.handler';
import { registrationConversation } from './conversations/registration.conversation';
import { changeNameConversation, changePhoneConversation } from './conversations/settings.conversation';
import { supportConversation } from './conversations/support.conversation';
import { adminReplyConversation } from './conversations/admin-reply.conversation';
import {
  adminBroadcastConversation,
  adminSearchConversation,
  adminSendMessageConversation,
  adminAddBranchConversation
} from './conversations/admin.conversation';
import {
  adminCouponSearchConversation,
  adminPrizeCreateConversation,
  adminPrizeEditConversation,
  adminPromotionCreateConversation,
  adminPromotionEditConversation,
} from './conversations/admin-campaign.conversation';
import {
  adminTemplateCreateConversation,
  adminTemplateEditConversation
} from './conversations/admin-template.conversation';
import {
  adminFaqCreateConversation,
  adminFaqEditConversation
} from './conversations/admin-faq.conversation';
import { branchesConversation } from './conversations/branches.conversation';
import { supportHandler } from './handlers/support.handler';
import {
  handleReplyButton,
  handleCloseButton,
  handleBlockButton,
  handleViewReplyButton
} from './handlers/admin-reply.handler';
import {
  adminMenuHandler,
  adminUsersHandler,
  adminUsersPaginationHandler,
  adminUserDetailHandler,
  adminBlockSupportHandler,
  adminUnblockSupportHandler,
  adminStatsHandler,
  adminExportHandler,
  adminBackToMenuHandler,
  adminBackToMainMenuHandler,
  adminBroadcastHandler,
  adminSendMessageHandler,
  adminBranchesHandler,
  adminBranchDetailHandler,
  adminBranchCreateHandler,
  adminBranchDeactivateConfirmHandler,
  adminBranchDeactivateHandler,
  adminCampaignPromotionsHandler,
  adminPromotionPageHandler,
  adminPromotionDetailHandler,
  adminPromotionBackToListHandler,
  adminPromotionCreateHandler,
  adminPromotionEditHandler,
  adminPromotionToggleHandler,
  adminPromotionAssignCouponsToggleHandler,
  adminPromotionArchiveHandler,
  adminPromotionImageRemoveHandler,
  adminCampaignPrizesHandler,
  adminPrizeBackToListHandler,
  adminPrizeCreateHandler,
  adminPrizeDeleteHandler,
  adminPrizeDetailHandler,
  adminPrizeEditHandler,
  adminPrizeImageRemoveHandler,
  adminPrizePageHandler,
  adminPrizeToggleHandler,
  adminCampaignTemplatesHandler,
  adminTemplateDetailHandler,
  adminTemplateToggleHandler,
  adminTemplateDeleteHandler,
  adminTemplateCreateHandler,
  adminTemplateEditHandler,
  adminTemplateBackToListHandler,
  adminTemplatePageHandler,
  adminCampaignCouponSearchHandler,
  adminCampaignCouponExportHandler,
  adminCouponMarkWinnerHandler,
  adminWinnerPrizeSelectHandler,
  adminFaqSectionHandler,
  adminFaqCreateHandler,
  adminFaqResumeHandler,
  adminFaqPageHandler,
  adminFaqDetailHandler,
  adminFaqBackToListHandler,
  adminFaqEditHandler,
  adminFaqDeleteHandler,
  adminFaqDeleteConfirmHandler,
  adminFaqDeleteCancelHandler
} from './handlers/admin.handler';
import {
  campaignBackToPromotionsHandler,
  campaignBackToMenuHandler,
  couponsHandler,
  promotionDetailHandler,
  promotionSelectionHandler,
  promotionsHandler
} from './handlers/campaign.handler';
import { branchesHandler } from './handlers/branches.handler';
import {
  ADMIN_PRIZE_BACK_TO_LIST_CALLBACK,
  ADMIN_PRIZE_CREATE_CALLBACK,
  ADMIN_PRIZE_DELETE_CALLBACK_PREFIX,
  ADMIN_PRIZE_DETAIL_CALLBACK_PREFIX,
  ADMIN_PRIZE_EDIT_CALLBACK_PREFIX,
  ADMIN_PRIZE_IMAGE_REMOVE_CALLBACK_PREFIX,
  ADMIN_PRIZE_PAGE_CALLBACK_PREFIX,
  ADMIN_PRIZE_TOGGLE_CALLBACK_PREFIX,
  ADMIN_PROMOTION_ARCHIVE_CALLBACK_PREFIX,
  ADMIN_PROMOTION_BACK_TO_LIST_CALLBACK,
  ADMIN_PROMOTION_CREATE_CALLBACK,
  ADMIN_PROMOTION_DETAIL_CALLBACK_PREFIX,
  ADMIN_PROMOTION_EDIT_CALLBACK_PREFIX,
  ADMIN_PROMOTION_IMAGE_REMOVE_CALLBACK_PREFIX,
  ADMIN_PROMOTION_PAGE_CALLBACK_PREFIX,
  ADMIN_PROMOTION_TOGGLE_CALLBACK_PREFIX,
  ADMIN_PROMOTION_ASSIGN_COUPONS_TOGGLE_CALLBACK_PREFIX,
  ADMIN_WINNER_PRIZE_SELECT_CALLBACK_PREFIX
} from './keyboards/campaign.keyboards';
import {
  ADMIN_BRANCH_DEACTIVATE_CALLBACK_PREFIX,
  ADMIN_BRANCH_DEACTIVATE_CONFIRM_CALLBACK_PREFIX,
  ADMIN_BRANCH_DETAIL_CALLBACK_PREFIX
} from './keyboards/branch.keyboards';
import {
  ADMIN_TEMPLATE_PAGE_CALLBACK_PREFIX,
  ADMIN_TEMPLATE_DETAIL_CALLBACK_PREFIX,
  ADMIN_TEMPLATE_EDIT_CALLBACK_PREFIX,
  ADMIN_TEMPLATE_TOGGLE_CALLBACK_PREFIX,
  ADMIN_TEMPLATE_DELETE_CALLBACK_PREFIX,
  ADMIN_TEMPLATE_CREATE_CALLBACK,
  ADMIN_TEMPLATE_BACK_TO_LIST_CALLBACK
} from './keyboards/template.keyboards';
import {
  ADMIN_FAQ_BACK_CALLBACK,
  ADMIN_FAQ_BACK_TO_LIST_CALLBACK,
  ADMIN_FAQ_CREATE_CALLBACK,
  ADMIN_FAQ_DELETE_CALLBACK_PREFIX,
  ADMIN_FAQ_DELETE_CANCEL_CALLBACK_PREFIX,
  ADMIN_FAQ_DELETE_CONFIRM_CALLBACK_PREFIX,
  ADMIN_FAQ_DETAIL_CALLBACK_PREFIX,
  ADMIN_FAQ_EDIT_CALLBACK_PREFIX,
  ADMIN_FAQ_PAGE_CALLBACK_PREFIX,
  ADMIN_FAQ_RESUME_CALLBACK,
} from './keyboards/faq.keyboards';
import {
  settingsHandler,
  changeNameHandler,
  changePhoneHandler,
  changeLanguageHandler,
  addPassportHandler
} from './handlers/settings.handler';
import { addPassportDataConversation } from './conversations/passport.conversation';
import { logoutHandler } from './handlers/logout.handler';
import { applicationHandler } from './handlers/application.handler';
import { applicationConversation } from './conversations/application.conversation';
import { exampleConversation } from './conversations/example.conversation';
import { UserService } from './services/user.service';
import {
  isCallbackQueryExpiredError,
  isMessageToDeleteNotFoundError,
  isUserBlockedError,
} from './utils/telegram/telegram-errors';
import { enqueueSupportRequest } from './utils/support/support.util';
import { getMainKeyboardByLocale } from './keyboards';
import { FaqService } from './services/faq/faq.service';
import { ErrorNotificationService } from './services/error-notification.service';
import {
  resolveUiTextAction,
  routeUiTextAction,
} from './utils/formatting/ui-text-resolver';

import { RedisAdapter } from '@grammyjs/storage-redis';
import { redisService } from './redis/redis.service';

export const bot = new Bot<BotContext>(config.BOT_TOKEN);

// Global API transformer to set default parse_mode to HTML
bot.api.config.use((prev, method, payload, signal) => {
  if (!payload || typeof payload !== 'object') {
    return prev(method, payload, signal);
  }

  const methodsWithParseMode = [
    'sendMessage',
    'sendPhoto',
    'sendVideo',
    'sendAnimation',
    'sendAudio',
    'sendDocument',
    'sendVoice',
    'editMessageText',
    'editMessageCaption',
    'editMessageMedia',
    'copyMessage',
    'answerInlineQuery',
  ];

  if (methodsWithParseMode.includes(method) && !('parse_mode' in (payload as any))) {
    Object.assign(payload, { parse_mode: 'HTML' });
  }

  return prev(method, payload, signal);
});



// Middlewares
bot.use(loggerMiddleware);

const storage = new RedisAdapter({
  instance: redisService.getClient(),
  ttl: 3 * 24 * 60 * 60, // 3 days in seconds
});

bot.use(
  session({
    initial: (): SessionData => ({}),
    storage,
  }),
);
bot.use(i18n);
bot.use(sessionRestorerMiddleware);

bot.use(conversations());

bot.use(createConversation(exampleConversation));
bot.use(createConversation(registrationConversation));
bot.use(createConversation(changeNameConversation));
bot.use(createConversation(changePhoneConversation));
bot.use(createConversation(supportConversation));
bot.use(createConversation(adminReplyConversation));
bot.use(createConversation(adminBroadcastConversation));
bot.use(createConversation(adminSearchConversation));
bot.use(createConversation(adminSendMessageConversation));
bot.use(createConversation(adminAddBranchConversation));
bot.use(createConversation(adminCouponSearchConversation));
bot.use(createConversation(adminPrizeCreateConversation));
bot.use(createConversation(adminPrizeEditConversation));
bot.use(createConversation(adminPromotionCreateConversation));
bot.use(createConversation(adminPromotionEditConversation));
bot.use(createConversation(adminTemplateCreateConversation));
bot.use(createConversation(adminTemplateEditConversation));
bot.use(createConversation(adminFaqCreateConversation));
bot.use(createConversation(adminFaqEditConversation));
bot.use(createConversation(addPassportDataConversation));
bot.use(createConversation(applicationConversation));
bot.use(createConversation(branchesConversation));

// ─── Pending Action Router ─────────────────────────────────────────────────
// Fires AFTER all conversations have had a chance to handle the update.
// When registrationConversation or addPassportDataConversation completes,
// it leaves pendingAction in Redis. This router picks that up and transitions
// automatically to applicationConversation — but ONLY when it makes sense:
//   • No other conversation is currently active for this user
//   • The current update is not a callback that should start reg/passport itself
//   • The user is actually logged in (to avoid re-triggering the loop)
bot.use(async (ctx, next) => {
  const telegramId = ctx.from?.id;

  if (telegramId) {
    const pendingAction = await redisService.get<string>(`pendingAction:${telegramId}`);

    if (pendingAction) {
      // Skip routing if this update is one of the callbacks that transitions
      // the user INTO registration or passport — let those handlers run normally.
      const isRegistrationCallback = ctx.callbackQuery?.data === 'start_registration';
      const isPassportCallback = ctx.callbackQuery?.data === 'start_passport_conv';
      const isPassportText = ctx.message?.text === ctx.t('application_start_passport_button');
      const isBackText = ctx.message?.text === ctx.t('back') || ctx.message?.text === ctx.t('admin_reply_cancel') || ctx.message?.text === ctx.t('admin_cancel');
      const isStartCommand = ctx.message?.text === '/start';

      const isRecognizedUiText = Boolean(resolveUiTextAction(ctx.message?.text));

      if (isRecognizedUiText || isBackText || isStartCommand) {
        // User explicitly chose to go somewhere else; clear the pending redirect.
        await redisService.delete(`pendingAction:${telegramId}`);
        await next();
        return;
      }

      if (!isRegistrationCallback && !isPassportCallback && !isPassportText) {
        const active = ctx.conversation.active();
        const hasActive = Object.values(active).some((count) => count > 0);

        if (!hasActive && pendingAction === 'application') {
          // Verify the user is actually registered before auto-entering the app flow.
          // If they're not, clear the stale key and let them go through normal flow.
          const user = await UserService.getLoggedInUser(telegramId);
          if (user) {
            await redisService.delete(`pendingAction:${telegramId}`);
            if (ctx.callbackQuery) {
              await ctx.answerCallbackQuery().catch((err) => {
                if (!isCallbackQueryExpiredError(err)) throw err;
              });
              await ctx.deleteMessage().catch((err) => {
                if (!isMessageToDeleteNotFoundError(err)) throw err;
              });
            }
            await ctx.conversation.enter('applicationConversation');
            return;
          }
        }
      }
    }
  }

  await next();
});

bot.use(async (ctx, next) => {
  if (ctx.chat?.type !== 'private' || !ctx.from?.id) {
    await next();
    return;
  }

  const active = ctx.conversation.active();
  if (Object.values(active).some((count) => count > 0)) {
    await next();
    return;
  }

  const user = await UserService.getUserByTelegramId(ctx.from.id);
  if (!user?.is_admin) {
    await next();
    return;
  }

  const draft = await FaqService.getLockedDraftForAdmin(ctx.from.id);
  if (!draft) {
    await next();
    return;
  }

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery({
      text: ctx.t('admin_faq_resume_notice'),
      show_alert: false,
    }).catch((err) => {
      if (!isCallbackQueryExpiredError(err)) throw err;
    });
  }

  await ctx.conversation.enter('adminFaqCreateConversation');
});


// Error Handling
bot.catch((err) => {
  const ctx = err.ctx;
  const e = err.error;

  // Ignore expired callback queries in global error handler as well
  if (isCallbackQueryExpiredError(e)) {
    return;
  }

  // Ignore message to delete not found in global error handler
  if (isMessageToDeleteNotFoundError(e)) {
    return;
  }

  if (ctx.chat?.type === 'private' && isUserBlockedError(e)) {
    logger.warn(`Telegram delivery skipped for update ${ctx.update.update_id}: user blocked the bot.`);
    if (e instanceof Error) {
      logger.debug(e.stack || String(e));
    }
  } else {
    logger.error(`Error while handling update ${ctx.update.update_id}:`);
    if (e instanceof Error) {
      logger.error(e.stack || String(e));
    } else {
      console.error(e);
    }
  }

  void ErrorNotificationService.notifyBotError({
    api: bot.api,
    ctx,
    error: e,
  });
});

// Commands
bot.command('start', startHandler);
bot.command('help', helpHandler);
bot.command('about', aboutHandler);
bot.command('admin', adminMenuHandler);
bot.command('logout', logoutHandler);

// Callbacks
bot.callbackQuery('help', helpHandler);
bot.callbackQuery('about', aboutHandler);
bot.callbackQuery('start', startHandler);

// Main menu handlers
bot.filter(hears('menu_contracts'), contractsHandler);
bot.filter(hears('menu_payments'), paymentsHandler);
bot.filter(hears('menu_branches'), branchesHandler);
bot.filter(hears('menu_settings'), settingsHandler);
bot.filter(hears('menu_support'), supportHandler);
bot.filter(hears('menu_promotions'), promotionsHandler);
bot.filter(hears('menu_coupons'), couponsHandler);
bot.filter(hears('menu_application'), async (ctx) => {
  await applicationHandler(ctx);
});
bot.filter(hears('admin_menu'), adminMenuHandler);
bot.filter(hears('admin_menu'), adminMenuHandler);

// Admin panel handlers
bot.filter(hears('admin_users'), adminUsersHandler);
bot.filter(hears('admin_branches'), adminBranchesHandler);
bot.filter(hears('admin_broadcast'), adminBroadcastHandler);
bot.filter(hears('admin_stats'), adminStatsHandler);
bot.filter(hears('admin_export'), adminExportHandler);
bot.filter(hears('admin_campaign_promotions'), adminCampaignPromotionsHandler);
bot.filter(hears('admin_campaign_prizes'), adminCampaignPrizesHandler);
bot.filter(hears('admin_campaign_templates'), adminCampaignTemplatesHandler);
bot.filter(hears('admin_campaign_coupon_search'), adminCampaignCouponSearchHandler);
bot.filter(hears('admin_campaign_coupon_export'), adminCampaignCouponExportHandler);
bot.filter(hears('admin_faqs'), adminFaqSectionHandler);
bot.filter(hears('back_to_user_menu'), adminBackToMainMenuHandler);

// Settings keyboard handlers
bot.filter(hears('settings_change_name'), changeNameHandler);
bot.filter(hears('settings_change_phone'), changePhoneHandler);
bot.filter(hears('settings_change_language'), changeLanguageHandler);
bot.filter(hears('settings_add_passport'), addPassportHandler);
bot.filter(hears('application_start_passport_button'), addPassportHandler);

// Language selection handlers for both callback and keyboard
const handleLanguageSelection = async (ctx: BotContext, lang: 'uz' | 'ru') => {
  ctx.session.__language_code = lang;
  ctx.session.languageSelected = true;
  await ctx.i18n.setLocale(lang);

  const telegramId = ctx.from?.id;
  if (telegramId) {
    await UserService.updateUserLanguage(telegramId, lang);
  }

  if (ctx.callbackQuery) {
    await ctx.deleteMessage().catch((err) => {
      if (!isMessageToDeleteNotFoundError(err)) throw err;
    });
    await ctx.answerCallbackQuery().catch((err) => {
      if (!isCallbackQueryExpiredError(err)) throw err;
    });
  }

  await startHandler(ctx);
};

bot.callbackQuery('set_lang_uz', (ctx) => handleLanguageSelection(ctx, 'uz'));
bot.callbackQuery('set_lang_ru', (ctx) => handleLanguageSelection(ctx, 'ru'));
bot.filter(hears('uz_button'), (ctx) => handleLanguageSelection(ctx, 'uz'));
bot.filter(hears('ru_button'), (ctx) => handleLanguageSelection(ctx, 'ru'));

// Contracts callback handlers
bot.callbackQuery(/^contracts_page:\d+$/, contractsPaginationHandler);
bot.callbackQuery(/^contract_detail:.+$/, contractDetailHandler);
bot.callbackQuery('back_to_contracts', backToContractsHandler);
bot.callbackQuery('back_to_menu', backToMenuHandler);
bot.callbackQuery('download_pdf', downloadPdfHandler);

// Generic listener for numbered selection from reply keyboard
// This handler checks session to determine if it's contracts or payments
bot.hears(/^\d+\./, async (ctx) => {
  // If payments are in session, use payments handler
  if (ctx.session.payments && ctx.session.payments.length > 0) {
    return paymentSelectionHandler(ctx);
  }
  // Otherwise default to contracts handler
  return contractSelectionHandler(ctx);
});

bot.on('message:text', async (ctx, next) => {
  if (ctx.session.promotions?.length) {
    const text = ctx.message.text.trim();
    const isPromotionTitle = ctx.session.promotions.some((promotion) => promotion.title === text);

    if (isPromotionTitle) {
      await promotionSelectionHandler(ctx);
      return;
    }
  }

  await next();
});

// Back to menu from contracts/payments keyboard
bot.filter(hears('back'), async (ctx) => {
  // If payments are in session, clear payments and go back
  if (ctx.session.payments && ctx.session.payments.length > 0) {
    return backFromPaymentsToMenuHandler(ctx);
  }
  // Otherwise use contracts back handler
  return backFromContractsToMenuHandler(ctx);
});

// Route stale or cross-locale reply-keyboard texts before support fallback.
bot.on('message:text', async (ctx, next) => {
  if (ctx.chat?.type !== 'private') {
    await next();
    return;
  }

  if (ctx.message.text.startsWith('/')) {
    await next();
    return;
  }

  const active = ctx.conversation.active();
  if (Object.values(active).some((count) => count > 0)) {
    await next();
    return;
  }

  const resolution = resolveUiTextAction(ctx.message.text);
  if (!resolution) {
    await next();
    return;
  }

  await routeUiTextAction(ctx, resolution);
});

// Settings callback handlers
bot.callbackQuery('change_name', changeNameHandler);
bot.callbackQuery('change_phone', changePhoneHandler);
bot.callbackQuery('change_language', changeLanguageHandler);
bot.callbackQuery('start_registration', async (ctx) => {
  await ctx.deleteMessage().catch((err) => {
    if (!isMessageToDeleteNotFoundError(err)) throw err;
  });
  await ctx.conversation.exitAll();
  await ctx.conversation.enter('registrationConversation');
});
bot.callbackQuery('open_settings', settingsHandler);

// Support ticket callback handlers (Admin Group)
bot.callbackQuery(/^support_reply:.+$/, handleReplyButton);
bot.callbackQuery(/^support_close:.+$/, handleCloseButton);
bot.callbackQuery(/^support_block:.+$/, handleBlockButton);
bot.callbackQuery(/^support_view_reply:.+$/, handleViewReplyButton);

// Admin panel callback handlers
bot.callbackQuery(/^admin_users_page:\d+$/, adminUsersPaginationHandler);
bot.callbackQuery(/^admin_user_detail:\d+$/, adminUserDetailHandler);
bot.callbackQuery(/^admin_block_support:\d+$/, adminBlockSupportHandler);
bot.callbackQuery(/^admin_unblock_support:\d+$/, adminUnblockSupportHandler);
bot.callbackQuery(/^admin_send_message:\d+$/, adminSendMessageHandler);
bot.callbackQuery(/^admin_coupon_mark_winner:.+$/, adminCouponMarkWinnerHandler);
bot.callbackQuery(new RegExp(`^${ADMIN_WINNER_PRIZE_SELECT_CALLBACK_PREFIX}.+`), adminWinnerPrizeSelectHandler);
bot.callbackQuery(/^promotion_detail:\d+$/, promotionDetailHandler);
bot.callbackQuery('campaign_open_coupons', couponsHandler);
bot.callbackQuery('campaign_back_to_promotions', campaignBackToPromotionsHandler);
bot.callbackQuery('campaign_back_to_menu', campaignBackToMenuHandler);
bot.callbackQuery(new RegExp(`^${ADMIN_PROMOTION_PAGE_CALLBACK_PREFIX}\\d+$`), adminPromotionPageHandler);
bot.callbackQuery(new RegExp(`^${ADMIN_PROMOTION_DETAIL_CALLBACK_PREFIX}\\d+$`), adminPromotionDetailHandler);
bot.callbackQuery(ADMIN_PROMOTION_CREATE_CALLBACK, adminPromotionCreateHandler);
bot.callbackQuery(new RegExp(`^${ADMIN_PROMOTION_EDIT_CALLBACK_PREFIX}\\d+:[a-z_]+$`), adminPromotionEditHandler);
bot.callbackQuery(new RegExp(`^${ADMIN_PROMOTION_TOGGLE_CALLBACK_PREFIX}\\d+$`), adminPromotionToggleHandler);
bot.callbackQuery(new RegExp(`^${ADMIN_PROMOTION_ASSIGN_COUPONS_TOGGLE_CALLBACK_PREFIX}\\d+$`), adminPromotionAssignCouponsToggleHandler);
bot.callbackQuery(new RegExp(`^${ADMIN_PROMOTION_ARCHIVE_CALLBACK_PREFIX}\\d+$`), adminPromotionArchiveHandler);
bot.callbackQuery(new RegExp(`^${ADMIN_PROMOTION_IMAGE_REMOVE_CALLBACK_PREFIX}\\d+$`), adminPromotionImageRemoveHandler);
bot.callbackQuery(ADMIN_PROMOTION_BACK_TO_LIST_CALLBACK, adminPromotionBackToListHandler);
bot.callbackQuery(new RegExp(`^${ADMIN_PRIZE_PAGE_CALLBACK_PREFIX}\\d+$`), adminPrizePageHandler);
bot.callbackQuery(new RegExp(`^${ADMIN_PRIZE_DETAIL_CALLBACK_PREFIX}\\d+$`), adminPrizeDetailHandler);
bot.callbackQuery(ADMIN_PRIZE_CREATE_CALLBACK, adminPrizeCreateHandler);
bot.callbackQuery(new RegExp(`^${ADMIN_PRIZE_EDIT_CALLBACK_PREFIX}\\d+:[a-z_]+$`), adminPrizeEditHandler);
bot.callbackQuery(new RegExp(`^${ADMIN_PRIZE_TOGGLE_CALLBACK_PREFIX}\\d+$`), adminPrizeToggleHandler);
bot.callbackQuery(new RegExp(`^${ADMIN_PRIZE_DELETE_CALLBACK_PREFIX}\\d+$`), adminPrizeDeleteHandler);
bot.callbackQuery(new RegExp(`^${ADMIN_PRIZE_IMAGE_REMOVE_CALLBACK_PREFIX}\\d+$`), adminPrizeImageRemoveHandler);
bot.callbackQuery(ADMIN_PRIZE_BACK_TO_LIST_CALLBACK, adminPrizeBackToListHandler);
bot.callbackQuery(new RegExp(`^${ADMIN_TEMPLATE_PAGE_CALLBACK_PREFIX}\\d+$`), adminTemplatePageHandler);
bot.callbackQuery(new RegExp(`^${ADMIN_TEMPLATE_DETAIL_CALLBACK_PREFIX}\\d+$`), adminTemplateDetailHandler);
bot.callbackQuery(ADMIN_TEMPLATE_CREATE_CALLBACK, adminTemplateCreateHandler);
bot.callbackQuery(new RegExp(`^${ADMIN_TEMPLATE_EDIT_CALLBACK_PREFIX}\\d+:[a-z_]+$`), adminTemplateEditHandler);
bot.callbackQuery(new RegExp(`^${ADMIN_TEMPLATE_TOGGLE_CALLBACK_PREFIX}\\d+$`), adminTemplateToggleHandler);
bot.callbackQuery(new RegExp(`^${ADMIN_TEMPLATE_DELETE_CALLBACK_PREFIX}\\d+$`), adminTemplateDeleteHandler);
bot.callbackQuery(ADMIN_TEMPLATE_BACK_TO_LIST_CALLBACK, adminTemplateBackToListHandler);
bot.callbackQuery(ADMIN_FAQ_CREATE_CALLBACK, adminFaqCreateHandler);
bot.callbackQuery(ADMIN_FAQ_RESUME_CALLBACK, adminFaqResumeHandler);
bot.callbackQuery(new RegExp(`^${ADMIN_FAQ_PAGE_CALLBACK_PREFIX}\\d+$`), adminFaqPageHandler);
bot.callbackQuery(new RegExp(`^${ADMIN_FAQ_DETAIL_CALLBACK_PREFIX}\\d+$`), adminFaqDetailHandler);
bot.callbackQuery(new RegExp(`^${ADMIN_FAQ_EDIT_CALLBACK_PREFIX}\\d+:[a-z_]+$`), adminFaqEditHandler);
bot.callbackQuery(new RegExp(`^${ADMIN_FAQ_DELETE_CALLBACK_PREFIX}\\d+$`), adminFaqDeleteHandler);
bot.callbackQuery(new RegExp(`^${ADMIN_FAQ_DELETE_CONFIRM_CALLBACK_PREFIX}\\d+$`), adminFaqDeleteConfirmHandler);
bot.callbackQuery(new RegExp(`^${ADMIN_FAQ_DELETE_CANCEL_CALLBACK_PREFIX}\\d+$`), adminFaqDeleteCancelHandler);
bot.callbackQuery(ADMIN_FAQ_BACK_TO_LIST_CALLBACK, adminFaqBackToListHandler);
bot.callbackQuery(ADMIN_FAQ_BACK_CALLBACK, adminBackToMenuHandler);

bot.callbackQuery(new RegExp(`^${ADMIN_BRANCH_DETAIL_CALLBACK_PREFIX}.+$`), adminBranchDetailHandler);
bot.callbackQuery('admin_branch_add', adminBranchCreateHandler);
bot.callbackQuery(new RegExp(`^${ADMIN_BRANCH_DEACTIVATE_CONFIRM_CALLBACK_PREFIX}.+$`), adminBranchDeactivateConfirmHandler);
bot.callbackQuery(new RegExp(`^${ADMIN_BRANCH_DEACTIVATE_CALLBACK_PREFIX}.+$`), adminBranchDeactivateHandler);
bot.callbackQuery('admin_branches_back', adminBranchesHandler);
bot.callbackQuery('admin_back_to_menu', adminBackToMenuHandler);
bot.callbackQuery('admin_back_to_users', adminUsersHandler);
bot.callbackQuery('admin_cancel', adminBackToMainMenuHandler);
bot.callbackQuery('admin_broadcast_all', (ctx) =>
  ctx.answerCallbackQuery().catch((err) => {
    if (!isCallbackQueryExpiredError(err)) throw err;
  }),
);
bot.callbackQuery('admin_broadcast_single', (ctx) =>
  ctx.answerCallbackQuery().catch((err) => {
    if (!isCallbackQueryExpiredError(err)) throw err;
  }),
);
bot.callbackQuery('admin_broadcast_confirm', (ctx) =>
  ctx.answerCallbackQuery().catch((err) => {
    if (!isCallbackQueryExpiredError(err)) throw err;
  }),
);
bot.callbackQuery('start_passport_conv', async (ctx) => {
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery().catch((err) => {
      if (!isCallbackQueryExpiredError(err)) throw err;
    });
  }
  await ctx.deleteMessage().catch((err) => {
    if (!isMessageToDeleteNotFoundError(err)) throw err;
  });
  await ctx.conversation.exitAll();
  await ctx.conversation.enter('addPassportDataConversation');
});
bot.callbackQuery('promo_application_cta', applicationHandler);
bot.callbackQuery('noop', (ctx) =>
  ctx.answerCallbackQuery().catch((err) => {
    if (!isCallbackQueryExpiredError(err)) throw err;
  }),
);
// Fallback: if the router didn't handle continue_to_application (e.g. user already logged in
// but no pending action), just dismiss the spinner.
bot.callbackQuery('continue_to_application', async (ctx) => {
  await ctx.answerCallbackQuery().catch((err) => {
    if (!isCallbackQueryExpiredError(err)) throw err;
  });
  await ctx.deleteMessage().catch((err) => {
    if (!isMessageToDeleteNotFoundError(err)) throw err;
  });
});

// ─── Always-On Support Catch-All ───────────────────────────────────────────
// Captures any unhandled text or photo messages in private chats and 
// processes them as support tickets.
bot.on(['message:text', 'message:photo'], async (ctx) => {
  if (ctx.chat.type !== 'private') return; // Ignore groups

  const active = ctx.conversation.active();
  if (Object.values(active).some((count) => count > 0)) {
    return; // Ignore if in a conversation (they handle their own input)
  }

  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const isRegistrationActive = await redisService.exists(`registrationActive:${telegramId}`);
  if (isRegistrationActive) {
    return; // Ignore while registration is waiting for phone/OTP input
  }

  // Also ignore if it's a command (already handled by bot.command)
  if (ctx.message.text?.startsWith('/')) return;

  // 1. Get or create user
  let user = await UserService.getUserByTelegramId(telegramId);
  if (!user) {
    const locale = (await ctx.i18n.getLocale()) || 'uz';
    user = await UserService.createUser({
        telegram_id: telegramId,
        first_name: ctx.from?.first_name,
        last_name: ctx.from?.last_name,
        language_code: locale,
    });
  }

  // 2. Check if user is banned from support
  if (user.is_support_banned) {
      const locale = (await ctx.i18n.getLocale()) || 'uz';
      const isLoggedIn = user ? !user.is_logged_out : false;
      await ctx.reply(ctx.t('support_banned'), {
          reply_markup: getMainKeyboardByLocale(locale, false, isLoggedIn),
      });
      return;
  }

  // 3. Process the support request
  const locale = (await ctx.i18n.getLocale()) || 'uz';
  const text = ctx.message.text?.trim() || ctx.message.caption?.trim() || `[${ctx.t('admin_broadcast_enter_message')}]`;
  const photoFileId = ctx.message.photo?.[ctx.message.photo.length - 1].file_id;

  try {
    await enqueueSupportRequest(
        bot.api,
        ctx,
        user,
        text,
        ctx.message.message_id,
        photoFileId,
        locale
    );
  } catch {
    // Already logged in processSupportRequest
  }
});
