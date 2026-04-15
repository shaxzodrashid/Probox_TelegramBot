import { BotContext } from '../types/context';
import { FaqRoutingService } from '../services/faq-routing.service';
import { FaqService } from '../services/faq.service';
import { SupportAgentService } from '../services/support-agent.service';
import { SupportService } from '../services/support.service';
import { i18n } from '../i18n';
import { config } from '../config';
import { logger } from '../utils/logger';
import { formatGeminiRequestFailure } from './gemini-error.util';
import { formatUzPhone } from './uz-phone.util';
import { escapeHtml, markdownToTelegramHtml } from './telegram-rich-text.util';
import { getFaqAnswerForLanguage, getFaqAgentToken } from './faq-match.util';
import { getSupportTicketKeyboard, getMainKeyboardByLocale } from '../keyboards';
import { getAdminMenuKeyboard } from '../keyboards/admin.keyboards';
import { Api, RawApi } from 'grammy';
import { SupportTicket, SupportTicketMessage } from '../types/support.types';
import { User } from '../services/user.service';

interface SupportAdminUserSnapshot {
    first_name?: string;
    last_name?: string;
    phone_number?: string;
    telegram_id: number;
    username?: string;
    sap_card_code?: string;
    language_code: string;
}

interface AdminGroupMessageOptions {
    matchedFaqId?: number | null;
    agentToken?: string | null;
    escalationReason?: string | null;
    transcript?: SupportTicketMessage[];
}

const getSenderLabel = (senderType: SupportTicketMessage['sender_type']): string => {
    if (senderType === 'agent') return 'Agent';
    if (senderType === 'admin') return 'Admin';
    if (senderType === 'system') return 'System';
    return 'User';
};

const formatTranscriptExcerpt = (messages: SupportTicketMessage[] = [], limit: number = 10): string => {
    if (messages.length === 0) {
        return '';
    }

    return messages
        .slice(-limit)
        .map((message, index) => {
            const photoSuffix = message.photo_file_id ? ' [photo]' : '';
            return `${index + 1}. <b>${escapeHtml(getSenderLabel(message.sender_type))}:</b> ${escapeHtml(message.message_text)}${photoSuffix}`;
        })
        .join('\n');
};

const buildSupportReplyMarkup = (user: User, locale: string) => {
    if (user?.is_admin) {
        return getAdminMenuKeyboard(locale);
    }

    const isLoggedIn = !user.is_logged_out;
    return getMainKeyboardByLocale(locale, false, isLoggedIn);
};

const replyToSupportUser = async (
    ctx: BotContext,
    user: User,
    locale: string,
    text: string,
) => {
    return ctx.reply(text, {
        reply_markup: buildSupportReplyMarkup(user, locale),
        parse_mode: 'HTML',
    });
};

const confirmSupportForwarded = async (
    ctx: BotContext,
    user: User,
    locale: string,
) => {
    if (user?.is_admin) {
        await ctx.reply(i18n.t(locale, 'support_sent') + '\n\n' + i18n.t(locale, 'admin_menu_header'), {
            reply_markup: buildSupportReplyMarkup(user, locale),
            parse_mode: 'HTML',
        });
        return;
    }

    await ctx.reply(i18n.t(locale, 'support_sent'), {
        reply_markup: buildSupportReplyMarkup(user, locale),
        parse_mode: 'HTML',
    });
};

/**
 * Format user support message for admin group
 */
export function formatAdminGroupMessage(
    ticketNumber: string,
    user: SupportAdminUserSnapshot,
    messageText: string,
    createdAt: Date,
    options: AdminGroupMessageOptions = {},
): string {
    const fullName = escapeHtml(`${user.first_name || ''} ${user.last_name || ''}`.trim() || i18n.t(user.language_code, 'admin_unknown_user'));
    const phone = escapeHtml(formatUzPhone(user.phone_number));
    const username = user.username ? `<b>@${escapeHtml(user.username)}</b>` : i18n.t(user.language_code, 'admin_no');
    const sapCode = escapeHtml(user.sap_card_code || i18n.t(user.language_code, 'admin_no'));
    const language = user.language_code === 'ru' ? i18n.t('ru', 'ru_button') : i18n.t('uz', 'uz_button');
    const dateStr = escapeHtml(createdAt.toLocaleString('uz-UZ', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    }));

    return `📩 <b>Yangi murojaat #${escapeHtml(ticketNumber)}</b>
    
👤 <b>Foydalanuvchi:</b> ${fullName}
📱 <b>Telefon:</b> ${phone}
🆔 <b>Telegram:</b> ${username} (ID: <code>${escapeHtml(user.telegram_id.toString())}</code>)
💼 <b>SAP Kod:</b> ${sapCode}
🌐 <b>Til:</b> ${language}
📅 <b>Sana:</b> ${dateStr}

━━━━━━━━━━━━━━━━━━━━━━━━

💬 <b>Xabar:</b>
${escapeHtml(messageText)}${options.matchedFaqId ? `\n\n🧠 <b>Matched FAQ ID:</b> <code>${escapeHtml(String(options.matchedFaqId))}</code>` : ''}${options.agentToken ? `\n🏷 <b>Agent token:</b> <code>${escapeHtml(options.agentToken)}</code>` : ''}${options.escalationReason ? `\n⚠️ <b>Escalation reason:</b> ${escapeHtml(options.escalationReason)}` : ''}${options.transcript?.length ? `\n\n📝 <b>Transcript:</b>\n${formatTranscriptExcerpt(options.transcript)}` : ''}`;
}

const buildAdminUserSnapshot = (ctx: BotContext, user: User): SupportAdminUserSnapshot => ({
    first_name: user.first_name ?? undefined,
    last_name: user.last_name ?? undefined,
    phone_number: user.phone_number ?? undefined,
    telegram_id: user.telegram_id,
    username: ctx.from?.username ?? undefined,
    sap_card_code: user.sap_card_code ?? undefined,
    language_code: user.language_code,
});

const resolveFaqAgentToken = (faq: {
    answer_uz: string;
    answer_ru: string;
    answer_en: string;
    agent_enabled?: boolean;
    agent_token?: string | null;
}): string | null => {
    const token = getFaqAgentToken(faq, faq.agent_token || null);

    if (!token) {
        return null;
    }

    if (faq.agent_enabled) {
        return token;
    }

    return token;
};

const forwardTicketToAdminGroup = async (params: {
    api: Api<RawApi>;
    ctx: BotContext;
    user: User;
    locale: string;
    ticket: SupportTicket;
    messageText: string;
    photoFileId?: string;
    options?: AdminGroupMessageOptions;
}): Promise<boolean> => {
    const adminGroupId = config.ADMIN_GROUP_ID;
    if (!adminGroupId) {
        logger.error('ADMIN_GROUP_ID not configured');
        return false;
    }

    const adminMessage = formatAdminGroupMessage(
        params.ticket.ticket_number,
        buildAdminUserSnapshot(params.ctx, params.user),
        params.messageText,
        new Date(),
        params.options,
    );

    let groupMessage;
    if (params.photoFileId) {
        groupMessage = await params.api.sendPhoto(adminGroupId, params.photoFileId, {
            caption: adminMessage,
            parse_mode: 'HTML',
            reply_markup: getSupportTicketKeyboard(params.ticket.ticket_number, params.locale),
        });
    } else {
        groupMessage = await params.api.sendMessage(adminGroupId, adminMessage, {
            parse_mode: 'HTML',
            reply_markup: getSupportTicketKeyboard(params.ticket.ticket_number, params.locale),
        });
    }

    await SupportService.updateGroupMessageId(params.ticket.id, groupMessage.message_id);
    await SupportService.updateLatestMessageGroupMessageId(params.ticket.id, 'user', groupMessage.message_id);

    logger.info(`Forwarded ticket ${params.ticket.ticket_number} to admin group, message ID: ${groupMessage.message_id}`);
    return true;
};

const escalateAgentTicketToHuman = async (params: {
    api: Api<RawApi>;
    ctx: BotContext;
    user: User;
    locale: string;
    ticket: SupportTicket;
    reason: string;
    messageText: string;
    photoFileId?: string;
}) => {
    await SupportService.appendMessage({
        ticketId: params.ticket.id,
        senderType: 'system',
        messageText: `Escalated to human support: ${params.reason}`,
    });

    const escalatedTicket = await SupportService.escalateAgentTicket(params.ticket.id, params.reason);
    const transcript = await SupportService.getTicketMessages(params.ticket.id);

    await forwardTicketToAdminGroup({
        api: params.api,
        ctx: params.ctx,
        user: params.user,
        locale: params.locale,
        ticket: escalatedTicket || params.ticket,
        messageText: params.messageText,
        photoFileId: params.photoFileId,
        options: {
            matchedFaqId: params.ticket.matched_faq_id || null,
            agentToken: params.ticket.agent_token || null,
            escalationReason: params.reason,
            transcript,
        },
    });

    await confirmSupportForwarded(params.ctx, params.user, params.locale);
};

const continueAgentConversation = async (params: {
    api: Api<RawApi>;
    ctx: BotContext;
    user: User;
    locale: string;
    ticket: SupportTicket;
    messageText: string;
    photoFileId?: string;
}) => {
    if (params.photoFileId) {
        await escalateAgentTicketToHuman({
            ...params,
            reason: 'Photo attachments are not supported in AI support yet.',
        });
        return;
    }

    const matchedFaqId = params.ticket.matched_faq_id || null;
    if (!matchedFaqId) {
        await escalateAgentTicketToHuman({
            ...params,
            reason: 'Matched FAQ metadata is missing for this AI support thread.',
        });
        return;
    }

    const faq = await FaqService.getPublishedFaqById(matchedFaqId);
    const agentToken = faq ? resolveFaqAgentToken(faq) : null;
    if (!faq || !agentToken) {
        await escalateAgentTicketToHuman({
            ...params,
            reason: 'The FAQ assigned to this AI support thread is no longer configured for agent mode.',
        });
        return;
    }

    const history = await SupportService.getTicketMessages(params.ticket.id);

    try {
        const decision = await SupportAgentService.generateReply({
            faq,
            user: params.user,
            history,
            latestUserMessage: params.messageText,
        });

        if (decision.shouldEscalate) {
            await escalateAgentTicketToHuman({
                ...params,
                reason: decision.escalationReason || 'Gemini requested human takeover.',
            });
            return;
        }

        const sentMessage = await replyToSupportUser(
            params.ctx,
            params.user,
            params.locale,
            markdownToTelegramHtml(decision.replyText),
        );

        await SupportService.appendMessage({
            ticketId: params.ticket.id,
            senderType: 'agent',
            messageText: decision.replyText,
            telegramMessageId: typeof sentMessage?.message_id === 'number' ? sentMessage.message_id : null,
        });
    } catch (error) {
        logger.warn('Support agent failed; escalating to human support.', formatGeminiRequestFailure(error));
        await escalateAgentTicketToHuman({
            ...params,
            reason: 'Gemini support agent failed to produce a grounded response.',
        });
    }
};

/**
 * Shared logic to process a support request: create ticket and forward to admin group
 */
export async function processSupportRequest(
    api: Api<RawApi>,
    ctx: BotContext,
    user: any,
    messageText: string,
    messageId: number,
    photoFileId: string | undefined,
    locale: string,
    isExternal: boolean = false
): Promise<void> {
    if (!user) return;

    if (isExternal) {
        // Log or handle external source
        logger.debug(`Processing external support request for user ${user.telegram_id}`);
    }

    let loadingMsg: any = null;
    try {
        loadingMsg = await ctx.reply(i18n.t(locale, 'support_ai_thinking'), { parse_mode: 'HTML' });
    } catch {
        // ignore error
    }

    try {
        const activeAgentTicket = await SupportService.getOpenAgentTicketByUserTelegramId(user.telegram_id);
        if (activeAgentTicket) {
            await SupportService.syncTicketPreviewMessage({
                ticketId: activeAgentTicket.id,
                messageText,
                messageId,
                photoFileId,
            });
            await SupportService.appendMessage({
                ticketId: activeAgentTicket.id,
                senderType: 'user',
                messageText,
                photoFileId,
                telegramMessageId: messageId,
            });

            logger.info(
                `[SUPPORT] Continuing active AI support ticket ${activeAgentTicket.ticket_number} for user ${user.telegram_id}.`,
            );

            await continueAgentConversation({
                api,
                ctx,
                user,
                locale,
                ticket: activeAgentTicket,
                messageText,
                photoFileId,
            });
            return;
        }

        const faqResolution = await FaqRoutingService.resolveSupportFaq(messageText);
        const localizedAnswer = faqResolution
            ? getFaqAnswerForLanguage(faqResolution.faq, user.language_code || locale)
            : '';
        const agentToken = faqResolution ? resolveFaqAgentToken(faqResolution.faq) : null;

        if (faqResolution && agentToken) {
            const agentTicket = await SupportService.createTicket({
                userTelegramId: user.telegram_id,
                messageText,
                messageId,
                photoFileId,
                handlingMode: 'agent',
                matchedFaqId: faqResolution.faq.id,
                agentToken,
            });

            await SupportService.appendMessage({
                ticketId: agentTicket.id,
                senderType: 'user',
                messageText,
                photoFileId,
                telegramMessageId: messageId,
            });

            logger.info(
                `[SUPPORT] Started AI support ticket ${agentTicket.ticket_number} from FAQ ${faqResolution.faq.id} for user ${user.telegram_id}.`,
            );

            await continueAgentConversation({
                api,
                ctx,
                user,
                locale,
                ticket: agentTicket,
                messageText,
                photoFileId,
            });
            return;
        }

        if (faqResolution && localizedAnswer) {
            const confidenceLabel = typeof faqResolution.confidence === 'number'
                ? ` confidence=${faqResolution.confidence.toFixed(2)}`
                : '';
            const semanticDistanceLabel = typeof faqResolution.distance === 'number'
                ? ` distance=${faqResolution.distance.toFixed(4)}`
                : '';
            const reasonLabel = faqResolution.reason ? ` reason=${faqResolution.reason}` : '';
            logger.info(
                `Resolved support request for user ${user.telegram_id} with ${faqResolution.resolutionType} FAQ ${faqResolution.faq.id}${semanticDistanceLabel}${confidenceLabel}${reasonLabel}`,
            );

            if (user?.is_admin) {
                await ctx.reply(markdownToTelegramHtml(localizedAnswer), {
                    reply_markup: getAdminMenuKeyboard(locale),
                    parse_mode: 'HTML',
                });
            } else {
                const isLoggedIn = user ? !user.is_logged_out : false;
                await ctx.reply(markdownToTelegramHtml(localizedAnswer), {
                    reply_markup: getMainKeyboardByLocale(locale, false, isLoggedIn),
                    parse_mode: 'HTML',
                });
            }

            return;
        }

        logger.info(
            `[SUPPORT] No FAQ auto-reply matched for user ${user.telegram_id}; creating a human support ticket and forwarding to admin group.`,
        );

        const ticket = await SupportService.createTicket({
            userTelegramId: user.telegram_id,
            messageText,
            messageId,
            photoFileId,
        });
        await SupportService.appendMessage({
            ticketId: ticket.id,
            senderType: 'user',
            messageText,
            photoFileId,
            telegramMessageId: messageId,
        });

        logger.info(`Created support ticket ${ticket.ticket_number} for user ${user.telegram_id}`);

        await forwardTicketToAdminGroup({
            api,
            ctx,
            user,
            locale,
            ticket,
            messageText,
            photoFileId,
        });
        await confirmSupportForwarded(ctx, user, locale);

    } catch (error) {
        logger.error('Error processing support request:', error);
        const isAdmin = user?.is_admin || false;
        if (isAdmin) {
            await ctx.reply(i18n.t(locale, 'admin_error'), {
                reply_markup: getAdminMenuKeyboard(locale),
                parse_mode: 'HTML',
            });
        } else {
            const isLoggedIn = user ? !user.is_logged_out : false;
            await ctx.reply(i18n.t(locale, 'support_error'), {
                reply_markup: getMainKeyboardByLocale(locale, false, isLoggedIn),
                parse_mode: 'HTML',
            });
        }
        throw error; // Rethrow to let conversation handle it if needed
    } finally {
        if (loadingMsg && loadingMsg.chat && loadingMsg.message_id) {
            await api.deleteMessage(loadingMsg.chat.id, loadingMsg.message_id).catch(() => {});
        }
    }
}
