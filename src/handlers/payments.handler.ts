import { BotContext } from '../types/context';
import { getMainKeyboardByLocale, getPaymentsKeyboard } from '../keyboards';
import { getAdminMenuKeyboard } from '../keyboards/admin.keyboards';
import { PaymentService } from '../services/payment.service';
import { UserService } from '../services/user.service';
import { i18n } from '../i18n';
import { logger } from '../utils/logger';
import { formatDate, formatCurrency } from '../utils/formatter.util';
import { PaymentContract } from '../interfaces/payment.interface';

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
    const isUzbek = locale === 'uz';

    let text = isUzbek
        ? `💳 TO'LOV MA'LUMOTLARI\n\n`
        : `💳 ИНФОРМАЦИЯ О ПЛАТЕЖЕ\n\n`;

    // Contract number
    text += isUzbek
        ? `🔢 Shartnoma: ${payment.contractNumber}\n\n`
        : `🔢 Контракт: ${payment.contractNumber}\n\n`;

    // All items in the contract
    text += isUzbek ? `📦 Mahsulotlar:\n\n` : `📦 Товары:\n\n`;
    payment.allItems.forEach((item) => {
        text += `${item.name}`;
        if (item.price >= 0) {
            text += ` — ${formatCurrency(item.price, payment.currency)}`;
        }
        text += '\n';
    });
    text += '\n';

    // Dates
    text += isUzbek
        ? `📅 Shartnoma sanasi: ${formatDate(payment.docDate)}\n`
        : `📅 Дата контракта: ${formatDate(payment.docDate)}\n`;

    text += isUzbek
        ? `🏁 Yakunlanish sanasi: ${formatDate(payment.dueDate)}\n\n`
        : `🏁 Дата окончания: ${formatDate(payment.dueDate)}\n\n`;

    // Totals
    text += isUzbek
        ? `💰 Jami summa: ${formatCurrency(payment.total, payment.currency)}\n`
        : `💰 Общая сумма: ${formatCurrency(payment.total, payment.currency)}\n`;

    text += isUzbek
        ? `✅ To'langan: ${formatCurrency(payment.totalPaid, payment.currency)}\n`
        : `✅ Оплачено: ${formatCurrency(payment.totalPaid, payment.currency)}\n`;

    const remaining = payment.total - payment.totalPaid;
    if (remaining > 0) {
        text += isUzbek
            ? `⚠️ Qolgan: ${formatCurrency(remaining, payment.currency)}\n`
            : `⚠️ Остаток: ${formatCurrency(remaining, payment.currency)}\n`;
    }

    text += '\n';

    // Payment schedule
    text += isUzbek ? `📋 To'lov jadvali:\n` : `📋 График платежей:\n`;
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

        text += line + '\n';
    });

    return text;
};

/**
 * Handler for showing payments list
 */
export const paymentsHandler = async (ctx: BotContext) => {
    logger.info(`[PAYMENTS] User ${ctx.from?.id} opened payments list`);

    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = await UserService.getUserByTelegramId(telegramId);
    const cardCode = user?.sap_card_code;

    if (!cardCode) {
        await ctx.reply(ctx.t('payments-no-access'));
        return;
    }

    try {
        const payments = await PaymentService.getPaymentsByCardCode(cardCode);

        if (!payments || payments.length === 0) {
            await ctx.reply(ctx.t('payments-not-found'));
            return;
        }

        ctx.session.payments = payments; // Cache in session

        const locale = (await ctx.i18n.getLocale()) || 'uz';
        const keyboard = getPaymentsKeyboard(payments, locale);

        const text = `${ctx.t('payments-header')}\n\n${ctx.t('payments-total', {
            total: payments.length
        })}`;

        await ctx.reply(text, {
            parse_mode: 'Markdown',
            reply_markup: keyboard,
        });
    } catch (err) {
        logger.error(`[PAYMENTS] Error fetching payments for ${cardCode}: ${err}`);
        await ctx.reply(ctx.t('payments-error'));
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
        const cardCode = user?.sap_card_code;
        if (cardCode) {
            payments = await PaymentService.getPaymentsByCardCode(cardCode);
            ctx.session.payments = payments;
        }
    }

    const payment = payments?.[index];
    if (!payment) {
        return ctx.reply(locale === 'uz' ? '❌ To\'lov topilmadi.' : '❌ Платеж не найден.');
    }

    const detailText = buildPaymentDetailMessage(payment, locale);
    await ctx.reply(detailText, {
        parse_mode: 'Markdown',
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
