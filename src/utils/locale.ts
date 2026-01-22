import { BotConversation } from '../types/context';

/**
 * Helper to determine the locale from session.
 * IMPORTANT: Inside conversations, we must use conversation.external() to access the session.
 */
export async function getLocaleFromConversation(conversation: BotConversation): Promise<string> {
  // Access session through conversation.external - the proper way inside conversations
  const sessionData = await conversation.external((ctx) => ctx.session);
  
  if (sessionData?.__language_code) {
    return sessionData.__language_code;
  }
  
  return 'uz';
}
