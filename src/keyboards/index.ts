import { InlineKeyboard, Keyboard } from 'grammy';
import { CustomContext } from '../types/context';
import { i18n } from '../i18n';
import { Contract } from '../data/contracts.mock';
import { PaymentContract } from '../interfaces/payment.interface';

export const getMainKeyboard = (ctx: CustomContext, isAdmin: boolean = false) => {
  const keyboard = new Keyboard()
    .text(ctx.t('menu_contracts')).text(ctx.t('menu_payments')).row()
    .text(ctx.t('menu_settings')).text(ctx.t('menu_support'));

  if (isAdmin) {
    keyboard.row().text(ctx.t('admin_menu'));
  }

  return keyboard.resized();
};

/**
 * Locale-based version of getMainKeyboard for use inside conversations
 * where ctx.t() is not available.
 */
export const getMainKeyboardByLocale = (locale: string, isAdmin: boolean = false) => {
  const keyboard = new Keyboard()
    .text(i18n.t(locale, 'menu_contracts')).text(i18n.t(locale, 'menu_payments')).row()
    .text(i18n.t(locale, 'menu_settings')).text(i18n.t(locale, 'menu_support'));

  if (isAdmin) {
    keyboard.row().text(i18n.t(locale, 'admin_menu'));
  }

  return keyboard.resized();
};


export const getHelpKeyboard = (ctx: CustomContext) => new InlineKeyboard()
  .text(ctx.t('back_button'), 'start');

export const getLanguageKeyboard = () => new InlineKeyboard()
  .text(i18n.t('uz', 'uz_button'), 'set_lang_uz')
  .text(i18n.t('ru', 'ru_button'), 'set_lang_ru');


export const getContractsKeyboard = (contracts: Contract[], locale: string) => {
  const keyboard = new Keyboard();

  contracts.forEach((contract, index) => {
    keyboard.text(`${index + 1}. ${contract.itemName}`).row();
  });

  keyboard.text(i18n.t(locale, 'back')).resized();

  return keyboard;
};

/**
 * Payments keyboard with contract list
 * Shows most expensive item name for each contract
 */
export const getPaymentsKeyboard = (payments: PaymentContract[], locale: string) => {
  const keyboard = new Keyboard();

  payments.forEach((payment, index) => {
    keyboard.text(`${index + 1}. ${payment.mainItemName}`).row();
  });

  keyboard.text(i18n.t(locale, 'back')).resized();

  return keyboard;
};

export const getSettingsKeyboard = (ctx: CustomContext, isAdmin: boolean = false) => {
  const keyboard = new Keyboard()
    .text(ctx.t('settings_change_name')).text(ctx.t('settings_change_phone')).row()
    .text(ctx.t('settings_change_language')).text(ctx.t('back'));

  if (isAdmin) {
    keyboard.row().text(ctx.t('admin_menu'));
  }

  return keyboard.resized();
};

export const getSettingsLanguageKeyboard = (ctx: CustomContext) => {
  return new Keyboard()
    .text(ctx.t('uz_button')).text(ctx.t('ru_button')).row()
    .text(ctx.t('back'))
    .resized();
};

/**
 * Support ticket action keyboard for admin group
 * @param ticketNumber - The ticket number (e.g., ABC123)
 */
export const getSupportTicketKeyboard = (ticketNumber: string, locale: string = 'uz') => {
  return new InlineKeyboard()
    .text(i18n.t(locale, 'admin_ticket_reply'), `support_reply:${ticketNumber}`)
    .text(i18n.t(locale, 'admin_ticket_close'), `support_close:${ticketNumber}`)
    .row()
    .text(i18n.t(locale, 'admin_ticket_block'), `support_block:${ticketNumber}`);
};

/**
 * Keyboard for replied tickets - shows "View Reply" button
 * @param ticketNumber - The ticket number
 */
export const getSupportTicketRepliedKeyboard = (ticketNumber: string, locale: string = 'uz') => {
  return new InlineKeyboard()
    .text(i18n.t(locale, 'admin_view_reply'), `support_view_reply:${ticketNumber}`);
};

/**
 * Cancel keyboard for admin reply conversation
 */
export const getAdminReplyCancelKeyboard = (locale: string = 'uz') => {
  return new Keyboard()
    .text(i18n.t(locale, 'admin_reply_cancel'))
    .resized()
    .oneTime();
};
