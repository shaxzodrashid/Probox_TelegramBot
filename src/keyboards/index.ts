import { InlineKeyboard, Keyboard } from 'grammy';
import { CustomContext } from '../types/context';
import { i18n } from '../i18n';
import { Contract } from '../data/contracts.mock';

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


export const getContractsKeyboard = (contracts: Contract[], locale: string) => {
  const keyboard = new Keyboard();

  contracts.forEach((contract, index) => {
    keyboard.text(`${index + 1}. ${contract.itemName}`).row();
  });

  keyboard.text(i18n.t(locale, 'contracts-back')).resized();

  return keyboard;
};


export const getSettingsKeyboard = (ctx: CustomContext) => {
  return new Keyboard()
    .text(ctx.t('settings-change-name')).text(ctx.t('settings-change-phone')).row()
    .text(ctx.t('settings-change-language')).text(ctx.t('settings-back'))
    .resized();
};

export const getSettingsLanguageKeyboard = (ctx: CustomContext) => {
  return new Keyboard()
    .text("🇺🇿 O'zbekcha").text("🇷🇺 Русский").row()
    .text(ctx.t('settings-back'))
    .resized();
};
