import { BotContext } from '../types/context';

export const applicationHandler = async (ctx: BotContext) => {
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.deleteMessage().catch(() => {});
  }

  await ctx.conversation.exitAll();
  await ctx.conversation.enter('applicationConversation');
};
