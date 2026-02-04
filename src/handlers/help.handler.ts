import { BotContext } from '../types/context';
import { getHelpKeyboard } from '../keyboards';

export const helpHandler = async (ctx: BotContext) => {
  const text = ctx.t('help_message');
  const keyboard = getHelpKeyboard(ctx);
  
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { reply_markup: keyboard });
    await ctx.answerCallbackQuery();
  } else {
    await ctx.reply(text, { reply_markup: keyboard });
  }
};

export const aboutHandler = async (ctx: BotContext) => {
  const text = ctx.t('about_message');
  const keyboard = getHelpKeyboard(ctx);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { reply_markup: keyboard });
    await ctx.answerCallbackQuery();
  } else {
    await ctx.reply(text, { reply_markup: keyboard });
  }
};
