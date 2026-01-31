import { InlineKeyboard, Keyboard } from 'grammy';
import { CustomContext } from '../types/context';
import { i18n } from '../i18n';
import { Contract } from '../data/contracts.mock';
import { PaymentContract } from '../interfaces/payment.interface';

export const getMainKeyboard = (ctx: CustomContext, isAdmin: boolean = false) => {
  const keyboard = new Keyboard()
    .text(ctx.t('menu-contracts')).text(ctx.t('menu-payments')).row()
    .text(ctx.t('menu-settings')).text(ctx.t('menu-support'));

  if (isAdmin) {
    keyboard.row().text(ctx.t('admin-menu'));
  }

  return keyboard.resized();
};

/**
 * Locale-based version of getMainKeyboard for use inside conversations
 * where ctx.t() is not available.
 */
export const getMainKeyboardByLocale = (locale: string, isAdmin: boolean = false) => {
  const keyboard = new Keyboard()
    .text(i18n.t(locale, 'menu-contracts')).text(i18n.t(locale, 'menu-payments')).row()
    .text(i18n.t(locale, 'menu-settings')).text(i18n.t(locale, 'menu-support'));

  if (isAdmin) {
    keyboard.row().text(i18n.t(locale, 'admin-menu'));
  }

  return keyboard.resized();
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

/**
 * Payments keyboard with contract list
 * Shows most expensive item name for each contract
 */
export const getPaymentsKeyboard = (payments: PaymentContract[], locale: string) => {
  const keyboard = new Keyboard();

  payments.forEach((payment, index) => {
    keyboard.text(`${index + 1}. ${payment.mainItemName}`).row();
  });

  keyboard.text(i18n.t(locale, 'payments-back')).resized();

  return keyboard;
};

export const getSettingsKeyboard = (ctx: CustomContext, isAdmin: boolean = false) => {
  const keyboard = new Keyboard()
    .text(ctx.t('settings-change-name')).text(ctx.t('settings-change-phone')).row()
    .text(ctx.t('settings-change-language')).text(ctx.t('settings-back'));

  if (isAdmin) {
    keyboard.row().text(ctx.t('admin-menu'));
  }

  return keyboard.resized();
};

export const getSettingsLanguageKeyboard = (ctx: CustomContext) => {
  return new Keyboard()
    .text("🇺🇿 O'zbekcha").text("🇷🇺 Русский").row()
    .text(ctx.t('settings-back'))
    .resized();
};

/**
 * Support ticket action keyboard for admin group
 * @param ticketNumber - The ticket number (e.g., ABC123)
 */
export const getSupportTicketKeyboard = (ticketNumber: string) => {
  return new InlineKeyboard()
    .text('✏️ Javob berish', `support_reply:${ticketNumber}`)
    .text('✅ Yopish', `support_close:${ticketNumber}`)
    .row()
    .text('🚫 Bloklash (Support)', `support_block:${ticketNumber}`);
};

/**
 * Keyboard for replied tickets - shows "View Reply" button
 * @param ticketNumber - The ticket number
 */
export const getSupportTicketRepliedKeyboard = (ticketNumber: string) => {
  return new InlineKeyboard()
    .text('📜 Javobni ko\'rish', `support_view_reply:${ticketNumber}`);
};

/**
 * Cancel keyboard for admin reply conversation
 */
export const getAdminReplyCancelKeyboard = () => {
  return new Keyboard()
    .text('🔙 Bekor qilish')
    .resized()
    .oneTime();
};
