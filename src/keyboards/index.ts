import { InlineKeyboard, Keyboard } from 'grammy';
import { CustomContext } from '../types/context';
import { i18n } from '../i18n';

export const getMainKeyboard = (ctx: CustomContext) => {
  return new Keyboard()
    .text(ctx.t('menu-contracts')).text(ctx.t('menu-payments')).row()
    .text(ctx.t('menu-settings')).text(ctx.t('menu-support'))
    .resized();
};

/**
 * Locale-based version of getMainKeyboard for use inside conversations
 * where ctx.t() is not available.
 */
export const getMainKeyboardByLocale = (locale: string) => {
  return new Keyboard()
    .text(i18n.t(locale, 'menu-contracts')).text(i18n.t(locale, 'menu-payments')).row()
    .text(i18n.t(locale, 'menu-settings')).text(i18n.t(locale, 'menu-support'))
    .resized();
};


export const getHelpKeyboard = (ctx: CustomContext) => new InlineKeyboard()
  .text(ctx.t('back-button'), 'start');

export const getLanguageKeyboard = () => new InlineKeyboard()
  .text("🇺🇿 O'zbekcha", 'set_lang_uz')
  .text("🇷🇺 Русский", 'set_lang_ru');

