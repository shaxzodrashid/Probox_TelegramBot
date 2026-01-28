import { Context, SessionFlavor } from 'grammy';
import { I18nFlavor } from '@grammyjs/i18n';
import { ConversationFlavor, Conversation } from '@grammyjs/conversations';

import { Contract } from '../data/contracts.mock';

export type CustomContext = Context & I18nFlavor & SessionFlavor<SessionData>;
export type BotContext = ConversationFlavor<CustomContext>;
export type BotConversation = Conversation<BotContext, BotContext>;
export interface SessionData {
  // Add session data properties here
  user_phone?: string;
  __language_code?: string;
  languageSelected?: boolean;
  contracts?: Contract[];
  currentContractsPage?: number;
}
