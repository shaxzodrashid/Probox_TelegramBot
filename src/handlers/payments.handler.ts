import { BotContext } from '../types/context';
import { getMainKeyboardByLocale, getPaymentsKeyboard } from '../keyboards';
import { getAdminMenuKeyboard } from '../keyboards/admin.keyboards';
import { PaymentService } from '../services/payment.service';
import { User, UserService } from '../services/user.service';
import { i18n } from '../i18n';
import { logger } from '../utils/logger';
import { formatDate, formatCurrency } from '../utils/formatter.util';
import { PaymentContract } from '../interfaces/payment.interface';
import { checkRegistrationOrPrompt } from '../utils/registration.check';
import { escapeHtml } from '../utils/telegram-rich-text.util';

const getSapLookupIdentifiers = (user?: Pick<User, 'jshshir' | 'sap_card_code'> | null) => ({
  jshshir: user?.jshshir?.trim() || undefined,
  cardCode: user?.sap_card_code?.trim() || undefined,
});

/**
 * Gets the status emoji for a payment installment
 */
const getStatusEmoji = (status: 'paid' | 'incomplete' | 'overdue' | 'future'): string => {
  switch (status) {
    case 'paid':
      return '✅';
    case 'incomplete':
    case 'overdue':
      return '⚠️';
    case 'future':
      return '📅';
    default:
      return '❓';
  }
};

/**
 * Builds the payment detail message
 */
const buildPaymentDetailMessage = (payment: PaymentContract, locale: string) => {
  let text = i18n.t(locale, 'payments_detail_header') + '\n\n';

  // Contract number
  text +=
    i18n.t(locale, 'payments_contract_label', { number: escapeHtml(payment.contractNumber) }) +
    '\n\n';

  // All items in the contract
  text += i18n.t(locale, 'payments_products_label') + '\n\n';
  payment.allItems.forEach((item) => {
    text += `${escapeHtml(item.name)}`;
    if (item.price >= 0) {
      text += ` — ${escapeHtml(formatCurrency(item.price, payment.currency))}`;
    }
    text += '\n';
  });
  text += '\n';

  // Dates
  text +=
    i18n.t(locale, 'payments_doc_date_label', { date: escapeHtml(formatDate(payment.docDate)) }) +
    '\n';
  text +=
    i18n.t(locale, 'payments_due_date_label', { date: escapeHtml(formatDate(payment.dueDate)) }) +
    '\n\n';

  // Totals
  text +=
    i18n.t(locale, 'payments_total_label', {
      amount: escapeHtml(formatCurrency(payment.total, payment.currency)),
    }) + '\n';
  text +=
    i18n.t(locale, 'payments_paid_label', {
      amount: escapeHtml(formatCurrency(payment.totalPaid, payment.currency)),
    }) + '\n';

  const remaining = payment.total - payment.totalPaid;
  if (remaining > 0) {
    text +=
      i18n.t(locale, 'payments_remaining_label', {
        amount: escapeHtml(formatCurrency(remaining, payment.currency)),
      }) + '\n';
  }

  text += '\n';

  // Payment schedule
  text += i18n.t(locale, 'payments_schedule_label') + '\n';
  text += '─'.repeat(18) + '\n';

  payment.installments.forEach((inst, index) => {
    const emoji = getStatusEmoji(inst.status);
    const date = formatDate(inst.dueDate);
    const total = formatCurrency(inst.total, payment.currency);

    let line = `${emoji} ${index + 1}. ${date} — `;

    if (inst.status === 'incomplete') {
      const paid = formatCurrency(inst.paid, payment.currency);
      line += `${paid} / ${total}`;
    } else {
      line += `${total}`;
    }

    text += escapeHtml(line) + '\n';
  });

  return text;
};

/**
 * Handler for showing payments list
 */
export const paymentsHandler = async (ctx: BotContext) => {
  logger.info(`[PAYMENTS] User ${ctx.from?.id} opened payments list`);

  // Check if user is registered, if not, prompt to register
  const user = await checkRegistrationOrPrompt(ctx);
  if (!user) return;

  const identifiers = getSapLookupIdentifiers(user);

  if (!identifiers.jshshir && !identifiers.cardCode) {
    await ctx.reply(ctx.t('payments_no_access'));
    return;
  }

  try {
    const payments = await PaymentService.getPaymentsByIdentifiers(identifiers);

    if (!payments || payments.length === 0) {
      await ctx.reply(ctx.t('payments_not_found'));
      return;
    }

    ctx.session.payments = payments; // Cache in session

    const locale = (await ctx.i18n.getLocale()) || 'uz';
    const keyboard = getPaymentsKeyboard(payments, locale);

    const text = `${ctx.t('payments_header')}\n\n${ctx.t('payments_total', {
      total: payments.length,
    })}`;

    await ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  } catch (err) {
    logger.error(`[PAYMENTS] Error fetching payments for user ${ctx.from?.id}: ${err}`);
    await ctx.reply(ctx.t('payments_error'));
  }
};

/**
 * Handler for payment selection from reply keyboard
 */
export const paymentSelectionHandler = async (ctx: BotContext) => {
  const text = ctx.message?.text;
  if (!text) return;

  // Check if this is for payments (not contracts)
  // Payments selection happens when session.payments exists
  if (!ctx.session.payments || ctx.session.payments.length === 0) {
    return; // Let contracts handler process if no payments in session
  }

  const match = text.match(/^(\d+)\./);
  if (!match) return;

  const index = parseInt(match[1], 10) - 1;
  const locale = (await ctx.i18n.getLocale()) || 'uz';

  let payments = ctx.session.payments;
  if (!payments || payments.length === 0) {
    const user = await UserService.getUserByTelegramId(ctx.from!.id);
    const identifiers = getSapLookupIdentifiers(user);
    if (identifiers.jshshir || identifiers.cardCode) {
      payments = await PaymentService.getPaymentsByIdentifiers(identifiers);
      ctx.session.payments = payments;
    }
  }

  const payment = payments?.[index];
  if (!payment) {
    return ctx.reply(ctx.t('payments_not_found_alert'));
  }

  const detailText = buildPaymentDetailMessage(payment, locale);
  await ctx.reply(detailText, {
    parse_mode: 'HTML',
  });
};

/**
 * Handler for back to menu from payments keyboard
 */
export const backFromPaymentsToMenuHandler = async (ctx: BotContext) => {
  // Clear payments session when going back
  ctx.session.payments = undefined;

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
