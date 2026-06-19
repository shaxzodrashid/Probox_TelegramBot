import type { User } from '../../services/user.service';
import { formatDateTimeForLocale } from '../time/tashkent-time.util';
import { formatUzPhone } from '../uz-phone.util';
import { escapeHtml } from './telegram-rich-text.util';

const emptyValue = '—';

const valueOrEmpty = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || String(value).trim() === '') {
    return emptyValue;
  }

  return escapeHtml(String(value).trim());
};

const formatLanguage = (languageCode?: string | null): string => {
  switch (languageCode?.toLowerCase()) {
    case 'uz':
      return "O'zbekcha";
    case 'ru':
      return 'Русский';
    default:
      return valueOrEmpty(languageCode?.toUpperCase());
  }
};

const formatBooleanStatus = (
  value: boolean | null | undefined,
  enabled: string,
  disabled: string,
): string => (value ? enabled : disabled);

export const extractUsernameFromBlockedUserAlert = (text: string): string | null => {
  const match = text.match(/(?:^|\s)@([A-Za-z0-9_]{5,32})(?=\s|\||$)/);
  return match?.[1] || null;
};

export const formatBlockedUserCard = (params: {
  telegramId: number;
  user: User | null;
  username?: string | null;
}): string => {
  const { user, telegramId, username } = params;
  const fullName = user ? [user.first_name, user.last_name].filter(Boolean).join(' ').trim() : '';
  const telegramProfile = `<a href="tg://user?id=${telegramId}">profilni ochish</a>`;

  if (!user) {
    return [
      "👤 <b>Mijoz ma'lumotlari</b>",
      '',
      '⚠️ Ushbu foydalanuvchi bot bazasida topilmadi.',
      '',
      `<b>Telegram ma'lumotlari</b>`,
      `🆔 ID: <code>${telegramId}</code>`,
      `🔗 Username: ${username ? `@${escapeHtml(username)}` : emptyValue}`,
      `👁 Profil: ${telegramProfile}`,
      '🚫 Holat: <b>botni bloklagan</b>',
    ].join('\n');
  }

  return [
    "👤 <b>Mijoz ma'lumotlari</b>",
    '<b>Asosiy ma’lumotlar</b>',
    `👤 F.I.Sh.: <b>${valueOrEmpty(fullName)}</b>`,
    `📱 Telefon: <code>${escapeHtml(formatUzPhone(user.phone_number))}</code>`,
    `🌐 Til: ${formatLanguage(user.language_code)}`,
    '',
    '<b>Identifikatsiya</b>',
    `💼 SAP kodi: <code>${valueOrEmpty(user.sap_card_code)}</code>`,
    `🪪 JSHSHIR: <code>${valueOrEmpty(user.jshshir)}</code>`,
    `🛂 Pasport: <code>${valueOrEmpty(user.passport_series)}</code>`,
    `🏠 Manzil: ${valueOrEmpty(user.address)}`,
    '',
    '<b>Telegram va holat</b>',
    `🆔 Telegram ID: <code>${telegramId}</code>`,
    `🔗 Username: ${username ? `@${escapeHtml(username)}` : emptyValue}`,
    `👁 Profil: ${telegramProfile}`,
    '🚫 Telegram: <b>botni bloklagan</b>',
    `🔐 Hisob: ${formatBooleanStatus(user.is_logged_out, 'Tizimdan chiqqan', 'Faol')}`,
    `🎧 Qo‘llab-quvvatlash: ${formatBooleanStatus(
      user.is_support_banned,
      'Bloklangan',
      'Ruxsat berilgan',
    )}`,
    `👑 Rol: ${formatBooleanStatus(user.is_admin, 'Admin', 'Mijoz')}`,
    '',
    '<b>Tizim ma’lumotlari</b>',
    `#️⃣ Mijoz ID: <code>${user.id}</code>`,
    `📅 Ro‘yxatdan o‘tgan: ${formatDateTimeForLocale(user.created_at, 'uz')}`,
    `🔄 Yangilangan: ${formatDateTimeForLocale(user.updated_at, 'uz')}`,
  ].join('\n');
};
