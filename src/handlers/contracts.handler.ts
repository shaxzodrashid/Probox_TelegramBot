import { InlineKeyboard } from 'grammy';
import { BotContext } from '../types/context';
import { Contract } from '../data/contracts.mock';
import { getMainKeyboardByLocale, getContractsKeyboard } from '../keyboards';
import { ContractService } from '../services/contract.service';
import { UserService } from '../services/user.service';
import { i18n } from '../i18n';
import { getAdminMenuKeyboard } from '../keyboards/admin.keyboards';
import { logger } from '../utils/logger';
import { formatDate, formatCurrency } from '../utils/formatter.util';
import { checkRegistrationOrPrompt } from '../utils/registration.check';

const PAGE_SIZE = 10;

interface PaginatedContracts {
  items: Contract[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/**
 * Build the contracts list message with inline keyboard
 */
const buildContractsMessage = (paginatedData: PaginatedContracts, locale: string) => {
  const { items, currentPage, totalPages, totalItems, hasNextPage, hasPrevPage } = paginatedData;

  // Build message text
  const header = i18n.t(locale, 'contracts_header') + '\n\n';

  const pageInfo = i18n.t(locale, 'contracts_page_info', {
    total: totalItems.toString(),
    current: currentPage.toString(),
    pages: totalPages.toString()
  }) + '\n\n';

  // Simple list with only item names
  let contractsList = '';
  items.forEach((contract: Contract, index: number) => {
    const number = (currentPage - 1) * PAGE_SIZE + index + 1;
    contractsList += `*${number}.* ${contract.itemName}\n`;
  });

  const text = header + pageInfo + contractsList;

  // Build inline keyboard
  const keyboard = new InlineKeyboard();

  // Add numbered detail buttons
  const BUTTONS_PER_ROW = 5;
  items.forEach((contract: Contract, index: number) => {
    const number = (currentPage - 1) * PAGE_SIZE + index + 1;
    keyboard.text(`${number}`, `contract_detail:${contract.id}`);

    if ((index + 1) % BUTTONS_PER_ROW === 0) {
      keyboard.row();
    }
  });

  if (items.length % BUTTONS_PER_ROW !== 0) {
    keyboard.row();
  }

  // Add pagination row
  const backToMenuText = i18n.t(locale, 'contracts_back_to_menu');

  if (hasPrevPage) {
    keyboard.text('⬅️', `contracts_page:${currentPage - 1}`);
  }

  keyboard.text(backToMenuText, 'back_to_menu');

  if (hasNextPage) {
    keyboard.text('➡️', `contracts_page:${currentPage + 1}`);
  }

  return { text, keyboard };
};

/**
 * Build the contract detail message
 */
const buildContractDetailMessage = (contract: Contract, locale: string) => {

  // Find next payment (first Open installment)
  const sortedInst = [...contract.installments].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const nextPayment = sortedInst.find(inst => inst.status === 'O');

  let text = i18n.t(locale, 'contracts_detail_header') + '\n\n';

  text += i18n.t(locale, 'contracts_partner_label', { name: contract.cardName }) + '\n';
  text += i18n.t(locale, 'contracts_product_label', { name: contract.itemName }) + '\n';
  text += i18n.t(locale, 'contracts_number_label', { number: contract.contractNumber }) + '\n\n';

  text += i18n.t(locale, 'contracts_purchase_date_label', { date: formatDate(contract.purchaseDate) }) + '\n';
  text += i18n.t(locale, 'contracts_due_date_label', { date: formatDate(contract.dueDate) }) + '\n\n';

  text += i18n.t(locale, 'contracts_total_amount_label', { amount: formatCurrency(contract.totalAmount, contract.currency) }) + '\n';
  text += i18n.t(locale, 'contracts_paid_label', { amount: formatCurrency(contract.totalPaid, contract.currency) }) + '\n\n';

  if (nextPayment) {
    text += i18n.t(locale, 'contracts_next_payment_label') + '\n';
    text += i18n.t(locale, 'contracts_date_label', { date: formatDate(nextPayment.dueDate) }) + '\n';
    text += i18n.t(locale, 'contracts_amount_label', { amount: formatCurrency(nextPayment.total, contract.currency) }) + '\n';

    const remainingForInst = nextPayment.total - nextPayment.paid;
    if (nextPayment.paid > 0) {
      text += i18n.t(locale, 'contracts_payment_note_paid', {
        paid: formatCurrency(nextPayment.paid, contract.currency),
        remaining: formatCurrency(remainingForInst, contract.currency)
      }) + '\n';
    } else {
      text += i18n.t(locale, 'contracts_payment_note_unpaid') + '\n';
    }
  } else {
    text += i18n.t(locale, 'contracts_all_paid');
  }

  const keyboard = new InlineKeyboard()
    .text(i18n.t(locale, 'contracts_download_pdf'), 'download_pdf');

  return { text, keyboard };
};

/**
 * Handler for showing contracts list
 */
export const contractsHandler = async (ctx: BotContext) => {
  logger.info(`[CONTRACTS] User ${ctx.from?.id} opened contracts list`);

  // Check if user is registered, if not, prompt to register
  const user = await checkRegistrationOrPrompt(ctx);
  if (!user) return;

  const cardCode = user.sap_card_code;

  if (!cardCode) {
    await ctx.reply(ctx.t('contracts_no_access'));
    return;
  }

  try {
    const contracts = await ContractService.getContractsByCardCode(cardCode);

    if (!contracts || contracts.length === 0) {
      await ctx.reply(ctx.t('contracts_not_found'));
      return;
    }

    ctx.session.contracts = contracts; // Cache in session
    ctx.session.currentContractsPage = 1;

    const locale = (await ctx.i18n.getLocale()) || 'uz';
    const keyboard = getContractsKeyboard(contracts, locale);

    const text = `${ctx.t('contracts_header')}\n\n${ctx.t('contracts_total', {
      total: contracts.length
    })}`;

    await ctx.reply(text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  } catch (err) {
    logger.error(`[CONTRACTS] Error fetching contracts for ${cardCode}: ${err}`);
    await ctx.reply(ctx.t('contracts_error'));
  }
};

/**
 * Handler for pagination callback
 */
export const contractsPaginationHandler = async (ctx: BotContext) => {
  const callbackData = ctx.callbackQuery?.data;
  if (!callbackData) return;

  const page = parseInt(callbackData.split(':')[1], 10);
  if (isNaN(page)) return;

  logger.info(`[CONTRACTS] User ${ctx.from?.id} navigated to page ${page}`);

  const locale = (await ctx.i18n.getLocale()) || 'uz';

  let contracts = ctx.session.contracts;
  if (!contracts || contracts.length === 0) {
    const user = await UserService.getUserByTelegramId(ctx.from!.id);
    const cardCode = user?.sap_card_code;

    if (!cardCode) {
      return ctx.answerCallbackQuery({
        text: i18n.t(locale, 'contracts_not_found_alert'),
        show_alert: true
      });
    }

    contracts = await ContractService.getContractsByCardCode(cardCode);
    ctx.session.contracts = contracts;
  }

  ctx.session.currentContractsPage = page;
  const paginatedData = ContractService.paginateContracts(contracts || [], page, PAGE_SIZE);
  const { text, keyboard } = buildContractsMessage(paginatedData, locale);

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
  await ctx.answerCallbackQuery();
};

/**
 * Handler for contract detail view
 */
export const contractDetailHandler = async (ctx: BotContext) => {
  const callbackData = ctx.callbackQuery?.data;
  if (!callbackData) return;

  const contractId = callbackData.split(':')[1];
  logger.info(`[CONTRACTS] User ${ctx.from?.id} requested details for contract ${contractId}`);

  const locale = (await ctx.i18n.getLocale()) || 'uz';

  let contracts = ctx.session.contracts;
  if (!contracts || contracts.length === 0) {
    logger.info(`[CONTRACTS] Session empty, refetching contracts for user ${ctx.from?.id}`);
    const user = await UserService.getUserByTelegramId(ctx.from!.id);
    const cardCode = user?.sap_card_code;

    if (cardCode) {
      contracts = await ContractService.getContractsByCardCode(cardCode);
      ctx.session.contracts = contracts;
    }
  }

  const contract = contracts?.find(c => c.id === contractId);
  if (!contract) {
    await ctx.answerCallbackQuery({
      text: i18n.t(locale, 'contracts_not_found_alert'),
      show_alert: true
    });
    return;
  }

  const { text, keyboard } = buildContractDetailMessage(contract, locale);

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
  await ctx.answerCallbackQuery();
};

/**
 * Handler to go back to contracts list from detail view
 */
export const backToContractsHandler = async (ctx: BotContext) => {
  logger.info(`[CONTRACTS] User ${ctx.from?.id} going back to contracts list`);

  const locale = (await ctx.i18n.getLocale()) || 'uz';
  const page = ctx.session.currentContractsPage || 1;

  let contracts = ctx.session.contracts;
  if (!contracts || contracts.length === 0) {
    const user = await UserService.getUserByTelegramId(ctx.from!.id);
    const cardCode = user?.sap_card_code;

    if (cardCode) {
      contracts = await ContractService.getContractsByCardCode(cardCode);
      ctx.session.contracts = contracts;
    }
  }

  const paginatedData = ContractService.paginateContracts(contracts || [], page, PAGE_SIZE);
  const { text, keyboard } = buildContractsMessage(paginatedData, locale);

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
  await ctx.answerCallbackQuery();
};

/**
 * Handler for back to menu callback
 */
export const backToMenuHandler = async (ctx: BotContext) => {
  const telegramId = ctx.from?.id;
  if (telegramId) {
    const user = await UserService.getUserByTelegramId(telegramId);
    if (user?.is_admin) {
      const locale = (await ctx.i18n.getLocale()) || 'uz';
      const text = i18n.t(locale, 'admin_menu_header');
      const keyboard = getAdminMenuKeyboard(locale);

      if (ctx.callbackQuery) {
        await ctx.deleteMessage().catch(() => { });
        await ctx.answerCallbackQuery();
      }

      await ctx.reply(text, { reply_markup: keyboard });
      return;
    }
  }

  await ctx.deleteMessage().catch(() => { });
  await ctx.answerCallbackQuery();
};

/**
 * Handler for PDF download
 */
export const downloadPdfHandler = async (ctx: BotContext) => {
  const locale = (await ctx.i18n.getLocale()) || 'uz';

  const message = i18n.t(locale, 'contracts_coming_soon');

  await ctx.answerCallbackQuery({
    text: message,
    show_alert: true
  });
};

/**
 * Handler for contract selection from reply keyboard
 */
export const contractSelectionHandler = async (ctx: BotContext) => {
  const text = ctx.message?.text;
  if (!text) return;

  const match = text.match(/^(\d+)\./);
  if (!match) return;

  const index = parseInt(match[1], 10) - 1;
  const locale = (await ctx.i18n.getLocale()) || 'uz';

  let contracts = ctx.session.contracts;
  if (!contracts || contracts.length === 0) {
    const user = await UserService.getUserByTelegramId(ctx.from!.id);
    const cardCode = user?.sap_card_code;
    if (cardCode) {
      contracts = await ContractService.getContractsByCardCode(cardCode);
      ctx.session.contracts = contracts;
    }
  }

  const contract = contracts?.[index];
  if (!contract) {
    return ctx.reply(i18n.t(locale, 'contracts_not_found_alert'));
  }

  const { text: detailText, keyboard } = buildContractDetailMessage(contract, locale);
  await ctx.reply(detailText, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
};

/**
 * Handler for back to menu from keyboard
 */
export const backFromContractsToMenuHandler = async (ctx: BotContext) => {
  const locale = (await ctx.i18n.getLocale()) || 'uz';
  const telegramId = ctx.from?.id;

  let isLoggedIn = false;

  if (telegramId) {
    const user = await UserService.getUserByTelegramId(telegramId);
    if (user) {
      isLoggedIn = !user.is_logged_out;
      if (user.is_admin) {
        const text = i18n.t(locale, 'admin_menu_header');
        const keyboard = getAdminMenuKeyboard(locale);
        await ctx.reply(text, { reply_markup: keyboard });
        return;
      }
    }
  }

  const welcomeMsg = i18n.t(locale, 'payments_main_menu');
  await ctx.reply(welcomeMsg, {
    reply_markup: getMainKeyboardByLocale(locale, false, isLoggedIn),
  });
};

