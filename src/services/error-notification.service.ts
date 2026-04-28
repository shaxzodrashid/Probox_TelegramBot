import { Api, RawApi } from 'grammy';
import type { BotContext } from '../types/context';
import { config } from '../config';
import { logger } from '../utils/logger';
import { escapeHtml } from '../utils/telegram/telegram-rich-text.util';
import {
  getAdminGroupChatId,
  withAdminGroupMigrationRetry,
} from '../utils/telegram/admin-group-chat.util';
import { isUserBlockedError } from '../utils/telegram/telegram-errors';

type ErrorNotificationSeverity = 'warning' | 'error' | 'critical';

interface ErrorNotificationActor {
  telegramId?: number | null;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  languageCode?: string | null;
}

interface ErrorNotificationContext {
  scope: string;
  severity?: ErrorNotificationSeverity;
  title?: string;
  updateId?: number | null;
  chatId?: number | string | null;
  chatType?: string | null;
  actor?: ErrorNotificationActor | null;
  userMessage?: string | null;
  ticketNumber?: string | null;
  includeStack?: boolean;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}

const MAX_TELEGRAM_MESSAGE_LENGTH = 3900;
const MAX_STACK_LENGTH = 1600;
const MAX_FIELD_LENGTH = 500;

const truncate = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
};

const normalizeError = (error: unknown): {
  name: string;
  message: string;
  stack: string | null;
} => {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message || String(error),
      stack: error.stack || null,
    };
  }

  return {
    name: 'NonError',
    message: String(error),
    stack: null,
  };
};

const getSeverityIcon = (severity: ErrorNotificationSeverity): string => {
  switch (severity) {
    case 'critical':
      return '🚨';
    case 'warning':
      return '⚠️';
    default:
      return '🔥';
  }
};

const formatActor = (actor?: ErrorNotificationActor | null): string => {
  if (!actor) {
    return 'n/a';
  }

  const fullName = `${actor.firstName || ''} ${actor.lastName || ''}`.trim();
  const username = actor.username ? `@${actor.username}` : 'no username';
  const telegramId = actor.telegramId ? `ID ${actor.telegramId}` : 'no id';
  const languageCode = actor.languageCode ? `lang=${actor.languageCode}` : 'lang=n/a';

  return [fullName || 'no name', username, telegramId, languageCode].join(' | ');
};

const formatMetadata = (
  metadata: ErrorNotificationContext['metadata'],
): string => {
  if (!metadata) {
    return '';
  }

  const entries = Object.entries(metadata).filter(([, value]) => value !== undefined);
  if (!entries.length) {
    return '';
  }

  return entries
    .map(([key, value]) => {
      const displayValue = value === null ? 'null' : String(value);
      return `<b>${escapeHtml(key)}:</b> <code>${escapeHtml(truncate(displayValue, MAX_FIELD_LENGTH))}</code>`;
    })
    .join('\n');
};

const formatUserBlockedReason = (error: unknown): string => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (message.includes('bot was blocked by the user')) {
    return 'Foydalanuvchi botni bloklagan.';
  }

  if (message.includes('user is deactivated')) {
    return 'Foydalanuvchi akkaunti o‘chirilgan.';
  }

  if (message.includes('chat not found')) {
    return 'Telegram chat endi mavjud emas.';
  }

  return 'Telegram xabarni rad etdi, chunki foydalanuvchiga bog‘lanib bo‘lmayapti.';
};

const getNotificationChatId = (): string => {
  return config.ERROR_NOTIFICATION_CHAT_ID || getAdminGroupChatId();
};

const sendToNotificationChat = async (
  api: Api<RawApi>,
  text: string,
): Promise<void> => {
  const explicitChatId = config.ERROR_NOTIFICATION_CHAT_ID.trim();

  if (explicitChatId) {
    await api.sendMessage(explicitChatId, text, {
      parse_mode: 'HTML',
    });
    return;
  }

  await withAdminGroupMigrationRetry((chatId) =>
    api.sendMessage(chatId, text, {
      parse_mode: 'HTML',
    }),
  );
};

export class ErrorNotificationService {
  private static buildMessage(params: {
    error: unknown;
    context: ErrorNotificationContext;
  }): string {
    if (
      params.context.scope === 'telegram_update' &&
      params.context.chatType === 'private' &&
      isUserBlockedError(params.error)
    ) {
      return this.buildUserBlockedMessage(params);
    }

    const error = normalizeError(params.error);
    const severity = params.context.severity || 'error';
    const timestamp = new Date().toISOString();
    const metadata = formatMetadata(params.context.metadata);
    const title = params.context.title || 'Bot error detected';
    const userMessage = params.context.userMessage
      ? truncate(params.context.userMessage.replace(/\s+/g, ' ').trim(), MAX_FIELD_LENGTH)
      : null;
    const stack =
      params.context.includeStack === false
        ? null
        : error.stack
          ? truncate(error.stack, MAX_STACK_LENGTH)
          : null;

    const sections = [
      `${getSeverityIcon(severity)} <b>${escapeHtml(title)}</b>`,
      `<b>Scope:</b> <code>${escapeHtml(params.context.scope)}</code>`,
      `<b>Severity:</b> <code>${escapeHtml(severity)}</code>`,
      `<b>Time:</b> <code>${escapeHtml(timestamp)}</code>`,
      `<b>Error:</b> <code>${escapeHtml(error.name)}</code> ${escapeHtml(
        truncate(error.message, MAX_FIELD_LENGTH),
      )}`,
      `<b>Update:</b> <code>${escapeHtml(String(params.context.updateId ?? 'n/a'))}</code>`,
      `<b>Chat:</b> <code>${escapeHtml(String(params.context.chatId ?? 'n/a'))}</code>${
        params.context.chatType ? ` (${escapeHtml(params.context.chatType)})` : ''
      }`,
      `<b>Actor:</b> ${escapeHtml(formatActor(params.context.actor))}`,
    ];

    if (params.context.ticketNumber) {
      sections.push(
        `<b>Support ticket:</b> <code>${escapeHtml(params.context.ticketNumber)}</code>`,
      );
    }

    if (userMessage) {
      sections.push(`<b>User message:</b>\n<blockquote>${escapeHtml(userMessage)}</blockquote>`);
    }

    if (metadata) {
      sections.push(`<b>Details:</b>\n${metadata}`);
    }

    if (stack) {
      sections.push(`<b>Stack:</b>\n<pre>${escapeHtml(stack)}</pre>`);
    }

    return truncate(sections.join('\n\n'), MAX_TELEGRAM_MESSAGE_LENGTH);
  }

  private static buildUserBlockedMessage(params: {
    error: unknown;
    context: ErrorNotificationContext;
  }): string {
    const timestamp = new Date().toISOString();
    const metadata = formatMetadata(params.context.metadata);

    const sections = [
      'ℹ️ <b>Telegram xabari yuborilmadi</b>',
      'Foydalanuvchi botni bloklagan, shuning uchun avtomatik javob yuborilmadi. Adminlardan hech qanday harakat talab qilinmaydi.',
      `<b>Vaqt:</b> <code>${escapeHtml(timestamp)}</code>`,
      `<b>Sabab:</b> <code>${escapeHtml(formatUserBlockedReason(params.error))}</code>`,
      `<b>Update:</b> <code>${escapeHtml(String(params.context.updateId ?? 'n/a'))}</code>`,
      `<b>Chat:</b> <code>${escapeHtml(String(params.context.chatId ?? 'n/a'))}</code>${
        params.context.chatType ? ` (${escapeHtml(params.context.chatType)})` : ''
      }`,
      `<b>Foydalanuvchi:</b> ${escapeHtml(formatActor(params.context.actor))}`,
    ];

    if (params.context.userMessage) {
      const userMessage = truncate(
        params.context.userMessage.replace(/\s+/g, ' ').trim(),
        MAX_FIELD_LENGTH,
      );
      sections.push(`<b>Oxirgi xabar:</b>\n<blockquote>${escapeHtml(userMessage)}</blockquote>`);
    }

    if (metadata) {
      sections.push(`<b>Tafsilotlar:</b>\n${metadata}`);
    }

    return truncate(sections.join('\n\n'), MAX_TELEGRAM_MESSAGE_LENGTH);
  }

  static async notify(params: {
    api: Api<RawApi>;
    error: unknown;
    context: ErrorNotificationContext;
  }): Promise<void> {
    const chatId = getNotificationChatId();
    if (!chatId) {
      logger.warn('[ERROR_NOTIFICATION] Skipped error alert because no notification chat is configured.');
      return;
    }

    try {
      await sendToNotificationChat(
        params.api,
        this.buildMessage({
          error: params.error,
          context: params.context,
        }),
      );
    } catch (notificationError) {
      logger.error('[ERROR_NOTIFICATION] Failed to send error alert', notificationError);
    }
  }

  static async notifyBotError(params: {
    api: Api<RawApi>;
    ctx: BotContext;
    error: unknown;
  }): Promise<void> {
    await this.notify({
      api: params.api,
      error: params.error,
      context: {
        scope: 'telegram_update',
        severity: 'error',
        title: 'Telegram bot handler error',
        updateId: params.ctx.update.update_id,
        chatId: params.ctx.chat?.id ?? null,
        chatType: params.ctx.chat?.type ?? null,
        actor: {
          telegramId: params.ctx.from?.id ?? null,
          username: params.ctx.from?.username ?? null,
          firstName: params.ctx.from?.first_name ?? null,
          lastName: params.ctx.from?.last_name ?? null,
          languageCode: params.ctx.from?.language_code ?? null,
        },
        userMessage:
          params.ctx.message?.text ||
          params.ctx.message?.caption ||
          params.ctx.callbackQuery?.data ||
          null,
        metadata: {
          updateType: Object.keys(params.ctx.update)
            .filter((key) => key !== 'update_id')
            .join(', ') || 'unknown',
        },
      },
    });
  }
}
