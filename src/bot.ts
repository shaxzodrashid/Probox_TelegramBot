import { Bot, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { BotContext, SessionData } from './types/context';
import { i18n } from './i18n';
import { config } from './config';
import { logger } from './utils/logger';
import { loggerMiddleware } from './middlewares/logger.middleware';
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
import { registrationConversation } from './conversations/registration.conversation';
import { changeNameConversation, changePhoneConversation } from './conversations/settings.conversation';
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
bot.use(conversations());

bot.use(createConversation(exampleConversation));
bot.use(createConversation(registrationConversation));
bot.use(createConversation(changeNameConversation));
bot.use(createConversation(changePhoneConversation));

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

// Callbacks
bot.callbackQuery('help', helpHandler);
bot.callbackQuery('about', aboutHandler);
bot.callbackQuery('start', startHandler);

// Contracts menu button handler (matches text from keyboard)
bot.hears([/📄 Shartnomalarim/, /📄 Мои контракты/], contractsHandler);

// Settings menu button handler
bot.hears([/⚙️ Sozlamalar/, /⚙️ Настройки/], settingsHandler);

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

// Generic listener for contract selection from reply keyboard
bot.hears(/^\d+\./, contractSelectionHandler);

// Back to menu from contracts keyboard
bot.hears([/🔙 Orqaga/, /🔙 Назад/], backFromContractsToMenuHandler);

// Settings callback handlers
bot.callbackQuery('change_name', changeNameHandler);
bot.callbackQuery('change_phone', changePhoneHandler);
bot.callbackQuery('change_language', changeLanguageHandler);
bot.callbackQuery('open_settings', settingsHandler);
