import { BotContext } from '../types/context';

export const applicationHandler = async (ctx: BotContext) => {
  await ctx.conversation.enter('applicationConversation');
};
