import { BotContext } from '../types/context';

export const branchesHandler = async (ctx: BotContext): Promise<void> => {
  await ctx.conversation.exitAll();
  await ctx.conversation.enter('branchesConversation');
};
