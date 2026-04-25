import { BotContext } from '../../types/context';
import { FaqRoutingService, SupportFaqResolution } from '../../services/faq/faq-routing.service';
import { FaqService } from '../../services/faq/faq.service';
import { SupportAgentService } from '../../services/support/support-agent.service';
import { SupportDispatcherService } from '../../services/support/support-dispatcher.service';
import { SupportService } from '../../services/support/support.service';
import { ErrorNotificationService } from '../../services/error-notification.service';
import { i18n } from '../../i18n';
import { logger } from '../logger';
import { formatGeminiRequestFailure } from '../gemini-error.util';
import { formatUzPhone } from '../uz-phone.util';
import { escapeHtml, markdownToTelegramHtml } from '../telegram/telegram-rich-text.util';
import {
  getAdminGroupChatId,
  withAdminGroupMigrationRetry,
} from '../telegram/admin-group-chat.util';
import { getFaqAnswerForLanguage, getFaqAgentToken } from '../faq/faq-match.util';
import { getSupportTicketKeyboard, getMainKeyboardByLocale } from '../../keyboards';
import { getAdminMenuKeyboard } from '../../keyboards/admin.keyboards';
import { Api, InputFile, RawApi } from 'grammy';
import { SupportTicket, SupportTicketMessage } from '../../types/support.types';
import { User } from '../../services/user.service';
import { buildSupportTranscriptHtmlExport } from './support-transcript-html.util';

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
  hasTranscriptAttachment?: boolean;
}

type SupportLocale = 'uz' | 'ru';

interface SupportAdminGroupCopy {
  title: string;
  user: string;
  phone: string;
  telegram: string;
  sapCode: string;
  language: string;
  createdAt: string;
  message: string;
  matchedFaqId: string;
  agentToken: string;
  escalationReason: string;
  fullTranscript: string;
  transcriptAttached: string;
  transcriptPreview: string;
  transcriptSystemPrefix: string;
}

interface AdminGroupForwardResult {
  forwarded: boolean;
  groupMessageId: number | null;
}

interface ProcessSupportRequestOptions {
  deferred?: boolean;
  loadingMessage?: {
    chat?: { id: number };
    message_id?: number;
  } | null;
}

interface SupportReplyOptions {
  api: Api<RawApi>;
  ctx: BotContext;
  user: User;
  locale: string;
  chatId: number;
  deferred: boolean;
  text: string;
  parseMode?: 'HTML';
}

const normalizeSupportLocale = (languageCode?: string | null): SupportLocale =>
  languageCode === 'ru' ? 'ru' : 'uz';

const SUPPORT_ADMIN_GROUP_COPY: Record<SupportLocale, SupportAdminGroupCopy> = {
  uz: {
    title: 'Yangi murojaat',
    user: 'Foydalanuvchi',
    phone: 'Telefon',
    telegram: 'Telegram',
    sapCode: 'SAP Kod',
    language: 'Til',
    createdAt: 'Sana',
    message: 'Xabar',
    matchedFaqId: 'Mos FAQ ID',
    agentToken: 'Agent token',
    escalationReason: 'Operatorga yo‘naltirish sababi',
    fullTranscript: 'To‘liq transkript',
    transcriptAttached: 'To‘liq HTML transkript quyida yuboriladi.',
    transcriptPreview: 'Transkript',
    transcriptSystemPrefix: 'Tizim',
  },
  ru: {
    title: 'Новое обращение',
    user: 'Пользователь',
    phone: 'Телефон',
    telegram: 'Telegram',
    sapCode: 'SAP код',
    language: 'Язык',
    createdAt: 'Дата',
    message: 'Сообщение',
    matchedFaqId: 'Связанный FAQ ID',
    agentToken: 'Токен агента',
    escalationReason: 'Причина передачи оператору',
    fullTranscript: 'Полный транскрипт',
    transcriptAttached: 'Полный HTML-транскрипт будет отправлен ниже.',
    transcriptPreview: 'Транскрипт',
    transcriptSystemPrefix: 'Система',
  },
};

const buildEscalationSystemMessage = (locale: SupportLocale, reason: string): string =>
  locale === 'ru'
    ? `AI-агент передал обращение оператору: ${reason}`
    : `AI yordamchi murojaatni operatorga yo'naltirdi: ${reason}`;

const localizeSystemSenderLabel = (locale: SupportLocale): string =>
  locale === 'ru'
    ? SUPPORT_ADMIN_GROUP_COPY.ru.transcriptSystemPrefix
    : SUPPORT_ADMIN_GROUP_COPY.uz.transcriptSystemPrefix;

const localizeEscalationReason = (locale: SupportLocale, reason: string): string => {
  const normalizedReason = reason.trim();

  switch (normalizedReason) {
    case 'Photo attachments are not supported in AI support yet.':
      return locale === 'ru'
        ? 'К обращению прикреплено фото, поэтому требуется проверка оператором.'
        : 'Murojaatga rasm biriktirilgan, shu sabab operator tekshiruvi kerak.';
    case 'The FAQ assigned to this AI support thread is no longer configured for agent mode.':
      return locale === 'ru'
        ? 'Назначенный FAQ больше не настроен для режима AI-агента, поэтому обращение передано оператору.'
        : 'Biriktirilgan FAQ endi AI agent rejimi uchun sozlanmagan, shu sabab murojaat operatorga yuborildi.';
    case 'Gemini requested human takeover.':
      return locale === 'ru'
        ? 'AI-агент определил, что для этого запроса нужен оператор.'
        : 'AI agent ushbu so‘rov uchun operator aralashuvi kerakligini aniqladi.';
    case 'Gemini support agent failed to produce a grounded response.':
      return locale === 'ru'
        ? 'AI-агент не смог подготовить надёжный ответ, поэтому обращение передано оператору.'
        : 'AI agent ishonchli javob tayyorlay olmadi, shu sabab murojaat operatorga yuborildi.';
    default:
      return normalizedReason;
  }
};

const getSenderLabel = (
  senderType: SupportTicketMessage['sender_type'],
  locale: SupportLocale = 'uz',
): string => {
  if (senderType === 'agent') {
    return locale === 'ru' ? 'AI агент' : 'AI agent';
  }

  if (senderType === 'admin') {
    return locale === 'ru' ? 'Администратор' : 'Admin';
  }

  if (senderType === 'system') {
    return localizeSystemSenderLabel(locale);
  }

  return locale === 'ru' ? 'Пользователь' : 'Foydalanuvchi';
};

const formatTranscriptExcerpt = (
  messages: SupportTicketMessage[] = [],
  locale: SupportLocale = 'uz',
  limit: number = 10,
): string => {
  if (messages.length === 0) {
    return '';
  }

  return messages
    .slice(-limit)
    .map((message, index) => {
      const photoSuffix = message.photo_file_id ? (locale === 'ru' ? ' [фото]' : ' [rasm]') : '';
      return `${index + 1}. <b>${escapeHtml(getSenderLabel(message.sender_type, locale))}:</b> ${escapeHtml(message.message_text)}${photoSuffix}`;
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

const replyToSupportUser = async (params: SupportReplyOptions) => {
  const options = {
    reply_markup: buildSupportReplyMarkup(params.user, params.locale),
    ...(params.parseMode ? { parse_mode: params.parseMode } : {}),
  };

  if (params.deferred) {
    return params.api.sendMessage(params.chatId, params.text, options);
  }

  return params.ctx.reply(params.text, options);
};

const sendSupportLoadingMessage = async (params: {
  api: Api<RawApi>;
  ctx: BotContext;
  chatId: number;
  locale: string;
  deferred: boolean;
}) => {
  const text = i18n.t(params.locale, 'support_ai_thinking');

  if (params.deferred) {
    return params.api.sendMessage(params.chatId, text);
  }

  return params.ctx.reply(text);
};

const getSupportChatId = (ctx: BotContext, user: User): number =>
  ctx.chat?.id ?? ctx.from?.id ?? user.telegram_id;

export async function enqueueSupportRequest(
  api: Api<RawApi>,
  ctx: BotContext,
  user: User,
  messageText: string,
  messageId: number,
  photoFileId: string | undefined,
  locale: string,
  isExternal: boolean = false,
): Promise<void> {
  if (!user) {
    return;
  }

  const chatId = getSupportChatId(ctx, user);
  let loadingMessage: { chat?: { id: number }; message_id?: number } | null = null;
  try {
    loadingMessage = await sendSupportLoadingMessage({
      api,
      ctx,
      chatId,
      locale,
      deferred: true,
    });
  } catch {
    // ignore error
  }

  SupportDispatcherService.enqueue({
    userTelegramId: user.telegram_id,
    label: `support:${messageId}`,
    job: async () => {
      await processSupportRequest(
        api,
        ctx,
        user,
        messageText,
        messageId,
        photoFileId,
        locale,
        isExternal,
        {
          deferred: true,
          loadingMessage,
        },
      );
    },
  });
}

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
  const locale = normalizeSupportLocale(user.language_code);
  const copy = SUPPORT_ADMIN_GROUP_COPY[locale];
  const fullName = escapeHtml(
    `${user.first_name || ''} ${user.last_name || ''}`.trim() ||
      i18n.t(user.language_code, 'admin_unknown_user'),
  );
  const phone = escapeHtml(formatUzPhone(user.phone_number));
  const username = user.username
    ? `<b>@${escapeHtml(user.username)}</b>`
    : i18n.t(user.language_code, 'admin_no');
  const sapCode = escapeHtml(user.sap_card_code || i18n.t(user.language_code, 'admin_no'));
  const language =
    user.language_code === 'ru' ? i18n.t('ru', 'ru_button') : i18n.t('uz', 'uz_button');
  const dateStr = escapeHtml(
    createdAt.toLocaleString(locale === 'ru' ? 'ru-RU' : 'uz-UZ', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }),
  );

  return `📩 <b>${escapeHtml(copy.title)} #${escapeHtml(ticketNumber)}</b>
    
👤 <b>${escapeHtml(copy.user)}:</b> ${fullName}
📱 <b>${escapeHtml(copy.phone)}:</b> ${phone}
🆔 <b>${escapeHtml(copy.telegram)}:</b> ${username} (ID: <code>${escapeHtml(user.telegram_id.toString())}</code>)
💼 <b>${escapeHtml(copy.sapCode)}:</b> ${sapCode}
🌐 <b>${escapeHtml(copy.language)}:</b> ${language}
📅 <b>${escapeHtml(copy.createdAt)}:</b> ${dateStr}

━━━━━━━━━━━━━━━━━━━━━━━━

💬 <b>${escapeHtml(copy.message)}:</b>
${escapeHtml(messageText)}${options.matchedFaqId ? `\n\n🧠 <b>${escapeHtml(copy.matchedFaqId)}:</b> <code>${escapeHtml(String(options.matchedFaqId))}</code>` : ''}${options.agentToken ? `\n🏷 <b>${escapeHtml(copy.agentToken)}:</b> <code>${escapeHtml(options.agentToken)}</code>` : ''}${options.escalationReason ? `\n⚠️ <b>${escapeHtml(copy.escalationReason)}:</b> ${escapeHtml(options.escalationReason)}` : ''}${options.hasTranscriptAttachment ? `\n📎 <b>${escapeHtml(copy.fullTranscript)}:</b> ${escapeHtml(copy.transcriptAttached)}` : ''}${options.transcript?.length ? `\n\n📝 <b>${escapeHtml(copy.transcriptPreview)}:</b>\n${formatTranscriptExcerpt(options.transcript, locale)}` : ''}`;
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

const FALLBACK_SUPPORT_AGENT_TOKEN = '__FALLBACK_AI_SUPPORT__';

const resolveFaqAgentToken = (faq: {
  answer_uz: string;
  answer_ru: string;
  answer_en: string;
  agent_enabled?: boolean;
  agent_token?: string | null;
}): string | null => {
  if (!faq.agent_enabled) {
    return null;
  }

  const token = getFaqAgentToken(faq, faq.agent_token || null);

  if (!token) {
    return null;
  }

  return token;
};

const shouldContinueActiveAgentTicket = (params: {
  activeAgentTicket: SupportTicket;
  faqResolution: SupportFaqResolution | null;
  agentToken: string | null;
}): boolean => {
  if (!params.faqResolution) {
    return true;
  }

  return Boolean(
    params.agentToken &&
    params.activeAgentTicket.matched_faq_id &&
    params.faqResolution.faq.id === params.activeAgentTicket.matched_faq_id,
  );
};

const closeSupersededAgentTicket = async (params: { ticket: SupportTicket; reason: string }) => {
  await SupportService.appendMessage({
    ticketId: params.ticket.id,
    senderType: 'system',
    messageText: `AI support thread closed: ${params.reason}`,
  });

  await SupportService.closeTicket(params.ticket.id);

  logger.info(
    `[SUPPORT] Closed active AI support ticket ${params.ticket.ticket_number} before rerouting. reason="${params.reason}"`,
  );
};

const getOrCreateLocalSupportTicket = async (params: {
  user: User;
  messageText: string;
  messageId: number;
  photoFileId?: string;
}): Promise<{ ticket: SupportTicket; reusedExistingTicket: boolean }> => {
  const existingTicket = await SupportService.getLatestOpenUnforwardedTicketByUserTelegramId(
    params.user.telegram_id,
  );

  if (existingTicket) {
    await SupportService.syncTicketPreviewMessage({
      ticketId: existingTicket.id,
      messageText: params.messageText,
      messageId: params.messageId,
      photoFileId: params.photoFileId,
    });

    return {
      ticket: existingTicket,
      reusedExistingTicket: true,
    };
  }

  const ticket = await SupportService.createTicket({
    userTelegramId: params.user.telegram_id,
    messageText: params.messageText,
    messageId: params.messageId,
    photoFileId: params.photoFileId,
  });

  return {
    ticket,
    reusedExistingTicket: false,
  };
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
}): Promise<AdminGroupForwardResult> => {
  const adminGroupId = getAdminGroupChatId();
  if (!adminGroupId) {
    logger.error('SUPPORT_GROUP_ID is not configured');
    return { forwarded: false, groupMessageId: null };
  }

  const adminMessage = formatAdminGroupMessage(
    params.ticket.ticket_number,
    buildAdminUserSnapshot(params.ctx, params.user),
    params.messageText,
    new Date(),
    params.options,
  );

  const groupMessage: { message_id: number } = params.photoFileId
    ? await withAdminGroupMigrationRetry((chatId) =>
        params.api.sendPhoto(chatId, params.photoFileId!, {
          caption: adminMessage,
          parse_mode: 'HTML',
          reply_markup: getSupportTicketKeyboard(params.ticket.ticket_number, params.locale),
        }),
      )
    : await withAdminGroupMigrationRetry((chatId) =>
        params.api.sendMessage(chatId, adminMessage, {
          parse_mode: 'HTML',
          reply_markup: getSupportTicketKeyboard(params.ticket.ticket_number, params.locale),
        }),
      );

  await SupportService.updateGroupMessageId(params.ticket.id, groupMessage.message_id);
  await SupportService.updateLatestMessageGroupMessageId(
    params.ticket.id,
    'user',
    groupMessage.message_id,
  );

  logger.info(
    `Forwarded ticket ${params.ticket.ticket_number} to admin group, message ID: ${groupMessage.message_id}`,
  );
  return {
    forwarded: true,
    groupMessageId: groupMessage.message_id,
  };
};

const sendSupportTranscriptAttachmentToAdminGroup = async (params: {
  api: Api<RawApi>;
  ctx: BotContext;
  user: User;
  ticket: SupportTicket;
  transcript: SupportTicketMessage[];
  groupMessageId: number;
}) => {
  if (!params.transcript.length) {
    return;
  }

  const transcriptExport = buildSupportTranscriptHtmlExport({
    ticket: params.ticket,
    user: buildAdminUserSnapshot(params.ctx, params.user),
    messages: params.transcript,
  });

  try {
    await withAdminGroupMigrationRetry((chatId) =>
      params.api.sendDocument(
        chatId,
        new InputFile(transcriptExport.buffer, transcriptExport.fileName),
        {
          caption:
            normalizeSupportLocale(params.user.language_code) === 'ru'
              ? `📎 <b>Полный транскрипт обращения #${escapeHtml(params.ticket.ticket_number)}</b>`
              : `📎 <b>Murojaat #${escapeHtml(params.ticket.ticket_number)} uchun to'liq transkript</b>`,
          parse_mode: 'HTML',
          reply_parameters: { message_id: params.groupMessageId },
        },
      ),
    );
  } catch (error) {
    logger.warn(
      `[SUPPORT] Failed to send HTML transcript attachment for ticket ${params.ticket.ticket_number}.`,
      error,
    );
  }
};

const escalateAgentTicketToHuman = async (params: {
  api: Api<RawApi>;
  ctx: BotContext;
  user: User;
  locale: string;
  chatId: number;
  deferred: boolean;
  ticket: SupportTicket;
  reason: string;
  messageText: string;
  photoFileId?: string;
  customerMessage?: string;
}) => {
  const supportLocale = normalizeSupportLocale(params.locale);
  const localizedReason = localizeEscalationReason(supportLocale, params.reason);

  await SupportService.appendMessage({
    ticketId: params.ticket.id,
    senderType: 'system',
    messageText: buildEscalationSystemMessage(supportLocale, localizedReason),
  });

  const escalatedTicket = await SupportService.escalateAgentTicket(
    params.ticket.id,
    localizedReason,
  );
  const transcript = await SupportService.getTicketMessages(params.ticket.id);

  const forwardResult = await forwardTicketToAdminGroup({
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
      escalationReason: localizedReason,
      transcript,
      hasTranscriptAttachment: true,
    },
  });

  if (!forwardResult.forwarded) {
    logger.warn(
      `[SUPPORT] Failed to forward escalated AI support ticket ${params.ticket.ticket_number} to the admin group.`,
    );

    await replyToSupportUser({
      api: params.api,
      ctx: params.ctx,
      user: params.user,
      locale: params.locale,
      chatId: params.chatId,
      deferred: params.deferred,
      text: i18n.t(params.locale, 'support_ai_fallback'),
    });
    return;
  }

  const customerMessage =
    params.customerMessage?.trim() || i18n.t(params.locale, 'support_ai_handoff');
  await replyToSupportUser({
    api: params.api,
    ctx: params.ctx,
    user: params.user,
    locale: params.locale,
    chatId: params.chatId,
    deferred: params.deferred,
    text: markdownToTelegramHtml(customerMessage),
    parseMode: 'HTML',
  });

  if (forwardResult.groupMessageId && transcript.length) {
    void sendSupportTranscriptAttachmentToAdminGroup({
      api: params.api,
      ctx: params.ctx,
      user: params.user,
      ticket: escalatedTicket || params.ticket,
      transcript,
      groupMessageId: forwardResult.groupMessageId,
    });
  }
};

const continueAgentConversation = async (params: {
  api: Api<RawApi>;
  ctx: BotContext;
  user: User;
  locale: string;
  chatId: number;
  deferred: boolean;
  ticket: SupportTicket;
  messageText: string;
  photoFileId?: string;
}) => {
  if (params.photoFileId) {
    await escalateAgentTicketToHuman({
      ...params,
      reason: 'Photo attachments are not supported in AI support yet.',
      customerMessage: i18n.t(params.locale, 'support_ai_fallback'),
    });
    return;
  }

  const matchedFaqId = params.ticket.matched_faq_id || null;
  const faq = matchedFaqId ? await FaqService.getPublishedFaqById(matchedFaqId) : null;
  const agentToken = faq ? resolveFaqAgentToken(faq) : params.ticket.agent_token || null;
  if (matchedFaqId && (!faq || !agentToken)) {
    await escalateAgentTicketToHuman({
      ...params,
      reason: 'The FAQ assigned to this AI support thread is no longer configured for agent mode.',
      customerMessage: i18n.t(params.locale, 'support_ai_fallback'),
    });
    return;
  }

  const history = await SupportService.getTicketMessages(params.ticket.id);

  try {
    const decision = await SupportAgentService.generateReply({
      user: params.user,
      history,
      latestUserMessage: params.messageText,
    });

    if (decision.shouldEscalate) {
      await escalateAgentTicketToHuman({
        ...params,
        reason: decision.escalationReason || 'Gemini requested human takeover.',
        customerMessage: decision.replyText?.trim() || i18n.t(params.locale, 'support_ai_handoff'),
      });
      return;
    }

    const sentMessage = await replyToSupportUser({
      api: params.api,
      ctx: params.ctx,
      user: params.user,
      locale: params.locale,
      chatId: params.chatId,
      deferred: params.deferred,
      text: markdownToTelegramHtml(decision.replyText),
      parseMode: 'HTML',
    });

    await SupportService.appendMessage({
      ticketId: params.ticket.id,
      senderType: 'agent',
      messageText: decision.replyText,
      telegramMessageId:
        typeof sentMessage?.message_id === 'number' ? sentMessage.message_id : null,
    });
  } catch (error) {
    logger.warn(
      'Support agent failed; escalating to human support.',
      formatGeminiRequestFailure(error),
    );
    void ErrorNotificationService.notify({
      api: params.api,
      error,
      context: {
        scope: 'support_ai_agent',
        severity: 'critical',
        title: 'AI support agent failed',
        updateId: params.ctx.update?.update_id ?? null,
        chatId: params.ctx.chat?.id ?? params.chatId,
        chatType: params.ctx.chat?.type ?? 'private',
        ticketNumber: params.ticket.ticket_number,
        actor: {
          telegramId: params.user.telegram_id,
          username: params.ctx.from?.username ?? null,
          firstName: params.user.first_name ?? params.ctx.from?.first_name ?? null,
          lastName: params.user.last_name ?? params.ctx.from?.last_name ?? null,
          languageCode: params.user.language_code || params.locale,
        },
        userMessage: params.messageText,
        metadata: {
          userId: params.user.id,
          matchedFaqId: params.ticket.matched_faq_id || null,
          agentToken: params.ticket.agent_token || null,
          photoAttached: Boolean(params.photoFileId),
          failure: formatGeminiRequestFailure(error),
        },
      },
    });
    await escalateAgentTicketToHuman({
      ...params,
      reason: 'Gemini support agent failed to produce a grounded response.',
      customerMessage: i18n.t(params.locale, 'support_ai_fallback'),
    });
  }
};

/**
 * Shared logic to process a support request: create ticket and forward to admin group
 */
export async function processSupportRequest(
  api: Api<RawApi>,
  ctx: BotContext,
  user: User,
  messageText: string,
  messageId: number,
  photoFileId: string | undefined,
  locale: string,
  isExternal: boolean = false,
  options: ProcessSupportRequestOptions = {},
): Promise<void> {
  if (!user) return;

  const deferred = options.deferred === true;

  if (isExternal) {
    // Log or handle external source
    logger.debug(`Processing external support request for user ${user.telegram_id}`);
  }

  let loadingMsg: { chat?: { id: number }; message_id?: number } | null =
    options.loadingMessage || null;
  let typingHeartbeat: ReturnType<typeof setInterval> | null = null;
  const chatId = getSupportChatId(ctx, user);

  const stopTypingHeartbeat = () => {
    if (typingHeartbeat) {
      clearInterval(typingHeartbeat);
      typingHeartbeat = null;
    }
  };

  if (chatId) {
    await api.sendChatAction(chatId, 'typing').catch(() => {});
    typingHeartbeat = setInterval(() => {
      void api.sendChatAction(chatId, 'typing').catch(() => {});
    }, 4500);
  }

  if (!loadingMsg) {
    try {
      loadingMsg = await sendSupportLoadingMessage({
        api,
        ctx,
        chatId,
        locale,
        deferred,
      });
    } catch {
      // ignore error
    }
  }

  try {
    const activeAgentTicket = await SupportService.getOpenAgentTicketByUserTelegramId(
      user.telegram_id,
    );
    const faqResolution = await FaqRoutingService.resolveSupportFaq(messageText);
    const localizedAnswer = faqResolution
      ? getFaqAnswerForLanguage(faqResolution.faq, user.language_code || locale)
      : '';
    const agentToken = faqResolution ? resolveFaqAgentToken(faqResolution.faq) : null;

    if (activeAgentTicket) {
      if (
        shouldContinueActiveAgentTicket({
          activeAgentTicket,
          faqResolution,
          agentToken,
        })
      ) {
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
          chatId,
          deferred,
          ticket: activeAgentTicket,
          messageText,
          photoFileId,
        });
        return;
      }

      const rerouteReason = faqResolution
        ? `New message re-routed by FAQ resolution to faq:${faqResolution.faq.id} (${faqResolution.resolutionType}).`
        : 'New message no longer belongs to the active AI support flow.';

      await closeSupersededAgentTicket({
        ticket: activeAgentTicket,
        reason: rerouteReason,
      });
    }

    const { ticket: localTicket, reusedExistingTicket } = await getOrCreateLocalSupportTicket({
      user,
      messageText,
      messageId,
      photoFileId,
    });

    await SupportService.appendMessage({
      ticketId: localTicket.id,
      senderType: 'user',
      messageText,
      photoFileId,
      telegramMessageId: messageId,
    });

    if (faqResolution && agentToken) {
      const agentTicket = (await SupportService.updateTicketHandling({
        ticketId: localTicket.id,
        handlingMode: 'agent',
        matchedFaqId: faqResolution.faq.id,
        agentToken,
        agentEscalationReason: null,
      })) || {
        ...localTicket,
        handling_mode: 'agent' as const,
        matched_faq_id: faqResolution.faq.id,
        agent_token: agentToken,
        agent_escalation_reason: null,
      };

      logger.info(
        reusedExistingTicket
          ? `[SUPPORT] Reused local support ticket ${agentTicket.ticket_number} and promoted it to AI support from FAQ ${faqResolution.faq.id} for user ${user.telegram_id}.`
          : `[SUPPORT] Started AI support ticket ${agentTicket.ticket_number} from FAQ ${faqResolution.faq.id} for user ${user.telegram_id}.`,
      );

      await continueAgentConversation({
        api,
        ctx,
        user,
        locale,
        chatId,
        deferred,
        ticket: agentTicket,
        messageText,
        photoFileId,
      });
      return;
    }

    if (faqResolution && localizedAnswer) {
      const confidenceLabel =
        typeof faqResolution.confidence === 'number'
          ? ` confidence=${faqResolution.confidence.toFixed(2)}`
          : '';
      const semanticDistanceLabel =
        typeof faqResolution.distance === 'number'
          ? ` distance=${faqResolution.distance.toFixed(4)}`
          : '';
      const reasonLabel = faqResolution.reason ? ` reason=${faqResolution.reason}` : '';
      logger.info(
        `Resolved support request for user ${user.telegram_id} with ${faqResolution.resolutionType} FAQ ${faqResolution.faq.id}${semanticDistanceLabel}${confidenceLabel}${reasonLabel}`,
      );

      await replyToSupportUser({
        api,
        ctx,
        user,
        locale,
        chatId,
        deferred,
        text: markdownToTelegramHtml(localizedAnswer),
        parseMode: 'HTML',
      });

      await SupportService.appendMessage({
        ticketId: localTicket.id,
        senderType: 'agent',
        messageText: localizedAnswer,
      });

      return;
    }

    const fallbackAgentTicket = (await SupportService.updateTicketHandling({
      ticketId: localTicket.id,
      handlingMode: 'agent',
      matchedFaqId: null,
      agentToken: FALLBACK_SUPPORT_AGENT_TOKEN,
      agentEscalationReason: null,
    })) || {
      ...localTicket,
      handling_mode: 'agent' as const,
      matched_faq_id: null,
      agent_token: FALLBACK_SUPPORT_AGENT_TOKEN,
      agent_escalation_reason: null,
    };

    logger.info(
      `[SUPPORT] No FAQ auto-reply matched for user ${user.telegram_id}; continuing with fallback AI support on ticket ${fallbackAgentTicket.ticket_number}.`,
    );

    await continueAgentConversation({
      api,
      ctx,
      user,
      locale,
      chatId,
      deferred,
      ticket: fallbackAgentTicket,
      messageText,
      photoFileId,
    });
  } catch (error) {
    logger.error('Error processing support request:', error);
    const isAdmin = user?.is_admin || false;
    if (isAdmin) {
      await replyToSupportUser({
        api,
        ctx,
        user,
        locale,
        chatId,
        deferred,
        text: i18n.t(locale, 'admin_error'),
        parseMode: 'HTML',
      });
    } else {
      await replyToSupportUser({
        api,
        ctx,
        user,
        locale,
        chatId,
        deferred,
        text: i18n.t(locale, 'support_error'),
        parseMode: 'HTML',
      });
    }
    throw error; // Rethrow to let conversation handle it if needed
  } finally {
    stopTypingHeartbeat();
    if (loadingMsg && loadingMsg.chat && loadingMsg.message_id) {
      await api.deleteMessage(loadingMsg.chat.id, loadingMsg.message_id).catch(() => {});
    }
  }
}
