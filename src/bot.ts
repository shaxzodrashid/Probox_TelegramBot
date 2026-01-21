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
  downloadContractHandler,
  backToMenuHandler 
} from './handlers/contracts.handler';
import { registrationConversation } from './conversations/registration.conversation';
import { UserService } from './services/user.service';

export const bot = new Bot<BotContext>(config.BOT_TOKEN);



// Middlewares
bot.use(loggerMiddleware);
bot.use(session({ initial: (): SessionData => ({}) }));
bot.use(i18n);
bot.use(conversations());

import { exampleConversation } from './conversations/example.conversation';
bot.use(createConversation(exampleConversation));
bot.use(createConversation(registrationConversation));

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

bot.callbackQuery('set_lang_uz', async (ctx) => {
  await ctx.i18n.setLocale('uz');
  ctx.session.languageSelected = true;
  
  // Update language in database if user exists
  const telegramId = ctx.from?.id;
  if (telegramId) {
    await UserService.updateUserLanguage(telegramId, 'uz');
  }
  
  // Remove the language selection message
  await ctx.deleteMessage().catch(() => {});
  await ctx.answerCallbackQuery();
  
  await startHandler(ctx);
});

bot.callbackQuery('set_lang_ru', async (ctx) => {
  await ctx.i18n.setLocale('ru');
  ctx.session.languageSelected = true;
  
  // Update language in database if user exists
  const telegramId = ctx.from?.id;
  if (telegramId) {
    await UserService.updateUserLanguage(telegramId, 'ru');
  }
  
  // Remove the language selection message
  await ctx.deleteMessage().catch(() => {});
  await ctx.answerCallbackQuery();
  
  await startHandler(ctx);
});

// Contracts menu button handler (matches text from keyboard)
bot.hears([/📄 Shartnomalarim/, /📄 Мои контракты/], contractsHandler);

// Contracts callback handlers
bot.callbackQuery(/^contracts_page:\d+$/, contractsPaginationHandler);
bot.callbackQuery(/^download_contract:.+$/, downloadContractHandler);
bot.callbackQuery('back_to_menu', backToMenuHandler);
