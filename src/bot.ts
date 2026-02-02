import { Bot, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { BotContext, SessionData } from './types/context';
import { i18n } from './i18n';
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
  adminSendMessageConversation
} from './conversations/admin.conversation';
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
  adminSendMessageHandler
} from './handlers/admin.handler';
import {
  settingsHandler,
  changeNameHandler,
  changePhoneHandler,
  changeLanguageHandler
} from './handlers/settings.handler';
import { exampleConversation } from './conversations/example.conversation';
import { UserService } from './services/user.service';

export const bot = new Bot<BotContext>(config.BOT_TOKEN);



// Middlewares
bot.use(loggerMiddleware);
bot.use(session({ initial: (): SessionData => ({}) }));
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

// Error Handling
bot.catch((err) => {
  const ctx = err.ctx;
  logger.error(`Error while handling update ${ctx.update.update_id}:`);
  const e = err.error;
  if (e instanceof Error) {
    logger.error(e.message);
  } else {
    logger.error(String(e));
  }
});

// Commands
bot.command('start', startHandler);
bot.command('help', helpHandler);
bot.command('about', aboutHandler);
bot.command('admin', adminMenuHandler);

// Callbacks
bot.callbackQuery('help', helpHandler);
bot.callbackQuery('about', aboutHandler);
bot.callbackQuery('start', startHandler);

// Contracts menu button handler (matches text from keyboard)
bot.hears([/📄 Shartnomalarim/, /📄 Мои контракты/], contractsHandler);

// Payments menu button handler (matches text from keyboard)
bot.hears([/💳 To'lovlarim/, /💳 Мои платежи/], paymentsHandler);

// Settings menu button handler
bot.hears([/⚙️ Sozlamalar/, /⚙️ Настройки/], settingsHandler);

// Support menu button handler
bot.hears([/📞 Qo'llab-quvvatlash/, /📞 Поддержка/], supportHandler);

// Admin panel button handler
bot.hears([/👨‍💼 Admin panel/, /👨‍💼 Админ панель/], adminMenuHandler);

// Admin panel keyboard handlers
bot.hears([/👥 Foydalanuvchilar/, /👥 Пользователи/], adminUsersHandler);
bot.hears([/📢 Xabar yuborish/, /📢 Отправить сообщение/], adminBroadcastHandler);
bot.hears([/📊 Statistika/, /📊 Статистика/], adminStatsHandler);
bot.hears([/📥 Excel yuklab olish/, /📥 Скачать Excel/], adminExportHandler);
bot.hears([/👤 Foydalanuvchi menyusi/, /👤 Меню пользователя/], adminBackToMainMenuHandler);

// Settings keyboard handlers
bot.hears([/👤 Ismni o'zgartirish/, /👤 Изменить имя/], changeNameHandler);
bot.hears([/📱 Raqamni o'zgartirish/, /📱 Изменить номер/], changePhoneHandler);
bot.hears([/🌐 Tilni o'zgartirish/, /🌐 Изменить язык/], changeLanguageHandler);

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
    await ctx.deleteMessage().catch(() => { });
    await ctx.answerCallbackQuery();
  }

  await startHandler(ctx);
};

bot.callbackQuery('set_lang_uz', (ctx) => handleLanguageSelection(ctx, 'uz'));
bot.callbackQuery('set_lang_ru', (ctx) => handleLanguageSelection(ctx, 'ru'));
bot.hears("🇺🇿 O'zbekcha", (ctx) => handleLanguageSelection(ctx, 'uz'));
bot.hears("🇷🇺 Русский", (ctx) => handleLanguageSelection(ctx, 'ru'));

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

// Back to menu from contracts/payments keyboard
bot.hears([/🔙 Orqaga/, /🔙 Назад/], async (ctx) => {
  // If payments are in session, clear payments and go back
  if (ctx.session.payments && ctx.session.payments.length > 0) {
    return backFromPaymentsToMenuHandler(ctx);
  }
  // Otherwise use contracts back handler
  return backFromContractsToMenuHandler(ctx);
});

// Settings callback handlers
bot.callbackQuery('change_name', changeNameHandler);
bot.callbackQuery('change_phone', changePhoneHandler);
bot.callbackQuery('change_language', changeLanguageHandler);
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
bot.callbackQuery('admin_back_to_menu', adminBackToMenuHandler);
bot.callbackQuery('admin_back_to_users', adminUsersHandler);
bot.callbackQuery('admin_cancel', adminBackToMainMenuHandler);
bot.callbackQuery('admin_broadcast_all', (ctx) => ctx.answerCallbackQuery());
bot.callbackQuery('admin_broadcast_single', (ctx) => ctx.answerCallbackQuery());
bot.callbackQuery('admin_broadcast_confirm', (ctx) => ctx.answerCallbackQuery());
bot.callbackQuery('noop', (ctx) => ctx.answerCallbackQuery());

// Registration prompt callback handler
// When user clicks the "Register" button from the registration prompt message
bot.callbackQuery('start_registration', async (ctx) => {
  // Delete the prompt message
  await ctx.deleteMessage().catch(() => { });
  await ctx.answerCallbackQuery();
  // Start the registration conversation
  await ctx.conversation.enter('registrationConversation');
});
