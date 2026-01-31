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
  const isUzbek = locale === 'uz';
  const header = isUzbek
    ? `📄 *Sizning shartnomalaringiz*\n\n`
    : `📄 *Ваши контракты*\n\n`;

  const pageInfo = isUzbek
    ? `📋 Jami: ${totalItems} ta shartnoma | Sahifa: ${currentPage}/${totalPages}\n\n`
    : `📋 Всего: ${totalItems} контрактов | Страница: ${currentPage}/${totalPages}\n\n`;

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
  const backToMenuText = isUzbek ? '🔙 Menyuga' : '🔙 В меню';

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
  const isUzbek = locale === 'uz';

  // Find next payment (first Open installment)
  const sortedInst = [...contract.installments].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const nextPayment = sortedInst.find(inst => inst.status === 'O');

  let text = isUzbek
    ? `📄 *SHARTNOMA MA'LUMOTLARI*\n\n`
    : `📄 *ИНФОРМАЦИЯ О КОНТРАКТЕ*\n\n`;

  text += isUzbek
    ? `👤 *Hamkor:* ${contract.cardName}\n`
    : `👤 *Партнер:* ${contract.cardName}\n`;

  text += isUzbek
    ? `🛠 *Mahsulot:* ${contract.itemName}\n`
    : `🛠 *Товар:* ${contract.itemName}\n`;

  text += isUzbek
    ? `🔢 *Shartnoma raqami:* \`${contract.contractNumber}\`\n\n`
    : `🔢 *Номер контракта:* \`${contract.contractNumber}\`\n\n`;

  text += isUzbek
    ? `📅 *Sotib olingan sana:* ${formatDate(contract.purchaseDate)}\n`
    : `📅 *Дата покупки:* ${formatDate(contract.purchaseDate)}\n`;

  text += isUzbek
    ? `🏁 *Yakunlanish sanasi:* ${formatDate(contract.dueDate)}\n\n`
    : `🏁 *Дата окончания:* ${formatDate(contract.dueDate)}\n\n`;

  text += isUzbek
    ? `💰 *Shartnoma summasi:* ${formatCurrency(contract.totalAmount, contract.currency)}\n`
    : `💰 *Сумма контракта:* ${formatCurrency(contract.totalAmount, contract.currency)}\n`;

  text += isUzbek
    ? `✅ *To'langan:* ${formatCurrency(contract.totalPaid, contract.currency)}\n\n`
    : `✅ *Оплачено:* ${formatCurrency(contract.totalPaid, contract.currency)}\n\n`;

  if (nextPayment) {
    text += isUzbek
      ? `⏳ *Navbatdagi to'lov:*\n`
      : `⏳ *Следующий платеж:*\n`;

    text += isUzbek
      ? `📅 *Sana:* ${formatDate(nextPayment.dueDate)}\n`
      : `📅 *Дата:* ${formatDate(nextPayment.dueDate)}\n`;

    text += isUzbek
      ? `💵 *Summa:* ${formatCurrency(nextPayment.total, contract.currency)}\n`
      : `💵 *Сумма:* ${formatCurrency(nextPayment.total, contract.currency)}\n`;

    const remainingForInst = nextPayment.total - nextPayment.paid;
    if (nextPayment.paid > 0) {
      text += isUzbek
        ? `⚠️ *Eslatma:* Ushbu to'lovdan ${formatCurrency(nextPayment.paid, contract.currency)} to'langan. Qolgan summa: ${formatCurrency(remainingForInst, contract.currency)}\n`
        : `⚠️ *Примечание:* Из этого платежа оплачено ${formatCurrency(nextPayment.paid, contract.currency)}. Остаток: ${formatCurrency(remainingForInst, contract.currency)}\n`;
    } else {
      text += isUzbek
        ? `⚠️ *Eslatma:* Ushbu to'lov hali amalga oshirilmagan.\n`
        : `⚠️ *Примечание:* Этот платеж еще не произведен.\n`;
    }
  } else {
    text += isUzbek
      ? `🎉 *Tabriklaymiz!* Barcha to'lovlar amalga oshirilgan.`
      : `🎉 *Поздравляем!* Все платежи произведены.`;
  }

  const keyboard = new InlineKeyboard()
    .text(isUzbek ? ' 📄 PDF yuklab olish' : '📄 PDF загрузить', 'download_pdf');

  return { text, keyboard };
};

/**
 * Handler for showing contracts list
 */
export const contractsHandler = async (ctx: BotContext) => {
  logger.info(`[CONTRACTS] User ${ctx.from?.id} opened contracts list`);

  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const user = await UserService.getUserByTelegramId(telegramId);
  const cardCode = user?.sap_card_code;

  if (!cardCode) {
    await ctx.reply(ctx.t('contracts-no-access'));
    return;
  }

  try {
    const contracts = await ContractService.getContractsByCardCode(cardCode);

    if (!contracts || contracts.length === 0) {
      await ctx.reply(ctx.t('contracts-not-found'));
      return;
    }

    ctx.session.contracts = contracts; // Cache in session
    ctx.session.currentContractsPage = 1;

    const locale = (await ctx.i18n.getLocale()) || 'uz';
    const keyboard = getContractsKeyboard(contracts, locale);

    const text = `${ctx.t('contracts-header')}\n\n${ctx.t('contracts-total', {
      total: contracts.length
    })}`;

    await ctx.reply(text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  } catch (err) {
    logger.error(`[CONTRACTS] Error fetching contracts for ${cardCode}: ${err}`);
    await ctx.reply(ctx.t('contracts-error'));
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
        text: locale === 'uz' ? '⚠️ Shartnoma topilmadi.' : '⚠️ Контракт не найден.',
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
      text: locale === 'uz' ? '❌ Shartnoma topilmadi.' : '❌ Контракт не найден.',
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
      const text = i18n.t(locale, 'admin-menu-header');
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

  const message = locale === 'uz'
    ? '🚧 Bu funksiya hozirda ishlab chiqilmoqda. Tez orada ishga tushiriladi!'
    : '🚧 Эта функция находится в разработке. Скоро будет запущена!';

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
    return ctx.reply(locale === 'uz' ? '❌ Shartnoma topilmadi.' : '❌ Контракт не найден.');
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

  if (telegramId) {
    const user = await UserService.getUserByTelegramId(telegramId);
    if (user?.is_admin) {
      const text = i18n.t(locale, 'admin-menu-header');
      const keyboard = getAdminMenuKeyboard(locale);
      await ctx.reply(text, { reply_markup: keyboard });
      return;
    }
  }

  const welcomeMsg = locale === 'uz' ? 'Bosh menyu' : 'Главное меню';
  await ctx.reply(welcomeMsg, {
    reply_markup: getMainKeyboardByLocale(locale),
  });
};

