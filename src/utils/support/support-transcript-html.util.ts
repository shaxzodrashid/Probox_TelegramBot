import { SupportTicket, SupportTicketMessage } from '../../types/support.types';
import { escapeHtml, richTextToTelegramHtml, richTextToTelegramRichHtml } from '../telegram/telegram-rich-text.util';
import { formatUzPhone } from '../uz-phone.util';

export interface SupportTranscriptUserSnapshot {
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  telegram_id: number;
  username?: string;
  sap_card_code?: string;
  language_code: string;
}

interface BuildSupportTranscriptHtmlParams {
  ticket: SupportTicket;
  user: SupportTranscriptUserSnapshot;
  messages: SupportTicketMessage[];
  generatedAt?: Date;
}

type TranscriptLocale = 'uz' | 'ru';

interface TranscriptCopy {
  pageTitle: string;
  heroTitle: string;
  heroDescription: string;
  timelineHint: string;
  badges: {
    messages: string;
    handlingMode: string;
    status: string;
    generated: string;
  };
  sections: {
    overviewTitle: string;
    overviewDescription: string;
    timelineTitle: string;
    timelineDescription: string;
  };
  metadata: {
    customer: string;
    phone: string;
    telegram: string;
    sapCode: string;
    language: string;
    ticketCreated: string;
    lastUpdated: string;
    matchedFaq: string;
    agentToken: string;
    escalationReason: string;
  };
  roles: {
    user: string;
    agent: string;
    admin: string;
    system: string;
  };
  roleHints: {
    user: string;
    agent: string;
    system: string;
  };
  other: {
    languageSwitcher: string;
    noText: string;
    photoAttached: string;
    emptyState: string;
    unknownUser: string;
  };
  values: {
    handlingModeHuman: string;
    handlingModeAgent: string;
    statusOpen: string;
    statusClosed: string;
    statusReplied: string;
    languageUz: string;
    languageRu: string;
  };
}

const TRANSCRIPT_COPY: Record<TranscriptLocale, TranscriptCopy> = {
  uz: {
    pageTitle: 'Murojaat transkripti',
    heroTitle: 'Qo‘llab-quvvatlash murojaati transkripti',
    heroDescription:
      'Adminlar uchun to‘liq chat tarixi. Sahifada foydalanuvchi xabarlari o‘ngda, agent chapda, tizim xabarlari esa markazda ko‘rsatiladi.',
    timelineHint:
      'Tildagi yorliqlarni shu yerning o‘zida almashtirishingiz mumkin. Xabar matnlari esa asl ko‘rinishida saqlanadi.',
    badges: {
      messages: 'Xabarlar',
      handlingMode: 'Ishlash rejimi',
      status: 'Holat',
      generated: 'Yaratilgan vaqti',
    },
    sections: {
      overviewTitle: 'Murojaat haqida',
      overviewDescription:
        'Batafsil yozishmaga o‘tishdan oldin operator uchun eng kerakli ma’lumotlar.',
      timelineTitle: 'Yozishma tarixi',
      timelineDescription:
        'Mazkur ticket bo‘yicha saqlangan barcha xabarlarning ketma-ket ko‘rinishi.',
    },
    metadata: {
      customer: 'Foydalanuvchi',
      phone: 'Telefon',
      telegram: 'Telegram',
      sapCode: 'SAP kodi',
      language: 'Til',
      ticketCreated: 'Murojaat yaratilgan',
      lastUpdated: 'Oxirgi yangilanish',
      matchedFaq: 'Mos FAQ',
      agentToken: 'Agent token',
      escalationReason: 'Operatorga yo‘naltirish sababi',
    },
    roles: {
      user: 'Foydalanuvchi',
      agent: 'AI agent',
      admin: 'Admin',
      system: 'Tizim',
    },
    roleHints: {
      user: 'Foydalanuvchi xabari',
      agent: 'Agent javobi',
      system: 'Tizim hodisasi',
    },
    other: {
      languageSwitcher: 'Sahifa tili',
      noText: 'Matn mavjud emas',
      photoAttached: 'Rasm biriktirilgan',
      emptyState: 'Ushbu ticket uchun saqlangan transkript xabarlari topilmadi.',
      unknownUser: 'Noma’lum foydalanuvchi',
    },
    values: {
      handlingModeHuman: 'Operator',
      handlingModeAgent: 'AI agent',
      statusOpen: 'Ochiq',
      statusClosed: 'Yopilgan',
      statusReplied: 'Javob berilgan',
      languageUz: "O'zbekcha",
      languageRu: 'Русский',
    },
  },
  ru: {
    pageTitle: 'Транскрипт обращения',
    heroTitle: 'Транскрипт обращения в поддержку',
    heroDescription:
      'Полная история чата для администраторов. Сообщения пользователя показаны справа, агента слева, а системные сообщения по центру.',
    timelineHint:
      'Язык подписей можно переключать прямо на странице. Текст самих сообщений сохраняется в исходном виде.',
    badges: {
      messages: 'Сообщения',
      handlingMode: 'Режим обработки',
      status: 'Статус',
      generated: 'Сформировано',
    },
    sections: {
      overviewTitle: 'Сводка по обращению',
      overviewDescription:
        'Самая важная информация для оператора перед просмотром полной переписки.',
      timelineTitle: 'История переписки',
      timelineDescription: 'Хронологический вид всех сохранённых сообщений по этому обращению.',
    },
    metadata: {
      customer: 'Пользователь',
      phone: 'Телефон',
      telegram: 'Telegram',
      sapCode: 'SAP код',
      language: 'Язык',
      ticketCreated: 'Создано',
      lastUpdated: 'Последнее обновление',
      matchedFaq: 'Связанный FAQ',
      agentToken: 'Токен агента',
      escalationReason: 'Причина передачи оператору',
    },
    roles: {
      user: 'Пользователь',
      agent: 'AI агент',
      admin: 'Администратор',
      system: 'Система',
    },
    roleHints: {
      user: 'Сообщение пользователя',
      agent: 'Ответ агента',
      system: 'Системное событие',
    },
    other: {
      languageSwitcher: 'Язык страницы',
      noText: 'Текст отсутствует',
      photoAttached: 'Прикреплено фото',
      emptyState: 'Для этого обращения не найдено сохранённых сообщений транскрипта.',
      unknownUser: 'Неизвестный пользователь',
    },
    values: {
      handlingModeHuman: 'Оператор',
      handlingModeAgent: 'AI агент',
      statusOpen: 'Открыт',
      statusClosed: 'Закрыт',
      statusReplied: 'Отвечен',
      languageUz: "O'zbekcha",
      languageRu: 'Русский',
    },
  },
};

const normalizeTranscriptLocale = (languageCode?: string | null): TranscriptLocale =>
  languageCode === 'ru' ? 'ru' : 'uz';

const renderLocalizedAttributes = (value: Record<TranscriptLocale, string>): string =>
  `data-i18n-uz="${escapeHtml(value.uz)}" data-i18n-ru="${escapeHtml(value.ru)}"`;

const formatDateTime = (
  value: Date | string | undefined | null,
  locale: TranscriptLocale = 'uz',
): string => {
  if (!value) {
    return '-';
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString(locale === 'ru' ? 'ru-RU' : 'uz-UZ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const buildUserFullName = (
  user: SupportTranscriptUserSnapshot,
  locale: TranscriptLocale,
): string => {
  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
  return fullName || TRANSCRIPT_COPY[locale].other.unknownUser;
};

const sanitizeFileName = (ticketNumber: string): string =>
  `support-ticket-${ticketNumber}`
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .concat('-transcript.html');

const renderMetadataValue = (value: string): string => {
  if (!value.trim()) {
    return '<span class="muted">-</span>';
  }

  return escapeHtml(value);
};

const localizeHandlingMode = (
  handlingMode: SupportTicket['handling_mode'],
): Record<TranscriptLocale, string> => ({
  uz:
    handlingMode === 'agent'
      ? TRANSCRIPT_COPY.uz.values.handlingModeAgent
      : TRANSCRIPT_COPY.uz.values.handlingModeHuman,
  ru:
    handlingMode === 'agent'
      ? TRANSCRIPT_COPY.ru.values.handlingModeAgent
      : TRANSCRIPT_COPY.ru.values.handlingModeHuman,
});

const localizeTicketStatus = (
  status: SupportTicket['status'],
): Record<TranscriptLocale, string> => {
  if (status === 'closed') {
    return {
      uz: TRANSCRIPT_COPY.uz.values.statusClosed,
      ru: TRANSCRIPT_COPY.ru.values.statusClosed,
    };
  }

  if (status === 'replied') {
    return {
      uz: TRANSCRIPT_COPY.uz.values.statusReplied,
      ru: TRANSCRIPT_COPY.ru.values.statusReplied,
    };
  }

  return {
    uz: TRANSCRIPT_COPY.uz.values.statusOpen,
    ru: TRANSCRIPT_COPY.ru.values.statusOpen,
  };
};

const localizeLanguageValue = (languageCode: string): Record<TranscriptLocale, string> => ({
  uz:
    normalizeTranscriptLocale(languageCode) === 'ru'
      ? TRANSCRIPT_COPY.uz.values.languageRu
      : TRANSCRIPT_COPY.uz.values.languageUz,
  ru:
    normalizeTranscriptLocale(languageCode) === 'ru'
      ? TRANSCRIPT_COPY.ru.values.languageRu
      : TRANSCRIPT_COPY.ru.values.languageUz,
});

const getSenderPresentation = (
  senderType: SupportTicketMessage['sender_type'],
): { className: string; labels: Record<TranscriptLocale, string> } => {
  switch (senderType) {
    case 'agent':
      return {
        className: 'agent',
        labels: {
          uz: TRANSCRIPT_COPY.uz.roles.agent,
          ru: TRANSCRIPT_COPY.ru.roles.agent,
        },
      };
    case 'admin':
      return {
        className: 'admin',
        labels: {
          uz: TRANSCRIPT_COPY.uz.roles.admin,
          ru: TRANSCRIPT_COPY.ru.roles.admin,
        },
      };
    case 'system':
      return {
        className: 'system',
        labels: {
          uz: TRANSCRIPT_COPY.uz.roles.system,
          ru: TRANSCRIPT_COPY.ru.roles.system,
        },
      };
    default:
      return {
        className: 'user',
        labels: {
          uz: TRANSCRIPT_COPY.uz.roles.user,
          ru: TRANSCRIPT_COPY.ru.roles.user,
        },
      };
  }
};

const renderMessageBubble = (
  message: SupportTicketMessage,
  index: number,
  locale: TranscriptLocale,
): string => {
  const sender = getSenderPresentation(message.sender_type);
  const hasPhoto = Boolean(message.photo_file_id);
  const text = message.message_text?.trim() || '';

  let safeText = '';
  if (!text) {
    safeText = `<span class="muted" ${renderLocalizedAttributes({
      uz: TRANSCRIPT_COPY.uz.other.noText,
      ru: TRANSCRIPT_COPY.ru.other.noText,
    })}>${escapeHtml(TRANSCRIPT_COPY[locale].other.noText)}</span>`;
  } else if (message.sender_type === 'agent') {
    safeText = richTextToTelegramRichHtml(text);
  } else {
    const renderedText =
      message.sender_type === 'admin'
        ? richTextToTelegramHtml(text)
        : escapeHtml(text);
    safeText = renderedText.replace(/\n/g, '<br />');
  }

  const photoBadge = hasPhoto
    ? `<div class="attachment"><span ${renderLocalizedAttributes({
        uz: TRANSCRIPT_COPY.uz.other.photoAttached,
        ru: TRANSCRIPT_COPY.ru.other.photoAttached,
      })}>${escapeHtml(TRANSCRIPT_COPY[locale].other.photoAttached)}</span>${
        message.photo_file_id ? ` <code>${escapeHtml(message.photo_file_id)}</code>` : ''
      }</div>`
    : '';

  return `<article class="message ${sender.className}">
    <div class="message-meta">
      <span class="sender" ${renderLocalizedAttributes(sender.labels)}>${escapeHtml(
        sender.labels[locale],
      )}</span>
      <span class="timestamp">${escapeHtml(formatDateTime(message.created_at, locale))}</span>
      <span class="sequence">#${index + 1}</span>
    </div>
    <div class="bubble">
      <div class="body">${safeText}</div>
      ${photoBadge}
    </div>
  </article>`;
};

export const buildSupportTranscriptHtmlExport = (
  params: BuildSupportTranscriptHtmlParams,
): { buffer: Buffer; fileName: string } => {
  const locale = normalizeTranscriptLocale(params.user.language_code);
  const copy = TRANSCRIPT_COPY[locale];
  const generatedAt = params.generatedAt || new Date();
  const userFullName = buildUserFullName(params.user, locale);
  const username = params.user.username ? `@${params.user.username}` : '-';
  const localizedHandlingMode = localizeHandlingMode(params.ticket.handling_mode);
  const localizedStatus = localizeTicketStatus(params.ticket.status);
  const localizedUserLanguage = localizeLanguageValue(params.user.language_code);
  const messagesHtml = params.messages.length
    ? params.messages
        .map((message, index) => renderMessageBubble(message, index, locale))
        .join('\n')
    : `<div class="empty-state" ${renderLocalizedAttributes({
        uz: TRANSCRIPT_COPY.uz.other.emptyState,
        ru: TRANSCRIPT_COPY.ru.other.emptyState,
      })}>${escapeHtml(copy.other.emptyState)}</div>`;

  const html = `<!DOCTYPE html>
<html lang="${locale}" data-locale="${locale}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(`${copy.pageTitle} #${params.ticket.ticket_number}`)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      :root {
        --font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        --bg-page: #f8fafc;
        --bg-card: #ffffff;
        --bg-sidebar: #ffffff;
        --border-color: #e2e8f0;
        
        --text-main: #0f172a;
        --text-muted: #64748b;
        
        --bg-msg-user: #f1f5f9;
        --border-msg-user: #e2e8f0;
        --text-msg-user: #0f172a;
        
        --bg-msg-agent: #f0fdf4;
        --border-msg-agent: #bbf7d0;
        --text-msg-agent: #166534;
        
        --bg-msg-admin: #fffbeb;
        --border-msg-admin: #fde68a;
        --text-msg-admin: #92400e;
        
        --bg-msg-system: #f1f5f9;
        --border-msg-system: #cbd5e1;
        --text-msg-system: #475569;
        
        --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
        --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        padding: 0;
        font-family: var(--font-family);
        background-color: var(--bg-page);
        color: var(--text-main);
        -webkit-font-smoothing: antialiased;
      }

      .page {
        display: flex;
        min-height: 100vh;
        max-width: 1440px;
        margin: 0 auto;
      }

      .sidebar {
        width: 360px;
        background-color: var(--bg-sidebar);
        border-right: 1px solid var(--border-color);
        padding: 32px 24px;
        display: flex;
        flex-direction: column;
        gap: 24px;
        position: sticky;
        top: 0;
        height: 100vh;
        overflow-y: auto;
      }

      .sidebar-header h1 {
        font-size: 20px;
        font-weight: 700;
        margin: 0 0 12px 0;
        color: var(--text-main);
        line-height: 1.2;
      }

      .status-badge-container {
        display: flex;
        margin-bottom: 8px;
      }

      .status-badge {
        display: inline-flex;
        align-items: center;
        padding: 4px 12px;
        border-radius: 9999px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .status-badge.open {
        background-color: #dcfce7;
        color: #15803d;
      }

      .status-badge.closed {
        background-color: #f1f5f9;
        color: #475569;
      }

      .status-badge.replied {
        background-color: #dbeafe;
        color: #1d4ed8;
      }

      .meta-card {
        background-color: #ffffff;
        border: 1px solid var(--border-color);
        border-radius: 12px;
        padding: 20px;
        box-shadow: var(--shadow-sm);
      }

      .meta-card-title {
        font-size: 14px;
        font-weight: 700;
        margin: 0 0 16px 0;
        color: var(--text-main);
        border-bottom: 1px solid #f1f5f9;
        padding-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .meta-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-bottom: 14px;
      }

      .meta-field:last-child {
        margin-bottom: 0;
      }

      .meta-label {
        font-size: 10px;
        font-weight: 600;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .meta-value {
        font-size: 14px;
        font-weight: 500;
        color: var(--text-main);
        word-break: break-all;
      }

      .reason-card {
        background-color: #fffbeb;
        border: 1px solid #fde68a;
        border-radius: 12px;
        padding: 16px;
        box-shadow: var(--shadow-sm);
        display: flex;
        gap: 12px;
        align-items: flex-start;
      }

      .reason-icon {
        font-size: 18px;
        flex-shrink: 0;
        line-height: 1;
      }

      .reason-content {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .reason-title {
        font-size: 11px;
        font-weight: 700;
        color: #92400e;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .reason-text {
        font-size: 13px;
        color: #78350f;
        line-height: 1.5;
        font-weight: 500;
      }

      .language-control {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: auto;
      }

      .language-label {
        font-size: 11px;
        font-weight: 600;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .segmented-control {
        display: flex;
        background-color: #f1f5f9;
        border-radius: 8px;
        padding: 4px;
        border: 1px solid var(--border-color);
      }

      .locale-button {
        flex: 1;
        border: none;
        background: none;
        padding: 8px 12px;
        font-family: inherit;
        font-size: 13px;
        font-weight: 600;
        border-radius: 6px;
        color: var(--text-muted);
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .locale-button:hover {
        color: var(--text-main);
      }

      .locale-button.is-active {
        background-color: #ffffff;
        color: var(--text-main);
        box-shadow: var(--shadow-sm);
      }

      .generated-info {
        font-size: 11px;
        color: var(--text-muted);
        padding-top: 16px;
        border-top: 1px solid var(--border-color);
        font-weight: 500;
      }

      .main-content {
        flex: 1;
        padding: 40px;
        display: flex;
        flex-direction: column;
        gap: 24px;
        overflow-y: auto;
        height: 100vh;
      }

      .timeline-header h2 {
        font-size: 22px;
        font-weight: 700;
        margin: 0 0 6px 0;
        color: var(--text-main);
      }

      .timeline-header p {
        font-size: 14px;
        color: var(--text-muted);
        margin: 0;
        line-height: 1.5;
      }

      .alignment-guide {
        display: flex;
        gap: 16px;
        margin-bottom: 12px;
        flex-wrap: wrap;
      }

      .guide-pill {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        font-weight: 600;
        color: var(--text-muted);
        padding: 6px 12px;
        border-radius: 9999px;
        border: 1px solid var(--border-color);
        background-color: #ffffff;
        box-shadow: var(--shadow-sm);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .guide-pill::before {
        content: "";
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }

      .guide-pill.user::before {
        background-color: #64748b;
      }

      .guide-pill.agent::before {
        background-color: #10b981;
      }

      .guide-pill.system::before {
        background-color: #f59e0b;
      }

      .chat-timeline {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .message {
        display: flex;
        flex-direction: column;
        width: 100%;
        max-width: 80%;
      }

      .message.user {
        margin-left: auto;
        align-items: flex-end;
      }

      .message.agent,
      .message.admin {
        margin-right: auto;
        align-items: flex-start;
      }

      .message.system {
        margin-left: auto;
        margin-right: auto;
        align-items: center;
        max-width: 90%;
      }

      .message-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        color: var(--text-muted);
        margin-bottom: 4px;
        padding: 0 4px;
        font-weight: 500;
      }

      .message-meta .sender {
        font-weight: 600;
        color: var(--text-main);
      }

      .message-meta .sequence {
        background-color: #e2e8f0;
        color: #475569;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 9px;
        font-weight: 700;
      }

      .bubble {
        border-radius: 16px;
        padding: 14px 18px;
        line-height: 1.6;
        font-size: 15px;
        box-shadow: var(--shadow-sm);
        position: relative;
        word-break: break-word;
      }

      .message.user .bubble {
        background-color: var(--bg-msg-user);
        border: 1px solid var(--border-msg-user);
        color: var(--text-msg-user);
        border-top-right-radius: 4px;
      }

      .message.agent .bubble {
        background-color: var(--bg-msg-agent);
        border: 1px solid var(--border-msg-agent);
        color: var(--text-msg-agent);
        border-top-left-radius: 4px;
      }

      .message.admin .bubble {
        background-color: var(--bg-msg-admin);
        border: 1px solid var(--border-msg-admin);
        color: var(--text-msg-admin);
        border-top-left-radius: 4px;
      }

      .message.system .bubble {
        background-color: #f8fafc;
        border: 1px solid var(--border-color);
        color: var(--text-msg-system);
        border-radius: 8px;
        padding: 8px 16px;
        font-size: 13px;
        text-align: center;
      }

      /* Rich text inside bubbles */
      .bubble p {
        margin: 0 0 10px 0;
      }
      .bubble p:last-child {
        margin-bottom: 0;
      }

      .bubble blockquote {
        margin: 12px 0;
        padding: 8px 16px;
        border-left: 4px solid #cbd5e1;
        background-color: rgba(0, 0, 0, 0.02);
        font-style: italic;
        border-radius: 0 8px 8px 0;
      }

      .bubble ul, .bubble ol {
        margin: 8px 0;
        padding-left: 24px;
      }

      .bubble li {
        margin-bottom: 4px;
      }

      .bubble code {
        font-family: "Cascadia Code", Consolas, monospace;
        font-size: 13px;
        background-color: rgba(0, 0, 0, 0.05);
        padding: 2px 6px;
        border-radius: 4px;
        color: inherit;
      }

      .bubble pre {
        margin: 12px 0;
        padding: 12px;
        background-color: rgba(0, 0, 0, 0.04);
        border-radius: 8px;
        overflow-x: auto;
        font-family: "Cascadia Code", Consolas, monospace;
        font-size: 13px;
      }

      /* Stunning table styles */
      .bubble table {
        width: 100%;
        border-collapse: collapse;
        margin: 16px 0;
        font-size: 13px;
        background-color: #ffffff;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: var(--shadow-sm);
        border: 1px solid var(--border-color);
      }

      .bubble th, .bubble td {
        padding: 10px 14px;
        border-bottom: 1px solid var(--border-color);
        text-align: left;
      }

      .bubble th {
        background-color: #f8fafc;
        font-weight: 700;
        color: var(--text-main);
        border-bottom: 2px solid var(--border-color);
        text-transform: uppercase;
        font-size: 10px;
        letter-spacing: 0.05em;
      }

      .bubble tr:last-child td {
        border-bottom: none;
      }

      .bubble tr:nth-child(even) {
        background-color: #f8fafc;
      }

      .attachment {
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px dashed var(--border-color);
        font-size: 12px;
        color: var(--text-muted);
      }

      .muted {
        color: var(--text-muted);
      }

      .empty-state {
        padding: 32px;
        border-radius: 12px;
        border: 1px dashed var(--border-color);
        background: #ffffff;
        color: var(--text-muted);
        text-align: center;
        font-size: 15px;
        box-shadow: var(--shadow-sm);
      }

      /* Custom scrollbars */
      ::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }
      ::-webkit-scrollbar-track {
        background: transparent;
      }
      ::-webkit-scrollbar-thumb {
        background: #cbd5e1;
        border-radius: 9999px;
      }
      ::-webkit-scrollbar-thumb:hover {
        background: #94a3b8;
      }

      @media (max-width: 1024px) {
        .page {
          flex-direction: column;
        }
        .sidebar {
          width: 100%;
          height: auto;
          position: relative;
          border-right: none;
          border-bottom: 1px solid var(--border-color);
          padding: 24px;
        }
        .main-content {
          padding: 24px 16px;
          height: auto;
          overflow-y: visible;
        }
        .message {
          max-width: 95%;
        }
      }
    </style>
  </head>
  <body data-page-title-uz="${escapeHtml(
    `${TRANSCRIPT_COPY.uz.pageTitle} #${params.ticket.ticket_number}`,
  )}" data-page-title-ru="${escapeHtml(
    `${TRANSCRIPT_COPY.ru.pageTitle} #${params.ticket.ticket_number}`,
  )}">
    <main class="page">
      <aside class="sidebar">
        <div class="sidebar-header">
          <h1 ${renderLocalizedAttributes({
            uz: `${TRANSCRIPT_COPY.uz.heroTitle} #${params.ticket.ticket_number}`,
            ru: `${TRANSCRIPT_COPY.ru.heroTitle} #${params.ticket.ticket_number}`,
          })}>${escapeHtml(`${copy.heroTitle} #${params.ticket.ticket_number}`)}</h1>
          
          <div class="status-badge-container">
            <span class="status-badge ${params.ticket.status.toLowerCase()}" ${renderLocalizedAttributes(localizedStatus)}>${escapeHtml(
              localizedStatus[locale],
            )}</span>
          </div>
        </div>

        <div class="meta-card">
          <div class="meta-card-title" ${renderLocalizedAttributes({
            uz: TRANSCRIPT_COPY.uz.sections.overviewTitle,
            ru: TRANSCRIPT_COPY.ru.sections.overviewTitle,
          })}>${escapeHtml(copy.sections.overviewTitle)}</div>
          
          <div class="meta-field">
            <span class="meta-label" ${renderLocalizedAttributes({
              uz: TRANSCRIPT_COPY.uz.metadata.customer,
              ru: TRANSCRIPT_COPY.ru.metadata.customer,
            })}>${escapeHtml(copy.metadata.customer)}</span>
            <div class="meta-value">${renderMetadataValue(userFullName)}</div>
          </div>
          <div class="meta-field">
            <span class="meta-label" ${renderLocalizedAttributes({
              uz: TRANSCRIPT_COPY.uz.metadata.phone,
              ru: TRANSCRIPT_COPY.ru.metadata.phone,
            })}>${escapeHtml(copy.metadata.phone)}</span>
            <div class="meta-value">${renderMetadataValue(formatUzPhone(params.user.phone_number))}</div>
          </div>
          <div class="meta-field">
            <span class="meta-label" ${renderLocalizedAttributes({
              uz: TRANSCRIPT_COPY.uz.metadata.telegram,
              ru: TRANSCRIPT_COPY.ru.metadata.telegram,
            })}>${escapeHtml(copy.metadata.telegram)}</span>
            <div class="meta-value">${renderMetadataValue(`${username} (ID: ${params.user.telegram_id})`)}</div>
          </div>
          <div class="meta-field">
            <span class="meta-label" ${renderLocalizedAttributes({
              uz: TRANSCRIPT_COPY.uz.metadata.sapCode,
              ru: TRANSCRIPT_COPY.ru.metadata.sapCode,
            })}>${escapeHtml(copy.metadata.sapCode)}</span>
            <div class="meta-value">${renderMetadataValue(params.user.sap_card_code || '')}</div>
          </div>
          <div class="meta-field">
            <span class="meta-label" ${renderLocalizedAttributes({
              uz: TRANSCRIPT_COPY.uz.metadata.language,
              ru: TRANSCRIPT_COPY.ru.metadata.language,
            })}>${escapeHtml(copy.metadata.language)}</span>
            <div class="meta-value" ${renderLocalizedAttributes(localizedUserLanguage)}>${escapeHtml(
              localizedUserLanguage[locale],
            )}</div>
          </div>
          <div class="meta-field">
            <span class="meta-label" ${renderLocalizedAttributes({
              uz: TRANSCRIPT_COPY.uz.metadata.ticketCreated,
              ru: TRANSCRIPT_COPY.ru.metadata.ticketCreated,
            })}>${escapeHtml(copy.metadata.ticketCreated)}</span>
            <div class="meta-value">${renderMetadataValue(
              formatDateTime(params.ticket.created_at, locale),
            )}</div>
          </div>
          <div class="meta-field">
            <span class="meta-label" ${renderLocalizedAttributes({
              uz: TRANSCRIPT_COPY.uz.metadata.lastUpdated,
              ru: TRANSCRIPT_COPY.ru.metadata.lastUpdated,
            })}>${escapeHtml(copy.metadata.lastUpdated)}</span>
            <div class="meta-value">${renderMetadataValue(
              formatDateTime(params.ticket.updated_at, locale),
            )}</div>
          </div>
          <div class="meta-field">
            <span class="meta-label" ${renderLocalizedAttributes({
              uz: TRANSCRIPT_COPY.uz.badges.handlingMode,
              ru: TRANSCRIPT_COPY.ru.badges.handlingMode,
            })}>${escapeHtml(copy.badges.handlingMode)}</span>
            <div class="meta-value" ${renderLocalizedAttributes(localizedHandlingMode)}>${escapeHtml(
              localizedHandlingMode[locale],
            )}</div>
          </div>
        </div>

        ${
          params.ticket.agent_escalation_reason
            ? `<div class="reason-card">
                <span class="reason-icon">⚠️</span>
                <div class="reason-content">
                  <span class="reason-title" ${renderLocalizedAttributes({
                    uz: TRANSCRIPT_COPY.uz.metadata.escalationReason,
                    ru: TRANSCRIPT_COPY.ru.metadata.escalationReason,
                  })}>${escapeHtml(copy.metadata.escalationReason)}</span>
                  <span class="reason-text">${escapeHtml(params.ticket.agent_escalation_reason)}</span>
                </div>
              </div>`
            : ''
        }

        <div class="language-control">
          <span class="language-label" ${renderLocalizedAttributes({
            uz: TRANSCRIPT_COPY.uz.other.languageSwitcher,
            ru: TRANSCRIPT_COPY.ru.other.languageSwitcher,
          })}>${escapeHtml(copy.other.languageSwitcher)}</span>
          <div class="segmented-control">
            <button type="button" class="locale-button${
              locale === 'uz' ? ' is-active' : ''
            }" data-locale-switch="uz">O'zbekcha</button>
            <button type="button" class="locale-button${
              locale === 'ru' ? ' is-active' : ''
            }" data-locale-switch="ru">Русский</button>
          </div>
        </div>

        <div class="generated-info">
          <span ${renderLocalizedAttributes({
            uz: TRANSCRIPT_COPY.uz.badges.generated,
            ru: TRANSCRIPT_COPY.ru.badges.generated,
          })}>${escapeHtml(copy.badges.generated)}</span>: ${escapeHtml(formatDateTime(generatedAt, locale))}
        </div>
      </aside>

      <div class="main-content">
        <div class="timeline-header">
          <h2 ${renderLocalizedAttributes({
            uz: TRANSCRIPT_COPY.uz.sections.timelineTitle,
            ru: TRANSCRIPT_COPY.ru.sections.timelineTitle,
          })}>${escapeHtml(copy.sections.timelineTitle)}</h2>
          <p ${renderLocalizedAttributes({
            uz: TRANSCRIPT_COPY.uz.sections.timelineDescription,
            ru: TRANSCRIPT_COPY.ru.sections.timelineDescription,
          })}>${escapeHtml(copy.sections.timelineDescription)}</p>
        </div>

        <div class="alignment-guide">
          <div class="guide-pill agent" ${renderLocalizedAttributes({
            uz: TRANSCRIPT_COPY.uz.roleHints.agent,
            ru: TRANSCRIPT_COPY.ru.roleHints.agent,
          })}>${escapeHtml(copy.roleHints.agent)}</div>
          <div class="guide-pill system" ${renderLocalizedAttributes({
            uz: TRANSCRIPT_COPY.uz.roleHints.system,
            ru: TRANSCRIPT_COPY.ru.roleHints.system,
          })}>${escapeHtml(copy.roleHints.system)}</div>
          <div class="guide-pill user" ${renderLocalizedAttributes({
            uz: TRANSCRIPT_COPY.uz.roleHints.user,
            ru: TRANSCRIPT_COPY.ru.roleHints.user,
          })}>${escapeHtml(copy.roleHints.user)}</div>
        </div>

        <div class="chat-timeline">
          ${messagesHtml}
        </div>
      </div>
    </main>

    <script>
      (function () {
        const root = document.documentElement;
        const body = document.body;
        const buttons = Array.from(document.querySelectorAll('[data-locale-switch]'));
        const localizedTextNodes = Array.from(
          document.querySelectorAll('[data-i18n-uz][data-i18n-ru]'),
        );

        const applyLocale = (locale) => {
          root.setAttribute('lang', locale);
          root.setAttribute('data-locale', locale);

          localizedTextNodes.forEach((node) => {
            const value = node.getAttribute('data-i18n-' + locale);
            if (value !== null) {
              node.textContent = value;
            }
          });

          const pageTitle = body.getAttribute('data-page-title-' + locale);
          if (pageTitle) {
            document.title = pageTitle;
          }

          buttons.forEach((button) => {
            button.classList.toggle('is-active', button.getAttribute('data-locale-switch') === locale);
          });
        };

        buttons.forEach((button) => {
          button.addEventListener('click', () => applyLocale(button.getAttribute('data-locale-switch') || 'uz'));
        });

        applyLocale(root.getAttribute('data-locale') || 'uz');
      })();
    </script>
  </body>
</html>`;

  return {
    buffer: Buffer.from(html, 'utf8'),
    fileName: sanitizeFileName(params.ticket.ticket_number),
  };
};
