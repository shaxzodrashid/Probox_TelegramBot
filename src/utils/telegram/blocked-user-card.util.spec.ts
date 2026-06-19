import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { User } from '../../services/user.service';
import {
  extractUsernameFromBlockedUserAlert,
  formatBlockedUserCard,
} from './blocked-user-card.util';

const user: User = {
  id: 42,
  telegram_id: 8078830248,
  first_name: 'Diyorbek',
  last_name: 'Karimov',
  phone_number: '+998901234567',
  sap_card_code: 'C00042',
  jshshir: '12345678901234',
  passport_series: 'AA1234567',
  address: 'Toshkent shahri',
  language_code: 'uz',
  is_admin: false,
  is_support_banned: false,
  is_logged_out: false,
  is_blocked: true,
  created_at: new Date('2026-01-10T08:00:00.000Z'),
  updated_at: new Date('2026-06-19T06:47:39.382Z'),
};

test('formatBlockedUserCard presents all available customer information in sections', () => {
  const card = formatBlockedUserCard({
    telegramId: user.telegram_id,
    user,
    username: 'D1yoruzb',
  });

  assert.match(card, /Mijoz ma'lumotlari/);
  assert.match(card, /Diyorbek Karimov/);
  assert.match(card, /\+998901234567/);
  assert.match(card, /C00042/);
  assert.match(card, /12345678901234/);
  assert.match(card, /AA1234567/);
  assert.match(card, /Toshkent shahri/);
  assert.match(card, /@D1yoruzb/);
  assert.match(card, /botni bloklagan/);
  assert.match(card, /Ro‘yxatdan o‘tgan/);
});

test('formatBlockedUserCard remains useful when the user is absent from the database', () => {
  const card = formatBlockedUserCard({
    telegramId: 8078830248,
    user: null,
    username: 'D1yoruzb',
  });

  assert.match(card, /bot bazasida topilmadi/);
  assert.match(card, /8078830248/);
  assert.match(card, /@D1yoruzb/);
});

test('extractUsernameFromBlockedUserAlert reads the username from the alert actor line', () => {
  assert.equal(
    extractUsernameFromBlockedUserAlert(
      'Foydalanuvchi: Diyorbek | @D1yoruzb | ID 8078830248 | lang=uz',
    ),
    'D1yoruzb',
  );
});
