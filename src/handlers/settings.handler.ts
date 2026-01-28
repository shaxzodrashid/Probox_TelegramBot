import { BotContext } from '../types/context';
import { UserService } from '../services/user.service';
import { getSettingsKeyboard, getSettingsLanguageKeyboard } from '../keyboards';

export async function settingsHandler(ctx: BotContext) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const user = await UserService.getUserByTelegramId(telegramId);
  if (!user) return;

  const locale = ctx.session?.__language_code || 'uz';

  const keyboard = getSettingsKeyboard(ctx);

  const message = ctx.t('settings-header', {
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    phone: user.phone_number || '',
    language: locale === 'uz' ? "O'zbekcha" : "Русский"
  });

  if (ctx.callbackQuery) {
    // If it was triggered by a callback, we might want to delete the message or reply with a new one
    // because InlineKeyboardMarkup and ReplyKeyboardMarkup don't mix well in editMessageText
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  } else {
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }
}

export async function changeNameHandler(ctx: BotContext) {
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
  }
  await ctx.conversation.enter('changeNameConversation');
}

export async function changePhoneHandler(ctx: BotContext) {
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
  }
  await ctx.conversation.enter('changePhoneConversation');
}

export async function changeLanguageHandler(ctx: BotContext) {
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
  }

  const keyboard = getSettingsLanguageKeyboard(ctx);

  await ctx.reply(ctx.t('start-message'), {
    reply_markup: keyboard
  });
}
