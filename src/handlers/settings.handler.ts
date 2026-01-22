import { InlineKeyboard } from 'grammy';
import { BotContext } from '../types/context';
import { UserService } from '../services/user.service';

export async function settingsHandler(ctx: BotContext) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const user = await UserService.getUserByTelegramId(telegramId);
  if (!user) return;

  const locale = ctx.session?.__language_code || 'uz';
  
  const keyboard = new InlineKeyboard()
    .text(ctx.t('settings-change-name'), 'change_name').row()
    .text(ctx.t('settings-change-phone'), 'change_phone').row()
    .text(ctx.t('settings-change-language'), 'change_language').row()
    .text(ctx.t('settings-back'), 'back_to_menu');

  const message = ctx.t('settings-header', {
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    phone: user.phone_number || '',
    language: locale === 'uz' ? "O'zbekcha" : "Русский"
  });

  if (ctx.callbackQuery) {
    await ctx.editMessageText(message, {
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
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter('changeNameConversation');
}

export async function changePhoneHandler(ctx: BotContext) {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter('changePhoneConversation');
}

export async function changeLanguageHandler(ctx: BotContext) {
  await ctx.answerCallbackQuery();
  
  const keyboard = new InlineKeyboard()
    .text('🇺🇿 O\'zbekcha', 'set_lang_uz').row()
    .text('🇷🇺 Русский', 'set_lang_ru').row()
    .text(ctx.t('settings-back'), 'open_settings');

  await ctx.editMessageText(ctx.t('start-message'), {
    reply_markup: keyboard
  });
}
