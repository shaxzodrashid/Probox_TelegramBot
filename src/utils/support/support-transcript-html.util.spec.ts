import assert from 'node:assert/strict';
import test from 'node:test';

import { SupportTicket, SupportTicketMessage } from '../../types/support.types';
import {
  SupportTranscriptUserSnapshot,
  buildSupportTranscriptHtmlExport,
} from './support-transcript-html.util';

const makeTicket = (): SupportTicket => ({
  id: 99,
  ticket_number: 'ABC123',
  user_telegram_id: 777,
  message_text: 'Initial ticket preview',
  message_id: 10,
  group_message_id: 20,
  photo_file_id: undefined,
  status: 'open',
  handling_mode: 'agent',
  matched_faq_id: 8,
  agent_token: '__AGENT_FAQ_8__',
  agent_escalation_reason: 'Needs human confirmation for contract lookup.',
  replied_by_admin_id: undefined,
  replied_at: undefined,
  reply_message: undefined,
  created_at: new Date('2026-04-20T09:10:00.000Z'),
  updated_at: new Date('2026-04-20T09:15:00.000Z'),
});

const makeUser = (): SupportTranscriptUserSnapshot => ({
  first_name: 'Ali',
  last_name: 'Valiyev',
  phone_number: '+998901234567',
  telegram_id: 777,
  username: 'aliyev',
  sap_card_code: 'C001',
  language_code: 'uz',
});

const makeMessages = (): SupportTicketMessage[] => [
  {
    id: 1,
    ticket_id: 99,
    sender_type: 'user',
    message_text: 'Assalomu alaykum <script>alert(1)</script>',
    photo_file_id: null,
    telegram_message_id: 101,
    group_message_id: null,
    created_at: new Date('2026-04-20T09:10:10.000Z'),
  },
  {
    id: 2,
    ticket_id: 99,
    sender_type: 'agent',
    message_text: 'Salom! Yordam beraman.',
    photo_file_id: null,
    telegram_message_id: 102,
    group_message_id: null,
    created_at: new Date('2026-04-20T09:10:20.000Z'),
  },
  {
    id: 3,
    ticket_id: 99,
    sender_type: 'system',
    message_text: 'Escalated to human support: Needs manual review.',
    photo_file_id: 'AgACAgIAAxkBAAIB',
    telegram_message_id: null,
    group_message_id: null,
    created_at: new Date('2026-04-20T09:10:30.000Z'),
  },
];

test('buildSupportTranscriptHtmlExport renders the full stored transcript as a safe HTML buffer', () => {
  const result = buildSupportTranscriptHtmlExport({
    ticket: makeTicket(),
    user: makeUser(),
    messages: makeMessages(),
    generatedAt: new Date('2026-04-20T09:20:00.000Z'),
  });

  const html = result.buffer.toString('utf8');

  assert.equal(result.fileName, 'support-ticket-abc123-transcript.html');
  assert.match(html, /Qo‘llab-quvvatlash murojaati transkripti #ABC123/);
  assert.match(html, /O'zbekcha/);
  assert.match(html, /Русский/);
  assert.match(html, /AI agent/);
  assert.match(html, /Foydalanuvchi/);
  assert.match(html, /Tizim/);
  assert.match(html, /Needs human confirmation for contract lookup\./);
  assert.match(html, /Rasm biriktirilgan/);
  assert.match(html, /AgACAgIAAxkBAAIB/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /class="message user"/);
  assert.match(html, /class="message agent"/);
  assert.match(html, /class="message system"/);
  assert.match(html, /data-page-title-uz="Murojaat transkripti #ABC123"/);
  assert.match(html, /data-page-title-ru="Транскрипт обращения #ABC123"/);
  assert.doesNotMatch(html, /<body data-i18n-uz=/);
  assert.match(html, /data-locale-switch="uz"/);
  assert.match(html, /data-locale-switch="ru"/);
});
