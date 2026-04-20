import { SupportTicket, SupportTicketMessage } from '../../types/support.types';
import { escapeHtml } from '../telegram/telegram-rich-text.util';
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
  const safeText = text
    ? escapeHtml(text).replace(/\n/g, '<br />')
    : `<span class="muted" ${renderLocalizedAttributes({
        uz: TRANSCRIPT_COPY.uz.other.noText,
        ru: TRANSCRIPT_COPY.ru.other.noText,
      })}>${escapeHtml(TRANSCRIPT_COPY[locale].other.noText)}</span>`;
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
    <style>
      :root {
        color-scheme: light;
        --page-bg: #eff4f8;
        --panel-bg: rgba(255, 255, 255, 0.92);
        --panel-border: rgba(120, 144, 156, 0.22);
        --panel-muted: #f7fafc;
        --text: #142331;
        --muted: #607080;
        --line: rgba(20, 35, 49, 0.1);
        --shadow: 0 22px 60px rgba(16, 36, 54, 0.12);
        --hero-start: #11344d;
        --hero-end: #1d6a67;
        --user-bg: #e8f1ff;
        --user-border: #bfd5fb;
        --agent-bg: #effbea;
        --agent-border: #cdeac7;
        --admin-bg: #fff3df;
        --admin-border: #f2d7a4;
        --system-bg: #f3f5f8;
        --system-border: #d5dde5;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        padding: 28px 18px 40px;
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(17, 52, 77, 0.12), transparent 30%),
          radial-gradient(circle at right 10%, rgba(29, 106, 103, 0.12), transparent 24%),
          linear-gradient(180deg, #f7fafc 0%, var(--page-bg) 100%);
      }

      .page {
        max-width: 1180px;
        margin: 0 auto;
      }

      .hero {
        position: relative;
        overflow: hidden;
        padding: 28px 30px;
        border-radius: 30px;
        background: linear-gradient(135deg, var(--hero-start) 0%, var(--hero-end) 100%);
        color: #fff;
        box-shadow: var(--shadow);
      }

      .hero::after {
        content: "";
        position: absolute;
        inset: auto -80px -120px auto;
        width: 240px;
        height: 240px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.08);
        filter: blur(6px);
      }

      .hero-top {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }

      .hero-copy {
        max-width: 760px;
      }

      .hero h1 {
        margin: 0 0 10px;
        font-size: 32px;
        line-height: 1.08;
      }

      .hero p {
        margin: 0;
        font-size: 15px;
        line-height: 1.65;
        color: rgba(255, 255, 255, 0.88);
      }

      .locale-switcher {
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-width: 210px;
        padding: 16px;
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.12);
        border: 1px solid rgba(255, 255, 255, 0.14);
        backdrop-filter: blur(10px);
      }

      .locale-switcher-label {
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.72);
      }

      .locale-buttons {
        display: flex;
        gap: 8px;
      }

      .locale-button {
        flex: 1;
        border: 0;
        border-radius: 999px;
        padding: 10px 14px;
        font: inherit;
        font-size: 14px;
        cursor: pointer;
        color: #fff;
        background: rgba(255, 255, 255, 0.12);
        transition: transform 140ms ease, background 140ms ease, box-shadow 140ms ease;
      }

      .locale-button:hover {
        transform: translateY(-1px);
        background: rgba(255, 255, 255, 0.18);
      }

      .locale-button.is-active {
        background: #ffffff;
        color: #163247;
        box-shadow: 0 8px 18px rgba(16, 36, 54, 0.16);
      }

      .hero-badges {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        margin-top: 22px;
      }

      .hero-badge {
        padding: 14px 16px;
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.12);
      }

      .hero-badge-label {
        display: block;
        margin-bottom: 6px;
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.68);
      }

      .hero-badge-value {
        font-size: 16px;
        font-weight: 700;
      }

      .hero-note {
        margin-top: 16px;
        font-size: 14px;
        line-height: 1.6;
        color: rgba(255, 255, 255, 0.88);
      }

      .section {
        margin-top: 22px;
        border-radius: 28px;
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        box-shadow: var(--shadow);
        overflow: hidden;
        backdrop-filter: blur(10px);
      }

      .section-header {
        padding: 24px 26px 12px;
      }

      .section-header h2 {
        margin: 0;
        font-size: 22px;
      }

      .section-header p {
        margin: 8px 0 0;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.6;
      }

      .metadata-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 14px;
        padding: 0 26px 26px;
      }

      .meta-card {
        padding: 16px 18px;
        border-radius: 20px;
        background: var(--panel-muted);
        border: 1px solid rgba(120, 144, 156, 0.16);
      }

      .meta-card .label {
        display: block;
        margin-bottom: 8px;
        color: var(--muted);
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .meta-card .value {
        font-size: 15px;
        line-height: 1.6;
        word-break: break-word;
      }

      .chat-shell {
        position: relative;
        padding: 8px 26px 28px;
        background:
          linear-gradient(180deg, rgba(247, 250, 252, 0.8) 0%, rgba(255, 255, 255, 0.65) 100%);
      }

      .chat-shell::before {
        content: "";
        position: absolute;
        left: 50%;
        top: 8px;
        bottom: 28px;
        width: 1px;
        background: linear-gradient(180deg, transparent 0%, var(--line) 12%, var(--line) 88%, transparent 100%);
        transform: translateX(-50%);
      }

      .alignment-guide {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
        margin: 0 0 18px;
      }

      .guide-pill {
        padding: 10px 12px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 600;
        text-align: center;
        border: 1px solid transparent;
      }

      .guide-pill.user {
        background: var(--user-bg);
        border-color: var(--user-border);
      }

      .guide-pill.agent {
        background: var(--agent-bg);
        border-color: var(--agent-border);
      }

      .guide-pill.system {
        background: var(--system-bg);
        border-color: var(--system-border);
      }

      .message {
        position: relative;
        display: flex;
        flex-direction: column;
        width: fit-content;
        max-width: min(72%, 820px);
        margin: 16px 0;
        gap: 8px;
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
        max-width: min(58%, 720px);
        align-items: center;
      }

      .message-meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
        font-size: 12px;
        color: var(--muted);
      }

      .message.system .message-meta {
        justify-content: center;
      }

      .sender {
        font-weight: 700;
        color: var(--text);
      }

      .sequence {
        opacity: 0.82;
      }

      .bubble {
        border-radius: 24px;
        padding: 16px 18px;
        border: 1px solid transparent;
        line-height: 1.7;
        word-break: break-word;
        box-shadow: 0 10px 24px rgba(16, 36, 54, 0.05);
      }

      .message.user .bubble {
        background: var(--user-bg);
        border-color: var(--user-border);
        border-bottom-right-radius: 10px;
      }

      .message.agent .bubble {
        background: var(--agent-bg);
        border-color: var(--agent-border);
        border-bottom-left-radius: 10px;
      }

      .message.admin .bubble {
        background: var(--admin-bg);
        border-color: var(--admin-border);
        border-bottom-left-radius: 10px;
      }

      .message.system .bubble {
        background: var(--system-bg);
        border-color: var(--system-border);
        border-radius: 18px;
        text-align: center;
      }

      .body {
        font-size: 15px;
      }

      .attachment {
        margin-top: 14px;
        padding-top: 12px;
        border-top: 1px dashed rgba(20, 35, 49, 0.16);
        font-size: 13px;
        color: var(--muted);
      }

      code {
        font-family: "Cascadia Code", Consolas, monospace;
        font-size: 12px;
        background: rgba(20, 35, 49, 0.06);
        padding: 2px 6px;
        border-radius: 8px;
      }

      .muted {
        color: var(--muted);
      }

      .empty-state {
        padding: 22px;
        border-radius: 20px;
        border: 1px dashed rgba(120, 144, 156, 0.34);
        background: #f8fbfd;
        color: var(--muted);
        text-align: center;
      }

      @media (max-width: 860px) {
        .hero-top {
          flex-direction: column;
          align-items: stretch;
        }

        .locale-switcher {
          min-width: 0;
        }

        .chat-shell::before {
          display: none;
        }

        .alignment-guide {
          grid-template-columns: 1fr;
        }

        .message,
        .message.system {
          max-width: 100%;
        }
      }

      @media (max-width: 640px) {
        body {
          padding: 18px 12px 28px;
        }

        .hero,
        .section {
          border-radius: 22px;
        }

        .hero {
          padding: 22px 18px;
        }

        .hero h1 {
          font-size: 26px;
        }

        .section-header,
        .metadata-grid,
        .chat-shell {
          padding-left: 16px;
          padding-right: 16px;
        }

        .hero-badges {
          grid-template-columns: 1fr 1fr;
        }

        .message.user,
        .message.agent,
        .message.admin,
        .message.system {
          max-width: 100%;
        }

        .message.user {
          align-items: flex-end;
        }

        .message.agent,
        .message.admin {
          align-items: flex-start;
        }

        .message.system {
          align-items: center;
        }

        .message-meta {
          gap: 8px;
        }

        .message.user .message-meta {
          justify-content: flex-end;
        }

        .message.agent .message-meta,
        .message.admin .message-meta,
        .message.system .message-meta {
          justify-content: flex-start;
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
      <section class="hero">
        <div class="hero-top">
          <div class="hero-copy">
            <h1 ${renderLocalizedAttributes({
              uz: `${TRANSCRIPT_COPY.uz.heroTitle} #${params.ticket.ticket_number}`,
              ru: `${TRANSCRIPT_COPY.ru.heroTitle} #${params.ticket.ticket_number}`,
            })}>${escapeHtml(`${copy.heroTitle} #${params.ticket.ticket_number}`)}</h1>
            <p ${renderLocalizedAttributes({
              uz: TRANSCRIPT_COPY.uz.heroDescription,
              ru: TRANSCRIPT_COPY.ru.heroDescription,
            })}>${escapeHtml(copy.heroDescription)}</p>
          </div>

          <div class="locale-switcher">
            <span class="locale-switcher-label" ${renderLocalizedAttributes({
              uz: TRANSCRIPT_COPY.uz.other.languageSwitcher,
              ru: TRANSCRIPT_COPY.ru.other.languageSwitcher,
            })}>${escapeHtml(copy.other.languageSwitcher)}</span>
            <div class="locale-buttons">
              <button type="button" class="locale-button${
                locale === 'uz' ? ' is-active' : ''
              }" data-locale-switch="uz">O'zbekcha</button>
              <button type="button" class="locale-button${
                locale === 'ru' ? ' is-active' : ''
              }" data-locale-switch="ru">Русский</button>
            </div>
          </div>
        </div>

        <div class="hero-badges">
          <div class="hero-badge">
            <span class="hero-badge-label" ${renderLocalizedAttributes({
              uz: TRANSCRIPT_COPY.uz.badges.messages,
              ru: TRANSCRIPT_COPY.ru.badges.messages,
            })}>${escapeHtml(copy.badges.messages)}</span>
            <span class="hero-badge-value">${params.messages.length}</span>
          </div>
          <div class="hero-badge">
            <span class="hero-badge-label" ${renderLocalizedAttributes({
              uz: TRANSCRIPT_COPY.uz.badges.handlingMode,
              ru: TRANSCRIPT_COPY.ru.badges.handlingMode,
            })}>${escapeHtml(copy.badges.handlingMode)}</span>
            <span class="hero-badge-value" ${renderLocalizedAttributes(localizedHandlingMode)}>${escapeHtml(
              localizedHandlingMode[locale],
            )}</span>
          </div>
          <div class="hero-badge">
            <span class="hero-badge-label" ${renderLocalizedAttributes({
              uz: TRANSCRIPT_COPY.uz.badges.status,
              ru: TRANSCRIPT_COPY.ru.badges.status,
            })}>${escapeHtml(copy.badges.status)}</span>
            <span class="hero-badge-value" ${renderLocalizedAttributes(localizedStatus)}>${escapeHtml(
              localizedStatus[locale],
            )}</span>
          </div>
          <div class="hero-badge">
            <span class="hero-badge-label" ${renderLocalizedAttributes({
              uz: TRANSCRIPT_COPY.uz.badges.generated,
              ru: TRANSCRIPT_COPY.ru.badges.generated,
            })}>${escapeHtml(copy.badges.generated)}</span>
            <span class="hero-badge-value">${escapeHtml(formatDateTime(generatedAt, locale))}</span>
          </div>
        </div>

        <p class="hero-note" ${renderLocalizedAttributes({
          uz: TRANSCRIPT_COPY.uz.timelineHint,
          ru: TRANSCRIPT_COPY.ru.timelineHint,
        })}>${escapeHtml(copy.timelineHint)}</p>
      </section>

      <section class="section">
        <div class="section-header">
          <h2 ${renderLocalizedAttributes({
            uz: TRANSCRIPT_COPY.uz.sections.overviewTitle,
            ru: TRANSCRIPT_COPY.ru.sections.overviewTitle,
          })}>${escapeHtml(copy.sections.overviewTitle)}</h2>
          <p ${renderLocalizedAttributes({
            uz: TRANSCRIPT_COPY.uz.sections.overviewDescription,
            ru: TRANSCRIPT_COPY.ru.sections.overviewDescription,
          })}>${escapeHtml(copy.sections.overviewDescription)}</p>
        </div>

        <div class="metadata-grid">
          <div class="meta-card">
            <span class="label" ${renderLocalizedAttributes({
              uz: TRANSCRIPT_COPY.uz.metadata.customer,
              ru: TRANSCRIPT_COPY.ru.metadata.customer,
            })}>${escapeHtml(copy.metadata.customer)}</span>
            <div class="value">${renderMetadataValue(userFullName)}</div>
          </div>
          <div class="meta-card">
            <span class="label" ${renderLocalizedAttributes({
              uz: TRANSCRIPT_COPY.uz.metadata.phone,
              ru: TRANSCRIPT_COPY.ru.metadata.phone,
            })}>${escapeHtml(copy.metadata.phone)}</span>
            <div class="value">${renderMetadataValue(formatUzPhone(params.user.phone_number))}</div>
          </div>
          <div class="meta-card">
            <span class="label" ${renderLocalizedAttributes({
              uz: TRANSCRIPT_COPY.uz.metadata.telegram,
              ru: TRANSCRIPT_COPY.ru.metadata.telegram,
            })}>${escapeHtml(copy.metadata.telegram)}</span>
            <div class="value">${renderMetadataValue(`${username} (ID: ${params.user.telegram_id})`)}</div>
          </div>
          <div class="meta-card">
            <span class="label" ${renderLocalizedAttributes({
              uz: TRANSCRIPT_COPY.uz.metadata.sapCode,
              ru: TRANSCRIPT_COPY.ru.metadata.sapCode,
            })}>${escapeHtml(copy.metadata.sapCode)}</span>
            <div class="value">${renderMetadataValue(params.user.sap_card_code || '')}</div>
          </div>
          <div class="meta-card">
            <span class="label" ${renderLocalizedAttributes({
              uz: TRANSCRIPT_COPY.uz.metadata.language,
              ru: TRANSCRIPT_COPY.ru.metadata.language,
            })}>${escapeHtml(copy.metadata.language)}</span>
            <div class="value" ${renderLocalizedAttributes(localizedUserLanguage)}>${escapeHtml(
              localizedUserLanguage[locale],
            )}</div>
          </div>
          <div class="meta-card">
            <span class="label" ${renderLocalizedAttributes({
              uz: TRANSCRIPT_COPY.uz.metadata.ticketCreated,
              ru: TRANSCRIPT_COPY.ru.metadata.ticketCreated,
            })}>${escapeHtml(copy.metadata.ticketCreated)}</span>
            <div class="value">${renderMetadataValue(
              formatDateTime(params.ticket.created_at, locale),
            )}</div>
          </div>
          <div class="meta-card">
            <span class="label" ${renderLocalizedAttributes({
              uz: TRANSCRIPT_COPY.uz.metadata.lastUpdated,
              ru: TRANSCRIPT_COPY.ru.metadata.lastUpdated,
            })}>${escapeHtml(copy.metadata.lastUpdated)}</span>
            <div class="value">${renderMetadataValue(
              formatDateTime(params.ticket.updated_at, locale),
            )}</div>
          </div>
          <div class="meta-card">
            <span class="label" ${renderLocalizedAttributes({
              uz: TRANSCRIPT_COPY.uz.metadata.matchedFaq,
              ru: TRANSCRIPT_COPY.ru.metadata.matchedFaq,
            })}>${escapeHtml(copy.metadata.matchedFaq)}</span>
            <div class="value">${renderMetadataValue(
              params.ticket.matched_faq_id ? String(params.ticket.matched_faq_id) : '',
            )}</div>
          </div>
          <div class="meta-card">
            <span class="label" ${renderLocalizedAttributes({
              uz: TRANSCRIPT_COPY.uz.metadata.agentToken,
              ru: TRANSCRIPT_COPY.ru.metadata.agentToken,
            })}>${escapeHtml(copy.metadata.agentToken)}</span>
            <div class="value">${renderMetadataValue(params.ticket.agent_token || '')}</div>
          </div>
          <div class="meta-card">
            <span class="label" ${renderLocalizedAttributes({
              uz: TRANSCRIPT_COPY.uz.metadata.escalationReason,
              ru: TRANSCRIPT_COPY.ru.metadata.escalationReason,
            })}>${escapeHtml(copy.metadata.escalationReason)}</span>
            <div class="value">${renderMetadataValue(params.ticket.agent_escalation_reason || '')}</div>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section-header">
          <h2 ${renderLocalizedAttributes({
            uz: TRANSCRIPT_COPY.uz.sections.timelineTitle,
            ru: TRANSCRIPT_COPY.ru.sections.timelineTitle,
          })}>${escapeHtml(copy.sections.timelineTitle)}</h2>
          <p ${renderLocalizedAttributes({
            uz: TRANSCRIPT_COPY.uz.sections.timelineDescription,
            ru: TRANSCRIPT_COPY.ru.sections.timelineDescription,
          })}>${escapeHtml(copy.sections.timelineDescription)}</p>
        </div>

        <div class="chat-shell">
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

          ${messagesHtml}
        </div>
      </section>
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
