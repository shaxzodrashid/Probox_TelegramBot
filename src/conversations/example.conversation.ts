import { BotConversation, BotContext } from '../types/context';

export async function exampleConversation(conversation: BotConversation, ctx: BotContext) {
  await ctx.reply('Hi! What is your name?');
  const { message } = await conversation.wait();
  await ctx.reply(`Welcome to the bot, ${message?.text}!`);
}
