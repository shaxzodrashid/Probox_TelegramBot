import { I18n } from '@grammyjs/i18n';
import path from 'path';
import { BotContext } from './types/context';

export const i18n = new I18n<BotContext>({
  defaultLocale: 'uz',
  directory: path.resolve(__dirname, 'locales'),
  useSession: true,
});
