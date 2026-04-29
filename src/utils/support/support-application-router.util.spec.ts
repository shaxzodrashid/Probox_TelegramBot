import assert from 'node:assert/strict';
import test from 'node:test';

import { SupportService } from '../../services/support/support.service';
import { SupportTicket, SupportTicketMessage } from '../../types/support.types';
import {
  isCrmApplicationEscalationReason,
  isSupportApplicationIntent,
  markSupportApplicationRouteStarted,
  resolveSupportApplicationRoute,
} from './support-application-router.util';

const makeTicket = (): SupportTicket => ({
  id: 10,
  ticket_number: 'CBJ880',
  user_telegram_id: 55,
  message_text: '15 oyga osam nechpulda tushad',
  message_id: 500,
  status: 'open',
  handling_mode: 'agent',
  matched_faq_id: 7,
  agent_token: '__AGENT_FAQ_7__',
  agent_escalation_reason: null,
  created_at: new Date(),
  updated_at: new Date(),
});

const makePurchaseHistory = (): SupportTicketMessage[] => [
  {
    id: 1,
    ticket_id: 10,
    sender_type: 'user',
    message_text: '15 oyga osam nechpulda tushad',
    photo_file_id: null,
    telegram_message_id: 501,
    group_message_id: null,
    created_at: new Date(),
  },
  {
    id: 2,
    ticket_id: 10,
    sender_type: 'agent',
    message_text:
      "iPhone 17 Pro 256GB Silver modelini 15 oyga bo'lib to'lash shartlari:\n\n• <b>Oyiga to'lov:</b> 1 995 233 so'm\n• <b>Boshlang'ich to'lov:</b> 1 000 000 so'm\n\nRasmiylashtirishni istaysizmi?",
    photo_file_id: null,
    telegram_message_id: 502,
    group_message_id: null,
    created_at: new Date(),
  },
];

test('isSupportApplicationIntent treats confirmation after application CTA as application intent', () => {
  assert.equal(isSupportApplicationIntent('ha', makePurchaseHistory()), true);
});

test('isSupportApplicationIntent does not treat bare confirmation without CTA as application intent', () => {
  assert.equal(
    isSupportApplicationIntent('ha', [
      {
        ...makePurchaseHistory()[1],
        message_text: 'iPhone 17 Pro 256GB Silver sotuvda mavjud.',
      },
    ]),
    false,
  );
});

test('isCrmApplicationEscalationReason detects the Gemini application handoff reason', () => {
  assert.equal(isCrmApplicationEscalationReason('CRM application requested'), true);
  assert.equal(isCrmApplicationEscalationReason('Gemini requested human takeover.'), false);
});

test('resolveSupportApplicationRoute returns the active AI ticket for application confirmation', async () => {
  const originalGetOpenAgentTicketByUserTelegramId =
    SupportService.getOpenAgentTicketByUserTelegramId;
  const originalGetTicketMessages = SupportService.getTicketMessages;

  SupportService.getOpenAgentTicketByUserTelegramId = (async () =>
    makeTicket()) as typeof SupportService.getOpenAgentTicketByUserTelegramId;
  SupportService.getTicketMessages = (async () =>
    makePurchaseHistory()) as typeof SupportService.getTicketMessages;

  try {
    const route = await resolveSupportApplicationRoute(55, 'ha');

    assert.equal(route?.ticket.ticket_number, 'CBJ880');
    assert.equal(route?.reason, 'CRM application requested');
  } finally {
    SupportService.getOpenAgentTicketByUserTelegramId = originalGetOpenAgentTicketByUserTelegramId;
    SupportService.getTicketMessages = originalGetTicketMessages;
  }
});

test('markSupportApplicationRouteStarted records the user confirmation and closes the AI ticket', async () => {
  const originalSyncTicketPreviewMessage = SupportService.syncTicketPreviewMessage;
  const originalAppendMessage = SupportService.appendMessage;
  const originalCloseTicket = SupportService.closeTicket;

  const synced: unknown[] = [];
  const appended: string[] = [];
  let closedTicketId: number | null = null;

  SupportService.syncTicketPreviewMessage = (async (params) => {
    synced.push(params);
  }) as typeof SupportService.syncTicketPreviewMessage;

  SupportService.appendMessage = (async (params) => {
    appended.push(`${params.senderType}:${params.messageText}`);
    return {
      id: appended.length,
      ticket_id: params.ticketId,
      sender_type: params.senderType,
      message_text: params.messageText,
      photo_file_id: params.photoFileId || null,
      telegram_message_id: params.telegramMessageId || null,
      group_message_id: params.groupMessageId || null,
      created_at: new Date(),
    };
  }) as typeof SupportService.appendMessage;

  SupportService.closeTicket = (async (ticketId) => {
    closedTicketId = ticketId;
    return true;
  }) as typeof SupportService.closeTicket;

  try {
    await markSupportApplicationRouteStarted({
      ticket: makeTicket(),
      messageText: 'ha',
      messageId: 503,
    });

    assert.equal(synced.length, 1);
    assert.deepEqual(appended, [
      'user:ha',
      'system:AI support thread moved to application conversation: CRM application requested',
    ]);
    assert.equal(closedTicketId, 10);
  } finally {
    SupportService.syncTicketPreviewMessage = originalSyncTicketPreviewMessage;
    SupportService.appendMessage = originalAppendMessage;
    SupportService.closeTicket = originalCloseTicket;
  }
});
