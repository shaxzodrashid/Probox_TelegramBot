import assert from 'node:assert/strict';
import test from 'node:test';

import { config } from '../../config';
import { FaqRoutingService } from '../../services/faq/faq-routing.service';
import { FaqService } from '../../services/faq/faq.service';
import { SupportAgentService } from '../../services/support/support-agent.service';
import { SupportDispatcherService } from '../../services/support/support-dispatcher.service';
import { SupportService } from '../../services/support/support.service';
import { SupportTicketMessage } from '../../types/support.types';
import { redisService } from '../../redis/redis.service';
import {
  enqueueSupportRequest,
  formatAdminGroupMessage,
  processSupportRequest,
} from './support.util';

const makeUser = () => ({
  id: 1,
  telegram_id: 55,
  first_name: 'Ali',
  last_name: 'Valiyev',
  phone_number: '+998901234567',
  sap_card_code: 'C001',
  jshshir: '12345678901234',
  passport_series: 'AA1234567',
  language_code: 'uz',
  is_admin: false,
  is_support_banned: false,
  is_logged_out: false,
  is_blocked: false,
  created_at: new Date(),
  updated_at: new Date(),
});

const makeActiveAgentTicket = () => ({
  id: 10,
  ticket_number: 'NTD436',
  user_telegram_id: 55,
  message_text: 'Ulardan iphone 17 topamanmi',
  message_id: 500,
  status: 'open' as const,
  handling_mode: 'agent' as const,
  matched_faq_id: 8,
  agent_token: '__AGENT_FAQ_8__',
  agent_escalation_reason: null,
  created_at: new Date(),
  updated_at: new Date(),
});

const makeLocalTicket = () => ({
  id: 11,
  ticket_number: 'ABC123',
  user_telegram_id: 55,
  message_text: 'Assalomu alaykum, sizlarda nechta filial bor',
  message_id: 600,
  status: 'open' as const,
  handling_mode: 'human' as const,
  matched_faq_id: null,
  agent_token: null,
  agent_escalation_reason: null,
  created_at: new Date(),
  updated_at: new Date(),
});

const makeFakeCtx = () => {
  const replies: string[] = [];
  let replyCounter = 100;

  return {
    replies,
    ctx: {
      from: {
        id: 55,
        username: 'ali',
      },
      reply: async (text: string) => {
        replies.push(text);
        replyCounter += 1;

        return {
          chat: { id: 55 },
          message_id: replyCounter,
        };
      },
    },
  };
};

const makeFakeApi = () => ({
  deleteMessage: async () => undefined,
  sendChatAction: async () => undefined,
  sendDocument: async () => ({ message_id: 999 }),
  sendMessage: async () => ({ message_id: 999 }),
  sendPhoto: async () => ({ message_id: 999 }),
});

test('formatAdminGroupMessage applies Telegram HTML formatting for agent transcript lines only', () => {
  const message = formatAdminGroupMessage(
    'ABC123',
    {
      first_name: 'Ali',
      last_name: 'Valiyev',
      phone_number: '+998901234567',
      telegram_id: 55,
      username: 'ali',
      sap_card_code: 'C001',
      language_code: 'uz',
    },
    'ha <script>alert(1)</script>',
    new Date('2026-04-20T09:10:00.000Z'),
    {
      transcript: [
        {
          id: 1,
          ticket_id: 99,
          sender_type: 'user',
          message_text: '<b>raw user</b>',
          photo_file_id: null,
          telegram_message_id: 1,
          group_message_id: null,
          created_at: new Date(),
        },
        {
          id: 2,
          ticket_id: 99,
          sender_type: 'agent',
          message_text: '<b>Oyiga to‘lov:</b> 1 995 233 so‘m',
          photo_file_id: null,
          telegram_message_id: 2,
          group_message_id: null,
          created_at: new Date(),
        },
      ],
    },
  );

  assert.match(message, /ha &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(message, /1\. <b>Foydalanuvchi:<\/b> &lt;b&gt;raw user&lt;\/b&gt;/);
  assert.match(message, /2\. <b>AI agent:<\/b> <b>Oyiga to‘lov:<\/b> 1 995 233 so‘m/);
});

test('processSupportRequest routes active AI-ticket messages through FAQ resolution before continuing the ticket', async () => {
  const originalGetOpenAgentTicketByUserTelegramId =
    SupportService.getOpenAgentTicketByUserTelegramId;
  const originalGetLatestOpenUnforwardedTicketByUserTelegramId =
    SupportService.getLatestOpenUnforwardedTicketByUserTelegramId;
  const originalResolveSupportFaq = FaqRoutingService.resolveSupportFaq;
  const originalAppendMessage = SupportService.appendMessage;
  const originalCloseTicket = SupportService.closeTicket;
  const originalSyncTicketPreviewMessage = SupportService.syncTicketPreviewMessage;
  const originalCreateTicket = SupportService.createTicket;
  const originalGetTicketMessages = SupportService.getTicketMessages;
  const originalGenerateReply = SupportAgentService.generateReply;

  const appendedMessages: string[] = [];
  const resolveCalls: Array<{ question: string; semanticSearchText?: string }> = [];
  let closeTicketId: number | null = null;
  let syncCallCount = 0;
  let createTicketCallCount = 0;
  let supportAgentCallCount = 0;

  SupportService.getOpenAgentTicketByUserTelegramId = (async () =>
    makeActiveAgentTicket()) as typeof SupportService.getOpenAgentTicketByUserTelegramId;

  SupportService.getLatestOpenUnforwardedTicketByUserTelegramId = (async () =>
    null) as typeof SupportService.getLatestOpenUnforwardedTicketByUserTelegramId;

  SupportService.getTicketMessages = (async () => [
    {
      id: 1,
      ticket_id: 10,
      sender_type: 'user',
      message_text: 'iPhone 17 bormi?',
      photo_file_id: null,
      telegram_message_id: 500,
      group_message_id: null,
      created_at: new Date(),
    },
    {
      id: 2,
      ticket_id: 10,
      sender_type: 'agent',
      message_text: 'Qaysi xotira kerak?',
      photo_file_id: null,
      telegram_message_id: 501,
      group_message_id: null,
      created_at: new Date(),
    },
  ]) as typeof SupportService.getTicketMessages;

  FaqRoutingService.resolveSupportFaq = (async (question, options) => {
    resolveCalls.push({
      question,
      semanticSearchText: options?.semanticSearchText,
    });

    return {
      faq: {
        id: 1,
        question_uz: 'Probox kompaniyasining umumiy filiallari soni qancha?',
        question_ru: 'Сколько филиалов у компании Probox?',
        question_en: 'How many branches does Probox have?',
        answer_uz: 'Bizning Nurafshon va Samarqand filiallarimiz bor.',
        answer_ru: 'У нас есть филиалы в Нурафшоне и Самарканде.',
        answer_en: 'We have Nurafshon and Samarkand branches.',
        status: 'published',
        vector_embedding: '[]',
        agent_enabled: false,
        agent_token: null,
        created_by_admin_telegram_id: 1,
        locked_by_admin_telegram_id: null,
        workflow_stage: 'completed',
        created_at: new Date(),
        updated_at: new Date(),
      },
      resolutionType: 'semantic' as const,
      distance: 0.22,
      confidence: 1,
      reason: 'Top semantic FAQ candidate cleared the static auto-reply threshold.',
    };
  }) as typeof FaqRoutingService.resolveSupportFaq;

  SupportService.appendMessage = (async (params) => {
    appendedMessages.push(`${params.senderType}:${params.messageText}`);

    return {
      id: 1,
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
    closeTicketId = ticketId;
    return true;
  }) as typeof SupportService.closeTicket;

  SupportService.syncTicketPreviewMessage = (async () => {
    syncCallCount += 1;
  }) as typeof SupportService.syncTicketPreviewMessage;

  SupportService.createTicket = (async () => {
    createTicketCallCount += 1;
    return makeLocalTicket();
  }) as typeof SupportService.createTicket;

  SupportAgentService.generateReply = (async () => {
    supportAgentCallCount += 1;
    return {
      replyText: 'Agent reply',
      shouldEscalate: false,
      escalationReason: '',
    };
  }) as typeof SupportAgentService.generateReply;

  const { ctx, replies } = makeFakeCtx();

  try {
    await processSupportRequest(
      makeFakeApi() as unknown as import('grammy').Api<import('grammy').RawApi>,
      ctx as unknown as import('../../types/context').BotContext,
      makeUser(),
      'Assalomu alaykum, sizlarda nechta filial bor',
      600,
      undefined,
      'uz',
    );

    assert.deepEqual(resolveCalls, [
      {
        question: 'Assalomu alaykum, sizlarda nechta filial bor',
        semanticSearchText: [
          'user: iPhone 17 bormi?',
          'agent: Qaysi xotira kerak?',
          'user: Assalomu alaykum, sizlarda nechta filial bor',
        ].join('\n'),
      },
    ]);
    assert.equal(closeTicketId, 10);
    assert.equal(syncCallCount, 0);
    assert.equal(createTicketCallCount, 1);
    assert.equal(supportAgentCallCount, 0);
    assert.equal(appendedMessages.length, 3);
    assert.match(appendedMessages[0], /^system:AI support thread closed:/);
    assert.equal(appendedMessages[1], 'user:Assalomu alaykum, sizlarda nechta filial bor');
    assert.equal(appendedMessages[2], 'agent:Bizning Nurafshon va Samarqand filiallarimiz bor.');
    assert.equal(replies.length, 2);
    assert.equal(replies[1], 'Bizning Nurafshon va Samarqand filiallarimiz bor.');
  } finally {
    SupportService.getOpenAgentTicketByUserTelegramId = originalGetOpenAgentTicketByUserTelegramId;
    SupportService.getLatestOpenUnforwardedTicketByUserTelegramId =
      originalGetLatestOpenUnforwardedTicketByUserTelegramId;
    FaqRoutingService.resolveSupportFaq = originalResolveSupportFaq;
    SupportService.appendMessage = originalAppendMessage;
    SupportService.closeTicket = originalCloseTicket;
    SupportService.syncTicketPreviewMessage = originalSyncTicketPreviewMessage;
    SupportService.createTicket = originalCreateTicket;
    SupportService.getTicketMessages = originalGetTicketMessages;
    SupportAgentService.generateReply = originalGenerateReply;
  }
});

test('enqueueSupportRequest acknowledges immediately and finishes the FAQ reply in the background', async () => {
  const originalGetOpenAgentTicketByUserTelegramId =
    SupportService.getOpenAgentTicketByUserTelegramId;
  const originalGetLatestOpenUnforwardedTicketByUserTelegramId =
    SupportService.getLatestOpenUnforwardedTicketByUserTelegramId;
  const originalResolveSupportFaq = FaqRoutingService.resolveSupportFaq;
  const originalAppendMessage = SupportService.appendMessage;
  const originalCreateTicket = SupportService.createTicket;

  let releaseResolution: () => void = () => {};
  const resolutionGate = new Promise<void>((resolve) => {
    releaseResolution = resolve;
  });

  SupportService.getOpenAgentTicketByUserTelegramId = (async () =>
    null) as typeof SupportService.getOpenAgentTicketByUserTelegramId;

  SupportService.getLatestOpenUnforwardedTicketByUserTelegramId = (async () =>
    null) as typeof SupportService.getLatestOpenUnforwardedTicketByUserTelegramId;

  FaqRoutingService.resolveSupportFaq = (async () => {
    await resolutionGate;

    return {
      faq: {
        id: 2,
        question_uz: 'Dostavka bormi?',
        question_ru: 'Есть ли доставка?',
        question_en: 'Do you offer delivery?',
        answer_uz: 'Ha, bizda dostavka mavjud.',
        answer_ru: 'Да, у нас есть доставка.',
        answer_en: 'Yes, we offer delivery.',
        status: 'published',
        vector_embedding: '[]',
        agent_enabled: false,
        agent_token: null,
        created_by_admin_telegram_id: 1,
        locked_by_admin_telegram_id: null,
        workflow_stage: 'completed',
        created_at: new Date(),
        updated_at: new Date(),
      },
      resolutionType: 'semantic' as const,
      distance: 0.2,
      confidence: 1,
      reason: 'Top semantic FAQ candidate cleared the static auto-reply threshold.',
    };
  }) as typeof FaqRoutingService.resolveSupportFaq;

  SupportService.createTicket = (async () =>
    makeLocalTicket()) as typeof SupportService.createTicket;

  SupportService.appendMessage = (async (params) => ({
    id: 1,
    ticket_id: params.ticketId,
    sender_type: params.senderType,
    message_text: params.messageText,
    photo_file_id: params.photoFileId || null,
    telegram_message_id: params.telegramMessageId || null,
    group_message_id: params.groupMessageId || null,
    created_at: new Date(),
  })) as typeof SupportService.appendMessage;

  const { ctx, replies } = makeFakeCtx();
  const deletedMessages: Array<{ chatId: number; messageId: number }> = [];
  const chatActions: string[] = [];
  let apiMessageCounter = 100;

  try {
    await enqueueSupportRequest(
      {
        ...makeFakeApi(),
        deleteMessage: async (chatId: number, messageId: number) => {
          deletedMessages.push({ chatId, messageId });
        },
        sendChatAction: async (_chatId: number, action: string) => {
          chatActions.push(action);
        },
        sendMessage: async (chatId: number, text: string) => {
          replies.push(text);
          apiMessageCounter += 1;

          return {
            chat: { id: chatId },
            message_id: apiMessageCounter,
          };
        },
      } as unknown as import('grammy').Api<import('grammy').RawApi>,
      {
        ...(ctx as object),
        reply: async () => {
          throw new Error('deferred support jobs must not use ctx.reply');
        },
      } as unknown as import('../../types/context').BotContext,
      makeUser(),
      'Assalomu alaykum, silada dostavka bormi',
      612,
      undefined,
      'uz',
    );

    assert.deepEqual(replies, ["⏳ AI yordamchi so'rovingizni tekshiryapti..."]);

    releaseResolution();
    await SupportDispatcherService.whenIdle(55);

    assert.deepEqual(replies, [
      "⏳ AI yordamchi so'rovingizni tekshiryapti...",
      'Ha, bizda dostavka mavjud.',
    ]);
    assert.ok(chatActions.includes('typing'));
    assert.deepEqual(deletedMessages, [{ chatId: 55, messageId: 101 }]);
  } finally {
    releaseResolution();
    await SupportDispatcherService.whenIdle(55);
    SupportService.getOpenAgentTicketByUserTelegramId = originalGetOpenAgentTicketByUserTelegramId;
    SupportService.getLatestOpenUnforwardedTicketByUserTelegramId =
      originalGetLatestOpenUnforwardedTicketByUserTelegramId;
    FaqRoutingService.resolveSupportFaq = originalResolveSupportFaq;
    SupportService.appendMessage = originalAppendMessage;
    SupportService.createTicket = originalCreateTicket;
  }
});

test('enqueueSupportRequest keeps the thinking message until fallback AI support finishes on an FAQ miss', async () => {
  const originalGetOpenAgentTicketByUserTelegramId =
    SupportService.getOpenAgentTicketByUserTelegramId;
  const originalGetLatestOpenUnforwardedTicketByUserTelegramId =
    SupportService.getLatestOpenUnforwardedTicketByUserTelegramId;
  const originalResolveSupportFaq = FaqRoutingService.resolveSupportFaq;
  const originalAppendMessage = SupportService.appendMessage;
  const originalCreateTicket = SupportService.createTicket;
  const originalUpdateTicketHandling = SupportService.updateTicketHandling;
  const originalGetTicketMessages = SupportService.getTicketMessages;
  const originalGenerateReply = SupportAgentService.generateReply;
  SupportService.getOpenAgentTicketByUserTelegramId = (async () =>
    null) as typeof SupportService.getOpenAgentTicketByUserTelegramId;

  SupportService.getLatestOpenUnforwardedTicketByUserTelegramId = (async () =>
    null) as typeof SupportService.getLatestOpenUnforwardedTicketByUserTelegramId;

  FaqRoutingService.resolveSupportFaq = (async () =>
    null) as typeof FaqRoutingService.resolveSupportFaq;

  SupportService.createTicket = (async () =>
    makeLocalTicket()) as typeof SupportService.createTicket;

  SupportService.appendMessage = (async (params) => ({
    id: 1,
    ticket_id: params.ticketId,
    sender_type: params.senderType,
    message_text: params.messageText,
    photo_file_id: params.photoFileId || null,
    telegram_message_id: params.telegramMessageId || null,
    group_message_id: params.groupMessageId || null,
    created_at: new Date(),
  })) as typeof SupportService.appendMessage;

  SupportService.updateTicketHandling = (async (params) => ({
    ...makeLocalTicket(),
    handling_mode: params.handlingMode,
    matched_faq_id: params.matchedFaqId ?? null,
    agent_token: params.agentToken ?? null,
    agent_escalation_reason: params.agentEscalationReason ?? null,
  })) as typeof SupportService.updateTicketHandling;

  SupportService.getTicketMessages = (async () => [
    {
      id: 1,
      ticket_id: 11,
      sender_type: 'user',
      message_text: 'Operator bilan bog‘lanmoqchiman',
      photo_file_id: null,
      telegram_message_id: 613,
      group_message_id: null,
      created_at: new Date(),
    },
  ]) as typeof SupportService.getTicketMessages;

  SupportAgentService.generateReply = (async () => ({
    replyText: 'Murojaatingizni AI yordamchi ko‘rib chiqdi va yordam berishda davom etadi.',
    shouldEscalate: false,
    escalationReason: '',
  })) as typeof SupportAgentService.generateReply;

  const { ctx, replies } = makeFakeCtx();
  const deletedMessages: Array<{ chatId: number; messageId: number }> = [];
  let apiMessageCounter = 100;

  try {
    await enqueueSupportRequest(
      {
        ...makeFakeApi(),
        deleteMessage: async (chatId: number, messageId: number) => {
          deletedMessages.push({ chatId, messageId });
        },
        sendMessage: async (chatId: number, text: string) => {
          replies.push(text);
          apiMessageCounter += 1;

          return {
            chat: { id: chatId },
            message_id: apiMessageCounter,
          };
        },
      } as unknown as import('grammy').Api<import('grammy').RawApi>,
      {
        ...(ctx as object),
        reply: async () => {
          throw new Error('deferred support jobs must not use ctx.reply');
        },
        from: {
          ...ctx.from,
          id: 55,
        },
      } as unknown as import('../../types/context').BotContext,
      {
        ...makeUser(),
        is_admin: true,
      },
      'Operator bilan bog‘lanmoqchiman',
      613,
      undefined,
      'uz',
    );

    await SupportDispatcherService.whenIdle(55);

    assert.deepEqual(replies, [
      "⏳ AI yordamchi so'rovingizni tekshiryapti...",
      'Murojaatingizni AI yordamchi ko‘rib chiqdi va yordam berishda davom etadi.',
    ]);
    assert.deepEqual(deletedMessages, [{ chatId: 55, messageId: 101 }]);
  } finally {
    await SupportDispatcherService.whenIdle(55);
    SupportService.getOpenAgentTicketByUserTelegramId = originalGetOpenAgentTicketByUserTelegramId;
    SupportService.getLatestOpenUnforwardedTicketByUserTelegramId =
      originalGetLatestOpenUnforwardedTicketByUserTelegramId;
    FaqRoutingService.resolveSupportFaq = originalResolveSupportFaq;
    SupportService.appendMessage = originalAppendMessage;
    SupportService.createTicket = originalCreateTicket;
    SupportService.updateTicketHandling = originalUpdateTicketHandling;
    SupportService.getTicketMessages = originalGetTicketMessages;
    SupportAgentService.generateReply = originalGenerateReply;
  }
});

test('processSupportRequest still continues an active AI ticket when FAQ routing finds no better match', async () => {
  const originalGetOpenAgentTicketByUserTelegramId =
    SupportService.getOpenAgentTicketByUserTelegramId;
  const originalResolveSupportFaq = FaqRoutingService.resolveSupportFaq;
  const originalAppendMessage = SupportService.appendMessage;
  const originalSyncTicketPreviewMessage = SupportService.syncTicketPreviewMessage;
  const originalGetPublishedFaqById = FaqService.getPublishedFaqById;
  const originalGetTicketMessages = SupportService.getTicketMessages;
  const originalGenerateReply = SupportAgentService.generateReply;

  const appendedMessages: string[] = [];
  let syncCallCount = 0;
  let supportAgentCallCount = 0;

  SupportService.getOpenAgentTicketByUserTelegramId = (async () =>
    makeActiveAgentTicket()) as typeof SupportService.getOpenAgentTicketByUserTelegramId;

  FaqRoutingService.resolveSupportFaq = (async () =>
    null) as typeof FaqRoutingService.resolveSupportFaq;

  SupportService.syncTicketPreviewMessage = (async () => {
    syncCallCount += 1;
  }) as typeof SupportService.syncTicketPreviewMessage;

  SupportService.appendMessage = (async (params) => {
    appendedMessages.push(`${params.senderType}:${params.messageText}`);

    return {
      id: 1,
      ticket_id: params.ticketId,
      sender_type: params.senderType,
      message_text: params.messageText,
      photo_file_id: params.photoFileId || null,
      telegram_message_id: params.telegramMessageId || null,
      group_message_id: params.groupMessageId || null,
      created_at: new Date(),
    };
  }) as typeof SupportService.appendMessage;

  FaqService.getPublishedFaqById = (async () => ({
    id: 8,
    question_uz: "Sizning do'koningizda {phone_type} qurilmasi sotuvda bormi?",
    question_ru: 'Есть ли в продаже устройство {phone_type}?',
    question_en: 'Do you have {phone_type} in stock?',
    answer_uz: '__AGENT_FAQ_8__',
    answer_ru: '__AGENT_FAQ_8__',
    answer_en: '__AGENT_FAQ_8__',
    status: 'published',
    vector_embedding: '[]',
    agent_enabled: true,
    agent_token: '__AGENT_FAQ_8__',
    created_by_admin_telegram_id: 1,
    locked_by_admin_telegram_id: null,
    workflow_stage: 'completed',
    created_at: new Date(),
    updated_at: new Date(),
  })) as typeof FaqService.getPublishedFaqById;

  SupportService.getTicketMessages = (async () => [
    {
      id: 1,
      ticket_id: 10,
      sender_type: 'user',
      message_text: 'Ulardan iphone 17 topamanmi',
      photo_file_id: null,
      telegram_message_id: 500,
      group_message_id: null,
      created_at: new Date(),
    },
  ]) as typeof SupportService.getTicketMessages;

  SupportAgentService.generateReply = (async () => {
    supportAgentCallCount += 1;
    return {
      replyText: "Hozir tekshirib ko'ryapman.",
      shouldEscalate: false,
      escalationReason: '',
    };
  }) as typeof SupportAgentService.generateReply;

  const { ctx, replies } = makeFakeCtx();

  try {
    await processSupportRequest(
      makeFakeApi() as unknown as import('grammy').Api<import('grammy').RawApi>,
      ctx as unknown as import('../../types/context').BotContext,
      makeUser(),
      'Yana tekshirib ko‘ring',
      601,
      undefined,
      'uz',
    );

    assert.equal(syncCallCount, 1);
    assert.equal(supportAgentCallCount, 1);
    assert.deepEqual(appendedMessages, [
      'user:Yana tekshirib ko‘ring',
      "agent:Hozir tekshirib ko'ryapman.",
    ]);
    assert.equal(replies.length, 2);
    assert.equal(replies[1], "Hozir tekshirib ko'ryapman.");
  } finally {
    SupportService.getOpenAgentTicketByUserTelegramId = originalGetOpenAgentTicketByUserTelegramId;
    FaqRoutingService.resolveSupportFaq = originalResolveSupportFaq;
    SupportService.appendMessage = originalAppendMessage;
    SupportService.syncTicketPreviewMessage = originalSyncTicketPreviewMessage;
    FaqService.getPublishedFaqById = originalGetPublishedFaqById;
    SupportService.getTicketMessages = originalGetTicketMessages;
    SupportAgentService.generateReply = originalGenerateReply;
  }
});

test('processSupportRequest keeps active AI ticket history when FAQ routing upgrades a fallback thread to an agent FAQ', async () => {
  const originalGetOpenAgentTicketByUserTelegramId =
    SupportService.getOpenAgentTicketByUserTelegramId;
  const originalResolveSupportFaq = FaqRoutingService.resolveSupportFaq;
  const originalAppendMessage = SupportService.appendMessage;
  const originalSyncTicketPreviewMessage = SupportService.syncTicketPreviewMessage;
  const originalUpdateTicketHandling = SupportService.updateTicketHandling;
  const originalCloseTicket = SupportService.closeTicket;
  const originalCreateTicket = SupportService.createTicket;
  const originalGetPublishedFaqById = FaqService.getPublishedFaqById;
  const originalGetTicketMessages = SupportService.getTicketMessages;
  const originalGenerateReply = SupportAgentService.generateReply;

  const activeFallbackTicket = {
    ...makeActiveAgentTicket(),
    ticket_number: 'OJB985',
    matched_faq_id: null,
    agent_token: '__FALLBACK_AI_SUPPORT__',
  };
  const ticketMessages: SupportTicketMessage[] = [
    {
      id: 1,
      ticket_id: activeFallbackTicket.id,
      sender_type: 'user' as const,
      message_text: '15 pro bomi',
      photo_file_id: null,
      telegram_message_id: 7749,
      group_message_id: null,
      created_at: new Date(),
    },
    {
      id: 2,
      ticket_id: activeFallbackTicket.id,
      sender_type: 'agent' as const,
      message_text: 'iPhone 15 Pro uchun qaysi xotira va rang kerak?',
      photo_file_id: null,
      telegram_message_id: 7750,
      group_message_id: null,
      created_at: new Date(),
    },
  ];
  const appendedMessages: string[] = [];
  let syncCallCount = 0;
  let closeCallCount = 0;
  let createTicketCallCount = 0;
  let updatedMatchedFaqId: number | null = null;
  let capturedHistory: Array<{ sender_type: string; message_text: string }> = [];

  const agentFaq = {
    id: 7,
    question_uz: "Sizning do'koningizda {phone_type} qurilmasi sotuvda bormi?",
    question_ru: 'Есть ли в продаже устройство {phone_type}?',
    question_en: 'Do you have {phone_type} in stock?',
    answer_uz: '__AGENT_FAQ_7__',
    answer_ru: '__AGENT_FAQ_7__',
    answer_en: '__AGENT_FAQ_7__',
    status: 'published' as const,
    vector_embedding: '[]',
    agent_enabled: true,
    agent_token: '__AGENT_FAQ_7__',
    created_by_admin_telegram_id: 1,
    locked_by_admin_telegram_id: null,
    workflow_stage: 'completed' as const,
    created_at: new Date(),
    updated_at: new Date(),
  };

  SupportService.getOpenAgentTicketByUserTelegramId = (async () =>
    activeFallbackTicket) as typeof SupportService.getOpenAgentTicketByUserTelegramId;

  FaqRoutingService.resolveSupportFaq = (async () => ({
    faq: agentFaq,
    resolutionType: 'semantic_ai' as const,
    distance: 0.25,
    confidence: 0.95,
    reason: 'The user is asking for availability of a specific iPhone configuration.',
  })) as typeof FaqRoutingService.resolveSupportFaq;

  SupportService.syncTicketPreviewMessage = (async () => {
    syncCallCount += 1;
  }) as typeof SupportService.syncTicketPreviewMessage;

  SupportService.updateTicketHandling = (async (params) => {
    updatedMatchedFaqId = params.matchedFaqId ?? null;

    return {
      ...activeFallbackTicket,
      handling_mode: params.handlingMode,
      matched_faq_id: params.matchedFaqId ?? null,
      agent_token: params.agentToken ?? null,
      agent_escalation_reason: params.agentEscalationReason ?? null,
    };
  }) as typeof SupportService.updateTicketHandling;

  SupportService.closeTicket = (async () => {
    closeCallCount += 1;
    return true;
  }) as typeof SupportService.closeTicket;

  SupportService.createTicket = (async () => {
    createTicketCallCount += 1;
    return makeLocalTicket();
  }) as typeof SupportService.createTicket;

  SupportService.appendMessage = (async (params) => {
    appendedMessages.push(`${params.senderType}:${params.messageText}`);
    const message = {
      id: ticketMessages.length + 1,
      ticket_id: params.ticketId,
      sender_type: params.senderType,
      message_text: params.messageText,
      photo_file_id: params.photoFileId || null,
      telegram_message_id: params.telegramMessageId || null,
      group_message_id: params.groupMessageId || null,
      created_at: new Date(),
    };
    ticketMessages.push(message);
    return message;
  }) as typeof SupportService.appendMessage;

  FaqService.getPublishedFaqById = (async () => agentFaq) as typeof FaqService.getPublishedFaqById;

  SupportService.getTicketMessages = (async () =>
    ticketMessages) as typeof SupportService.getTicketMessages;

  SupportAgentService.generateReply = (async (params) => {
    capturedHistory = params.history.map((message) => ({
      sender_type: message.sender_type,
      message_text: message.message_text,
    }));

    return {
      replyText: "Hozir iPhone 15 Pro 256GB oq rang bo'yicha tekshiraman.",
      shouldEscalate: false,
      escalationReason: '',
    };
  }) as typeof SupportAgentService.generateReply;

  const { ctx, replies } = makeFakeCtx();

  try {
    await processSupportRequest(
      makeFakeApi() as unknown as import('grammy').Api<import('grammy').RawApi>,
      ctx as unknown as import('../../types/context').BotContext,
      makeUser(),
      'oqi bomi 256 tali',
      7752,
      undefined,
      'uz',
    );

    assert.equal(syncCallCount, 1);
    assert.equal(closeCallCount, 0);
    assert.equal(createTicketCallCount, 0);
    assert.equal(updatedMatchedFaqId, 7);
    assert.deepEqual(appendedMessages, [
      'user:oqi bomi 256 tali',
      "agent:Hozir iPhone 15 Pro 256GB oq rang bo'yicha tekshiraman.",
    ]);
    assert.deepEqual(capturedHistory, [
      { sender_type: 'user', message_text: '15 pro bomi' },
      {
        sender_type: 'agent',
        message_text: 'iPhone 15 Pro uchun qaysi xotira va rang kerak?',
      },
      { sender_type: 'user', message_text: 'oqi bomi 256 tali' },
    ]);
    assert.equal(replies[1], "Hozir iPhone 15 Pro 256GB oq rang bo'yicha tekshiraman.");
  } finally {
    SupportService.getOpenAgentTicketByUserTelegramId = originalGetOpenAgentTicketByUserTelegramId;
    FaqRoutingService.resolveSupportFaq = originalResolveSupportFaq;
    SupportService.appendMessage = originalAppendMessage;
    SupportService.syncTicketPreviewMessage = originalSyncTicketPreviewMessage;
    SupportService.updateTicketHandling = originalUpdateTicketHandling;
    SupportService.closeTicket = originalCloseTicket;
    SupportService.createTicket = originalCreateTicket;
    FaqService.getPublishedFaqById = originalGetPublishedFaqById;
    SupportService.getTicketMessages = originalGetTicketMessages;
    SupportAgentService.generateReply = originalGenerateReply;
  }
});

test('processSupportRequest sends a polite AI handoff message when the agent escalates', async () => {
  const originalSupportGroupId = config.SUPPORT_GROUP_ID;
  const originalGetOpenAgentTicketByUserTelegramId =
    SupportService.getOpenAgentTicketByUserTelegramId;
  const originalGetLatestOpenUnforwardedTicketByUserTelegramId =
    SupportService.getLatestOpenUnforwardedTicketByUserTelegramId;
  const originalResolveSupportFaq = FaqRoutingService.resolveSupportFaq;
  const originalAppendMessage = SupportService.appendMessage;
  const originalCreateTicket = SupportService.createTicket;
  const originalUpdateTicketHandling = SupportService.updateTicketHandling;
  const originalEscalateAgentTicket = SupportService.escalateAgentTicket;
  const originalUpdateGroupMessageId = SupportService.updateGroupMessageId;
  const originalUpdateLatestMessageGroupMessageId =
    SupportService.updateLatestMessageGroupMessageId;
  const originalGetPublishedFaqById = FaqService.getPublishedFaqById;
  const originalGetTicketMessages = SupportService.getTicketMessages;
  const originalGenerateReply = SupportAgentService.generateReply;

  const appendedMessages: string[] = [];

  config.SUPPORT_GROUP_ID = '12345';

  SupportService.getOpenAgentTicketByUserTelegramId = (async () =>
    null) as typeof SupportService.getOpenAgentTicketByUserTelegramId;

  SupportService.getLatestOpenUnforwardedTicketByUserTelegramId = (async () =>
    null) as typeof SupportService.getLatestOpenUnforwardedTicketByUserTelegramId;

  FaqRoutingService.resolveSupportFaq = (async () => ({
    faq: {
      id: 9,
      question_uz: 'Nega buyurtmam kechikdi?',
      question_ru: 'Почему задержался мой заказ?',
      question_en: 'Why is my order delayed?',
      answer_uz: '__AGENT_FAQ_9__',
      answer_ru: '__AGENT_FAQ_9__',
      answer_en: '__AGENT_FAQ_9__',
      status: 'published',
      vector_embedding: '[]',
      agent_enabled: true,
      agent_token: '__AGENT_FAQ_9__',
      created_by_admin_telegram_id: 1,
      locked_by_admin_telegram_id: null,
      workflow_stage: 'completed',
      created_at: new Date(),
      updated_at: new Date(),
    },
    resolutionType: 'semantic_ai' as const,
    distance: 0.1,
    confidence: 0.99,
    reason: 'Human support review is required.',
  })) as typeof FaqRoutingService.resolveSupportFaq;

  SupportService.createTicket = (async () =>
    makeLocalTicket()) as typeof SupportService.createTicket;

  SupportService.updateTicketHandling = (async (params) => ({
    ...makeLocalTicket(),
    handling_mode: params.handlingMode,
    matched_faq_id: params.matchedFaqId ?? null,
    agent_token: params.agentToken ?? null,
    agent_escalation_reason: params.agentEscalationReason ?? null,
  })) as typeof SupportService.updateTicketHandling;

  SupportService.escalateAgentTicket = (async (ticketId, reason) => ({
    ...makeLocalTicket(),
    id: ticketId,
    agent_escalation_reason: reason,
    handling_mode: 'human',
  })) as typeof SupportService.escalateAgentTicket;

  SupportService.updateGroupMessageId = (async () =>
    undefined) as typeof SupportService.updateGroupMessageId;

  SupportService.updateLatestMessageGroupMessageId = (async () =>
    undefined) as typeof SupportService.updateLatestMessageGroupMessageId;

  SupportService.appendMessage = (async (params) => {
    appendedMessages.push(`${params.senderType}:${params.messageText}`);

    return {
      id: appendedMessages.length,
      ticket_id: params.ticketId,
      sender_type: params.senderType,
      message_text: params.messageText,
      photo_file_id: params.photoFileId || null,
      telegram_message_id: params.telegramMessageId || null,
      group_message_id: params.groupMessageId || null,
      created_at: new Date(),
    };
  }) as typeof SupportService.appendMessage;

  FaqService.getPublishedFaqById = (async () => ({
    id: 9,
    question_uz: 'Nega buyurtmam kechikdi?',
    question_ru: 'Почему задержался мой заказ?',
    question_en: 'Why is my order delayed?',
    answer_uz: '__AGENT_FAQ_9__',
    answer_ru: '__AGENT_FAQ_9__',
    answer_en: '__AGENT_FAQ_9__',
    status: 'published',
    vector_embedding: '[]',
    agent_enabled: true,
    agent_token: '__AGENT_FAQ_9__',
    created_by_admin_telegram_id: 1,
    locked_by_admin_telegram_id: null,
    workflow_stage: 'completed',
    created_at: new Date(),
    updated_at: new Date(),
  })) as typeof FaqService.getPublishedFaqById;

  SupportService.getTicketMessages = (async () => [
    {
      id: 1,
      ticket_id: 11,
      sender_type: 'user',
      message_text: 'Buyurtmam holatini tekshirib bera olasizmi?',
      photo_file_id: null,
      telegram_message_id: 600,
      group_message_id: null,
      created_at: new Date(),
    },
  ]) as typeof SupportService.getTicketMessages;

  SupportAgentService.generateReply = (async () => ({
    replyText:
      "Sizning murojaatingiz qo'llab-quvvatlash jamoasiga yo'naltirildi. Javob tayyor bo'lgach, shu chatda yuboriladi.",
    shouldEscalate: true,
    escalationReason: 'Buyurtma holatini tekshirish uchun operator aralashuvi kerak.',
  })) as typeof SupportAgentService.generateReply;

  const { ctx, replies } = makeFakeCtx();

  try {
    await processSupportRequest(
      makeFakeApi() as unknown as import('grammy').Api<import('grammy').RawApi>,
      ctx as unknown as import('../../types/context').BotContext,
      makeUser(),
      'Buyurtmam holatini tekshirib bera olasizmi?',
      700,
      undefined,
      'uz',
    );

    assert.equal(replies.length, 2);
    assert.equal(replies[0], "⏳ AI yordamchi so'rovingizni tekshiryapti...");
    assert.equal(
      replies[1],
      "Sizning murojaatingiz qo'llab-quvvatlash jamoasiga yo'naltirildi. Javob tayyor bo'lgach, shu chatda yuboriladi.",
    );
    assert.deepEqual(appendedMessages, [
      'user:Buyurtmam holatini tekshirib bera olasizmi?',
      "system:AI yordamchi murojaatni operatorga yo'naltirdi: Buyurtma holatini tekshirish uchun operator aralashuvi kerak.",
    ]);
  } finally {
    config.SUPPORT_GROUP_ID = originalSupportGroupId;
    SupportService.getOpenAgentTicketByUserTelegramId = originalGetOpenAgentTicketByUserTelegramId;
    SupportService.getLatestOpenUnforwardedTicketByUserTelegramId =
      originalGetLatestOpenUnforwardedTicketByUserTelegramId;
    FaqRoutingService.resolveSupportFaq = originalResolveSupportFaq;
    SupportService.appendMessage = originalAppendMessage;
    SupportService.createTicket = originalCreateTicket;
    SupportService.updateTicketHandling = originalUpdateTicketHandling;
    SupportService.escalateAgentTicket = originalEscalateAgentTicket;
    SupportService.updateGroupMessageId = originalUpdateGroupMessageId;
    SupportService.updateLatestMessageGroupMessageId = originalUpdateLatestMessageGroupMessageId;
    FaqService.getPublishedFaqById = originalGetPublishedFaqById;
    SupportService.getTicketMessages = originalGetTicketMessages;
    SupportAgentService.generateReply = originalGenerateReply;
  }
});

test('processSupportRequest replies to the user before the HTML transcript attachment is sent to admins', async () => {
  const originalSupportGroupId = config.SUPPORT_GROUP_ID;
  const originalGetOpenAgentTicketByUserTelegramId =
    SupportService.getOpenAgentTicketByUserTelegramId;
  const originalGetLatestOpenUnforwardedTicketByUserTelegramId =
    SupportService.getLatestOpenUnforwardedTicketByUserTelegramId;
  const originalResolveSupportFaq = FaqRoutingService.resolveSupportFaq;
  const originalAppendMessage = SupportService.appendMessage;
  const originalCreateTicket = SupportService.createTicket;
  const originalUpdateTicketHandling = SupportService.updateTicketHandling;
  const originalEscalateAgentTicket = SupportService.escalateAgentTicket;
  const originalUpdateGroupMessageId = SupportService.updateGroupMessageId;
  const originalUpdateLatestMessageGroupMessageId =
    SupportService.updateLatestMessageGroupMessageId;
  const originalGetPublishedFaqById = FaqService.getPublishedFaqById;
  const originalGetTicketMessages = SupportService.getTicketMessages;
  const originalGenerateReply = SupportAgentService.generateReply;

  config.SUPPORT_GROUP_ID = '12345';

  SupportService.getOpenAgentTicketByUserTelegramId = (async () =>
    null) as typeof SupportService.getOpenAgentTicketByUserTelegramId;

  SupportService.getLatestOpenUnforwardedTicketByUserTelegramId = (async () =>
    null) as typeof SupportService.getLatestOpenUnforwardedTicketByUserTelegramId;

  FaqRoutingService.resolveSupportFaq = (async () => ({
    faq: {
      id: 9,
      question_uz: 'Nega buyurtmam kechikdi?',
      question_ru: 'Почему задержался мой заказ?',
      question_en: 'Why is my order delayed?',
      answer_uz: '__AGENT_FAQ_9__',
      answer_ru: '__AGENT_FAQ_9__',
      answer_en: '__AGENT_FAQ_9__',
      status: 'published',
      vector_embedding: '[]',
      agent_enabled: true,
      agent_token: '__AGENT_FAQ_9__',
      created_by_admin_telegram_id: 1,
      locked_by_admin_telegram_id: null,
      workflow_stage: 'completed',
      created_at: new Date(),
      updated_at: new Date(),
    },
    resolutionType: 'semantic_ai' as const,
    distance: 0.1,
    confidence: 0.99,
    reason: 'Human support review is required.',
  })) as typeof FaqRoutingService.resolveSupportFaq;

  SupportService.createTicket = (async () =>
    makeLocalTicket()) as typeof SupportService.createTicket;

  SupportService.updateTicketHandling = (async (params) => ({
    ...makeLocalTicket(),
    handling_mode: params.handlingMode,
    matched_faq_id: params.matchedFaqId ?? null,
    agent_token: params.agentToken ?? null,
    agent_escalation_reason: params.agentEscalationReason ?? null,
  })) as typeof SupportService.updateTicketHandling;

  SupportService.escalateAgentTicket = (async (ticketId, reason) => ({
    ...makeLocalTicket(),
    id: ticketId,
    agent_escalation_reason: reason,
    handling_mode: 'human',
  })) as typeof SupportService.escalateAgentTicket;

  SupportService.updateGroupMessageId = (async () =>
    undefined) as typeof SupportService.updateGroupMessageId;

  SupportService.updateLatestMessageGroupMessageId = (async () =>
    undefined) as typeof SupportService.updateLatestMessageGroupMessageId;

  SupportService.appendMessage = (async (params) => ({
    id: 1,
    ticket_id: params.ticketId,
    sender_type: params.senderType,
    message_text: params.messageText,
    photo_file_id: params.photoFileId || null,
    telegram_message_id: params.telegramMessageId || null,
    group_message_id: params.groupMessageId || null,
    created_at: new Date(),
  })) as typeof SupportService.appendMessage;

  FaqService.getPublishedFaqById = (async () => ({
    id: 9,
    question_uz: 'Nega buyurtmam kechikdi?',
    question_ru: 'Почему задержался мой заказ?',
    question_en: 'Why is my order delayed?',
    answer_uz: '__AGENT_FAQ_9__',
    answer_ru: '__AGENT_FAQ_9__',
    answer_en: '__AGENT_FAQ_9__',
    status: 'published',
    vector_embedding: '[]',
    agent_enabled: true,
    agent_token: '__AGENT_FAQ_9__',
    created_by_admin_telegram_id: 1,
    locked_by_admin_telegram_id: null,
    workflow_stage: 'completed',
    created_at: new Date(),
    updated_at: new Date(),
  })) as typeof FaqService.getPublishedFaqById;

  SupportService.getTicketMessages = (async () => [
    {
      id: 1,
      ticket_id: 11,
      sender_type: 'user',
      message_text: 'Buyurtmam holatini tekshirib bera olasizmi?',
      photo_file_id: null,
      telegram_message_id: 600,
      group_message_id: null,
      created_at: new Date(),
    },
  ]) as typeof SupportService.getTicketMessages;

  SupportAgentService.generateReply = (async () => ({
    replyText:
      "Sizning murojaatingiz qo'llab-quvvatlash jamoasiga yo'naltirildi. Javob tayyor bo'lgach, shu chatda yuboriladi.",
    shouldEscalate: true,
    escalationReason: 'Buyurtma holatini tekshirish uchun operator aralashuvi kerak.',
  })) as typeof SupportAgentService.generateReply;

  const events: string[] = [];
  let replyCounter = 100;
  let resolveDocument: (() => void) | undefined;
  let documentFinished = false;

  const ctx = {
    from: {
      id: 55,
      username: 'ali',
    },
    reply: async (text: string) => {
      events.push(`reply:${text}`);
      replyCounter += 1;

      return {
        chat: { id: 55 },
        message_id: replyCounter,
      };
    },
  };

  const api = {
    deleteMessage: async () => undefined,
    sendChatAction: async () => undefined,
    sendMessage: async () => {
      events.push('admin:message');
      return { message_id: 999 };
    },
    sendPhoto: async () => ({ message_id: 999 }),
    sendDocument: async () => {
      events.push('admin:document:start');
      await new Promise<void>((resolve) => {
        resolveDocument = resolve;
      });
      documentFinished = true;
      events.push('admin:document:done');
      return { message_id: 1000 };
    },
  };

  try {
    await processSupportRequest(
      api as unknown as import('grammy').Api<import('grammy').RawApi>,
      ctx as unknown as import('../../types/context').BotContext,
      makeUser(),
      'Buyurtmam holatini tekshirib bera olasizmi?',
      702,
      undefined,
      'uz',
    );

    const userReplyIndex = events.findIndex((entry) =>
      entry.includes("reply:Sizning murojaatingiz qo'llab-quvvatlash jamoasiga yo'naltirildi."),
    );
    const documentStartIndex = events.indexOf('admin:document:start');

    assert.notEqual(userReplyIndex, -1);
    assert.notEqual(documentStartIndex, -1);
    assert.ok(userReplyIndex < documentStartIndex);
    assert.equal(documentFinished, false);

    if (resolveDocument) {
      resolveDocument();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(documentFinished, true);
  } finally {
    if (resolveDocument) {
      resolveDocument();
    }
    config.SUPPORT_GROUP_ID = originalSupportGroupId;
    SupportService.getOpenAgentTicketByUserTelegramId = originalGetOpenAgentTicketByUserTelegramId;
    SupportService.getLatestOpenUnforwardedTicketByUserTelegramId =
      originalGetLatestOpenUnforwardedTicketByUserTelegramId;
    FaqRoutingService.resolveSupportFaq = originalResolveSupportFaq;
    SupportService.appendMessage = originalAppendMessage;
    SupportService.createTicket = originalCreateTicket;
    SupportService.updateTicketHandling = originalUpdateTicketHandling;
    SupportService.escalateAgentTicket = originalEscalateAgentTicket;
    SupportService.updateGroupMessageId = originalUpdateGroupMessageId;
    SupportService.updateLatestMessageGroupMessageId = originalUpdateLatestMessageGroupMessageId;
    FaqService.getPublishedFaqById = originalGetPublishedFaqById;
    SupportService.getTicketMessages = originalGetTicketMessages;
    SupportAgentService.generateReply = originalGenerateReply;
  }
});

test('processSupportRequest falls back to the locale message when the AI agent fails', async () => {
  const originalSupportGroupId = config.SUPPORT_GROUP_ID;
  const originalGetOpenAgentTicketByUserTelegramId =
    SupportService.getOpenAgentTicketByUserTelegramId;
  const originalGetLatestOpenUnforwardedTicketByUserTelegramId =
    SupportService.getLatestOpenUnforwardedTicketByUserTelegramId;
  const originalResolveSupportFaq = FaqRoutingService.resolveSupportFaq;
  const originalAppendMessage = SupportService.appendMessage;
  const originalCreateTicket = SupportService.createTicket;
  const originalUpdateTicketHandling = SupportService.updateTicketHandling;
  const originalEscalateAgentTicket = SupportService.escalateAgentTicket;
  const originalUpdateGroupMessageId = SupportService.updateGroupMessageId;
  const originalUpdateLatestMessageGroupMessageId =
    SupportService.updateLatestMessageGroupMessageId;
  const originalGetPublishedFaqById = FaqService.getPublishedFaqById;
  const originalGetTicketMessages = SupportService.getTicketMessages;
  const originalGenerateReply = SupportAgentService.generateReply;

  const appendedMessages: string[] = [];

  config.SUPPORT_GROUP_ID = '12345';

  SupportService.getOpenAgentTicketByUserTelegramId = (async () =>
    null) as typeof SupportService.getOpenAgentTicketByUserTelegramId;

  SupportService.getLatestOpenUnforwardedTicketByUserTelegramId = (async () =>
    null) as typeof SupportService.getLatestOpenUnforwardedTicketByUserTelegramId;

  FaqRoutingService.resolveSupportFaq = (async () => ({
    faq: {
      id: 10,
      question_uz: 'Menga yordam kerak',
      question_ru: 'Мне нужна помощь',
      question_en: 'I need help',
      answer_uz: '__AGENT_FAQ_10__',
      answer_ru: '__AGENT_FAQ_10__',
      answer_en: '__AGENT_FAQ_10__',
      status: 'published',
      vector_embedding: '[]',
      agent_enabled: true,
      agent_token: '__AGENT_FAQ_10__',
      created_by_admin_telegram_id: 1,
      locked_by_admin_telegram_id: null,
      workflow_stage: 'completed',
      created_at: new Date(),
      updated_at: new Date(),
    },
    resolutionType: 'semantic_ai' as const,
    distance: 0.1,
    confidence: 0.99,
    reason: 'AI support is required.',
  })) as typeof FaqRoutingService.resolveSupportFaq;

  SupportService.createTicket = (async () =>
    makeLocalTicket()) as typeof SupportService.createTicket;

  SupportService.updateTicketHandling = (async (params) => ({
    ...makeLocalTicket(),
    handling_mode: params.handlingMode,
    matched_faq_id: params.matchedFaqId ?? null,
    agent_token: params.agentToken ?? null,
    agent_escalation_reason: params.agentEscalationReason ?? null,
  })) as typeof SupportService.updateTicketHandling;

  SupportService.escalateAgentTicket = (async (ticketId, reason) => ({
    ...makeLocalTicket(),
    id: ticketId,
    agent_escalation_reason: reason,
    handling_mode: 'human',
  })) as typeof SupportService.escalateAgentTicket;

  SupportService.updateGroupMessageId = (async () =>
    undefined) as typeof SupportService.updateGroupMessageId;

  SupportService.updateLatestMessageGroupMessageId = (async () =>
    undefined) as typeof SupportService.updateLatestMessageGroupMessageId;

  SupportService.appendMessage = (async (params) => {
    appendedMessages.push(`${params.senderType}:${params.messageText}`);

    return {
      id: appendedMessages.length,
      ticket_id: params.ticketId,
      sender_type: params.senderType,
      message_text: params.messageText,
      photo_file_id: params.photoFileId || null,
      telegram_message_id: params.telegramMessageId || null,
      group_message_id: params.groupMessageId || null,
      created_at: new Date(),
    };
  }) as typeof SupportService.appendMessage;

  FaqService.getPublishedFaqById = (async () => ({
    id: 10,
    question_uz: 'Menga yordam kerak',
    question_ru: 'Мне нужна помощь',
    question_en: 'I need help',
    answer_uz: '__AGENT_FAQ_10__',
    answer_ru: '__AGENT_FAQ_10__',
    answer_en: '__AGENT_FAQ_10__',
    status: 'published',
    vector_embedding: '[]',
    agent_enabled: true,
    agent_token: '__AGENT_FAQ_10__',
    created_by_admin_telegram_id: 1,
    locked_by_admin_telegram_id: null,
    workflow_stage: 'completed',
    created_at: new Date(),
    updated_at: new Date(),
  })) as typeof FaqService.getPublishedFaqById;

  SupportService.getTicketMessages = (async () => [
    {
      id: 1,
      ticket_id: 11,
      sender_type: 'user',
      message_text: 'Menga yordam kerak',
      photo_file_id: null,
      telegram_message_id: 600,
      group_message_id: null,
      created_at: new Date(),
    },
  ]) as typeof SupportService.getTicketMessages;

  SupportAgentService.generateReply = (async () => {
    throw new Error('Gemini unavailable');
  }) as typeof SupportAgentService.generateReply;

  const { ctx, replies } = makeFakeCtx();

  try {
    await processSupportRequest(
      makeFakeApi() as unknown as import('grammy').Api<import('grammy').RawApi>,
      ctx as unknown as import('../../types/context').BotContext,
      makeUser(),
      'Menga yordam kerak',
      701,
      undefined,
      'uz',
    );

    assert.equal(replies.length, 2);
    assert.equal(replies[0], "⏳ AI yordamchi so'rovingizni tekshiryapti...");
    assert.equal(
      replies[1],
      "❌ Afsuski, murojaatingizni avtomatik qayta ishlash vaqtincha yakunlanmadi. Iltimos, birozdan so'ng qayta urinib ko'ring yoki yangi murojaat yuboring.",
    );
    assert.deepEqual(appendedMessages, [
      'user:Menga yordam kerak',
      "system:AI yordamchi murojaatni operatorga yo'naltirdi: AI agent ishonchli javob tayyorlay olmadi, shu sabab murojaat operatorga yuborildi.",
    ]);
  } finally {
    config.SUPPORT_GROUP_ID = originalSupportGroupId;
    SupportService.getOpenAgentTicketByUserTelegramId = originalGetOpenAgentTicketByUserTelegramId;
    SupportService.getLatestOpenUnforwardedTicketByUserTelegramId =
      originalGetLatestOpenUnforwardedTicketByUserTelegramId;
    FaqRoutingService.resolveSupportFaq = originalResolveSupportFaq;
    SupportService.appendMessage = originalAppendMessage;
    SupportService.createTicket = originalCreateTicket;
    SupportService.updateTicketHandling = originalUpdateTicketHandling;
    SupportService.escalateAgentTicket = originalEscalateAgentTicket;
    SupportService.updateGroupMessageId = originalUpdateGroupMessageId;
    SupportService.updateLatestMessageGroupMessageId = originalUpdateLatestMessageGroupMessageId;
    FaqService.getPublishedFaqById = originalGetPublishedFaqById;
    SupportService.getTicketMessages = originalGetTicketMessages;
    SupportAgentService.generateReply = originalGenerateReply;
  }
});

test('processSupportRequest formats escalated AI handoff replies as Telegram HTML', async () => {
  const originalSupportGroupId = config.SUPPORT_GROUP_ID;
  const originalGetOpenAgentTicketByUserTelegramId =
    SupportService.getOpenAgentTicketByUserTelegramId;
  const originalGetLatestOpenUnforwardedTicketByUserTelegramId =
    SupportService.getLatestOpenUnforwardedTicketByUserTelegramId;
  const originalResolveSupportFaq = FaqRoutingService.resolveSupportFaq;
  const originalAppendMessage = SupportService.appendMessage;
  const originalCreateTicket = SupportService.createTicket;
  const originalUpdateTicketHandling = SupportService.updateTicketHandling;
  const originalEscalateAgentTicket = SupportService.escalateAgentTicket;
  const originalUpdateGroupMessageId = SupportService.updateGroupMessageId;
  const originalUpdateLatestMessageGroupMessageId =
    SupportService.updateLatestMessageGroupMessageId;
  const originalGetPublishedFaqById = FaqService.getPublishedFaqById;
  const originalGetTicketMessages = SupportService.getTicketMessages;
  const originalGenerateReply = SupportAgentService.generateReply;

  config.SUPPORT_GROUP_ID = '12345';

  SupportService.getOpenAgentTicketByUserTelegramId = (async () =>
    null) as typeof SupportService.getOpenAgentTicketByUserTelegramId;

  SupportService.getLatestOpenUnforwardedTicketByUserTelegramId = (async () =>
    null) as typeof SupportService.getLatestOpenUnforwardedTicketByUserTelegramId;

  FaqRoutingService.resolveSupportFaq = (async () => ({
    faq: {
      id: 10,
      question_uz: 'Menga yordam kerak',
      question_ru: 'Мне нужна помощь',
      question_en: 'I need help',
      answer_uz: '__AGENT_FAQ_10__',
      answer_ru: '__AGENT_FAQ_10__',
      answer_en: '__AGENT_FAQ_10__',
      status: 'published',
      vector_embedding: '[]',
      agent_enabled: true,
      agent_token: '__AGENT_FAQ_10__',
      created_by_admin_telegram_id: 1,
      locked_by_admin_telegram_id: null,
      workflow_stage: 'completed',
      created_at: new Date(),
      updated_at: new Date(),
    },
    resolutionType: 'semantic_ai' as const,
    distance: 0.1,
    confidence: 0.99,
    reason: 'AI support is required.',
  })) as typeof FaqRoutingService.resolveSupportFaq;

  SupportService.createTicket = (async () =>
    makeLocalTicket()) as typeof SupportService.createTicket;

  SupportService.updateTicketHandling = (async (params) => ({
    ...makeLocalTicket(),
    handling_mode: params.handlingMode,
    matched_faq_id: params.matchedFaqId ?? null,
    agent_token: params.agentToken ?? null,
    agent_escalation_reason: params.agentEscalationReason ?? null,
  })) as typeof SupportService.updateTicketHandling;

  SupportService.escalateAgentTicket = (async (ticketId, reason) => ({
    ...makeLocalTicket(),
    id: ticketId,
    agent_escalation_reason: reason,
    handling_mode: 'human',
  })) as typeof SupportService.escalateAgentTicket;

  SupportService.updateGroupMessageId = (async () =>
    undefined) as typeof SupportService.updateGroupMessageId;

  SupportService.updateLatestMessageGroupMessageId = (async () =>
    undefined) as typeof SupportService.updateLatestMessageGroupMessageId;

  SupportService.appendMessage = (async (params) => ({
    id: 1,
    ticket_id: params.ticketId,
    sender_type: params.senderType,
    message_text: params.messageText,
    photo_file_id: params.photoFileId || null,
    telegram_message_id: params.telegramMessageId || null,
    group_message_id: params.groupMessageId || null,
    created_at: new Date(),
  })) as typeof SupportService.appendMessage;

  FaqService.getPublishedFaqById = (async () => ({
    id: 10,
    question_uz: 'Menga yordam kerak',
    question_ru: 'Мне нужна помощь',
    question_en: 'I need help',
    answer_uz: '__AGENT_FAQ_10__',
    answer_ru: '__AGENT_FAQ_10__',
    answer_en: '__AGENT_FAQ_10__',
    status: 'published',
    vector_embedding: '[]',
    agent_enabled: true,
    agent_token: '__AGENT_FAQ_10__',
    created_by_admin_telegram_id: 1,
    locked_by_admin_telegram_id: null,
    workflow_stage: 'completed',
    created_at: new Date(),
    updated_at: new Date(),
  })) as typeof FaqService.getPublishedFaqById;

  SupportService.getTicketMessages = (async () => [
    {
      id: 1,
      ticket_id: 11,
      sender_type: 'user',
      message_text: 'Menga yordam kerak',
      photo_file_id: null,
      telegram_message_id: 600,
      group_message_id: null,
      created_at: new Date(),
    },
  ]) as typeof SupportService.getTicketMessages;

  SupportAgentService.generateReply = (async () => ({
    replyText:
      'Tushundim, Muhammadali. Sizni qiziqtirgan **iPhone 16 Pro 128GB White (yangi)** modeli uchun narxni tez orada aniqlab, sizga xabar beraman.',
    shouldEscalate: true,
    escalationReason: 'Narxni qo‘lda aniqlashtirish kerak.',
  })) as typeof SupportAgentService.generateReply;

  const { ctx, replies } = makeFakeCtx();

  try {
    await processSupportRequest(
      makeFakeApi() as unknown as import('grammy').Api<import('grammy').RawApi>,
      ctx as unknown as import('../../types/context').BotContext,
      makeUser(),
      'Menga yordam kerak',
      701,
      undefined,
      'uz',
    );

    assert.equal(replies.length, 2);
    assert.equal(replies[0], "⏳ AI yordamchi so'rovingizni tekshiryapti...");
    assert.equal(
      replies[1],
      'Tushundim, Muhammadali. Sizni qiziqtirgan <b>iPhone 16 Pro 128GB White (yangi)</b> modeli uchun narxni tez orada aniqlab, sizga xabar beraman.',
    );
  } finally {
    config.SUPPORT_GROUP_ID = originalSupportGroupId;
    SupportService.getOpenAgentTicketByUserTelegramId = originalGetOpenAgentTicketByUserTelegramId;
    SupportService.getLatestOpenUnforwardedTicketByUserTelegramId =
      originalGetLatestOpenUnforwardedTicketByUserTelegramId;
    FaqRoutingService.resolveSupportFaq = originalResolveSupportFaq;
    SupportService.appendMessage = originalAppendMessage;
    SupportService.createTicket = originalCreateTicket;
    SupportService.updateTicketHandling = originalUpdateTicketHandling;
    SupportService.escalateAgentTicket = originalEscalateAgentTicket;
    SupportService.updateGroupMessageId = originalUpdateGroupMessageId;
    SupportService.updateLatestMessageGroupMessageId = originalUpdateLatestMessageGroupMessageId;
    FaqService.getPublishedFaqById = originalGetPublishedFaqById;
    SupportService.getTicketMessages = originalGetTicketMessages;
    SupportAgentService.generateReply = originalGenerateReply;
  }
});

test('processSupportRequest routes CRM application requests to the application flow instead of the admin group', async () => {
  const originalSupportGroupId = config.SUPPORT_GROUP_ID;
  const originalGetOpenAgentTicketByUserTelegramId =
    SupportService.getOpenAgentTicketByUserTelegramId;
  const originalGetLatestOpenUnforwardedTicketByUserTelegramId =
    SupportService.getLatestOpenUnforwardedTicketByUserTelegramId;
  const originalResolveSupportFaq = FaqRoutingService.resolveSupportFaq;
  const originalAppendMessage = SupportService.appendMessage;
  const originalCreateTicket = SupportService.createTicket;
  const originalUpdateTicketHandling = SupportService.updateTicketHandling;
  const originalCloseTicket = SupportService.closeTicket;
  const originalEscalateAgentTicket = SupportService.escalateAgentTicket;
  const originalUpdateGroupMessageId = SupportService.updateGroupMessageId;
  const originalUpdateLatestMessageGroupMessageId =
    SupportService.updateLatestMessageGroupMessageId;
  const originalGetPublishedFaqById = FaqService.getPublishedFaqById;
  const originalGetTicketMessages = SupportService.getTicketMessages;
  const originalGenerateReply = SupportAgentService.generateReply;
  const originalRedisSet = redisService.set;

  config.SUPPORT_GROUP_ID = '12345';

  const apiMessages: string[] = [];
  const appendedMessages: string[] = [];
  let closedTicketId: number | null = null;
  let escalated = false;
  let groupMessageUpdated = false;
  const pendingActionSets: Array<{ key: string; value: unknown; expireTime?: number }> = [];

  SupportService.getOpenAgentTicketByUserTelegramId = (async () =>
    null) as typeof SupportService.getOpenAgentTicketByUserTelegramId;

  SupportService.getLatestOpenUnforwardedTicketByUserTelegramId = (async () =>
    null) as typeof SupportService.getLatestOpenUnforwardedTicketByUserTelegramId;

  FaqRoutingService.resolveSupportFaq = (async () => ({
    faq: {
      id: 7,
      question_uz: 'Mahsulot bormi?',
      question_ru: 'Есть товар?',
      question_en: 'Is product available?',
      answer_uz: '__AGENT_FAQ_7__',
      answer_ru: '__AGENT_FAQ_7__',
      answer_en: '__AGENT_FAQ_7__',
      status: 'published',
      vector_embedding: '[]',
      agent_enabled: true,
      agent_token: '__AGENT_FAQ_7__',
      created_by_admin_telegram_id: 1,
      locked_by_admin_telegram_id: null,
      workflow_stage: 'completed',
      created_at: new Date(),
      updated_at: new Date(),
    },
    resolutionType: 'semantic_ai' as const,
    distance: 0.1,
    confidence: 0.99,
    reason: 'Stock-check agent.',
  })) as typeof FaqRoutingService.resolveSupportFaq;

  SupportService.createTicket = (async () =>
    makeLocalTicket()) as typeof SupportService.createTicket;

  SupportService.updateTicketHandling = (async (params) => ({
    ...makeLocalTicket(),
    handling_mode: params.handlingMode,
    matched_faq_id: params.matchedFaqId ?? null,
    agent_token: params.agentToken ?? null,
    agent_escalation_reason: params.agentEscalationReason ?? null,
  })) as typeof SupportService.updateTicketHandling;

  SupportService.escalateAgentTicket = (async () => {
    escalated = true;
    return makeLocalTicket();
  }) as typeof SupportService.escalateAgentTicket;

  SupportService.closeTicket = (async (ticketId) => {
    closedTicketId = ticketId;
    return true;
  }) as typeof SupportService.closeTicket;

  SupportService.updateGroupMessageId = (async () => {
    groupMessageUpdated = true;
  }) as typeof SupportService.updateGroupMessageId;

  SupportService.updateLatestMessageGroupMessageId = (async () =>
    undefined) as typeof SupportService.updateLatestMessageGroupMessageId;

  SupportService.appendMessage = (async (params) => {
    appendedMessages.push(`${params.senderType}:${params.messageText}`);
    return {
      id: appendedMessages.length,
      ticket_id: params.ticketId,
      sender_type: params.senderType,
      message_text: params.messageText,
      photo_file_id: params.photoFileId || null,
      telegram_message_id: params.telegramMessageId || null,
      group_message_id: params.groupMessageId || null,
      created_at: new Date(),
    };
  }) as typeof SupportService.appendMessage;

  FaqService.getPublishedFaqById = (async () => ({
    id: 7,
    question_uz: 'Mahsulot bormi?',
    question_ru: 'Есть товар?',
    question_en: 'Is product available?',
    answer_uz: '__AGENT_FAQ_7__',
    answer_ru: '__AGENT_FAQ_7__',
    answer_en: '__AGENT_FAQ_7__',
    status: 'published',
    vector_embedding: '[]',
    agent_enabled: true,
    agent_token: '__AGENT_FAQ_7__',
    created_by_admin_telegram_id: 1,
    locked_by_admin_telegram_id: null,
    workflow_stage: 'completed',
    created_at: new Date(),
    updated_at: new Date(),
  })) as typeof FaqService.getPublishedFaqById;

  SupportService.getTicketMessages = (async () => [
    {
      id: 1,
      ticket_id: 11,
      sender_type: 'user',
      message_text: 'ha',
      photo_file_id: null,
      telegram_message_id: 600,
      group_message_id: null,
      created_at: new Date(),
    },
  ]) as typeof SupportService.getTicketMessages;

  SupportAgentService.generateReply = (async () => ({
    replyText: 'Arizani boshlaymiz.',
    shouldEscalate: true,
    escalationReason: 'CRM application requested',
  })) as typeof SupportAgentService.generateReply;

  redisService.set = (async (key, value, expireTime) => {
    pendingActionSets.push({ key, value, expireTime });
    return 'OK';
  }) as typeof redisService.set;

  const { ctx, replies } = makeFakeCtx();
  const api = {
    ...makeFakeApi(),
    sendMessage: async (_chatId: number, text: string) => {
      apiMessages.push(text);
      return { message_id: 999 };
    },
  };

  try {
    await processSupportRequest(
      api as unknown as import('grammy').Api<import('grammy').RawApi>,
      ctx as unknown as import('../../types/context').BotContext,
      makeUser(),
      'ha',
      701,
      undefined,
      'uz',
      false,
      { deferred: true },
    );

    assert.equal(replies.length, 0);
    assert.deepEqual(apiMessages, [
      "⏳ AI yordamchi so'rovingizni tekshiryapti...",
      "✅ Tushunarli, ariza qoldirish bo'limiga o'tamiz. Davom etish uchun tugmani bosing.",
    ]);
    assert.deepEqual(pendingActionSets, [
      { key: 'pendingAction:55', value: 'application', expireTime: 3600 },
    ]);
    assert.equal(closedTicketId, 11);
    assert.equal(escalated, false);
    assert.equal(groupMessageUpdated, false);
    assert.deepEqual(appendedMessages, [
      'user:ha',
      "system:AI yordamchi murojaatni ariza qoldirish jarayoniga o'tkazdi: CRM application requested",
    ]);
  } finally {
    config.SUPPORT_GROUP_ID = originalSupportGroupId;
    SupportService.getOpenAgentTicketByUserTelegramId = originalGetOpenAgentTicketByUserTelegramId;
    SupportService.getLatestOpenUnforwardedTicketByUserTelegramId =
      originalGetLatestOpenUnforwardedTicketByUserTelegramId;
    FaqRoutingService.resolveSupportFaq = originalResolveSupportFaq;
    SupportService.appendMessage = originalAppendMessage;
    SupportService.createTicket = originalCreateTicket;
    SupportService.updateTicketHandling = originalUpdateTicketHandling;
    SupportService.closeTicket = originalCloseTicket;
    SupportService.escalateAgentTicket = originalEscalateAgentTicket;
    SupportService.updateGroupMessageId = originalUpdateGroupMessageId;
    SupportService.updateLatestMessageGroupMessageId = originalUpdateLatestMessageGroupMessageId;
    FaqService.getPublishedFaqById = originalGetPublishedFaqById;
    SupportService.getTicketMessages = originalGetTicketMessages;
    SupportAgentService.generateReply = originalGenerateReply;
    redisService.set = originalRedisSet;
  }
});

test('processSupportRequest stores an early FAQ exchange and reuses the same ticket when the conversation later upgrades to AI support', async () => {
  const originalGetOpenAgentTicketByUserTelegramId =
    SupportService.getOpenAgentTicketByUserTelegramId;
  const originalGetLatestOpenUnforwardedTicketByUserTelegramId =
    SupportService.getLatestOpenUnforwardedTicketByUserTelegramId;
  const originalResolveSupportFaq = FaqRoutingService.resolveSupportFaq;
  const originalAppendMessage = SupportService.appendMessage;
  const originalCreateTicket = SupportService.createTicket;
  const originalSyncTicketPreviewMessage = SupportService.syncTicketPreviewMessage;
  const originalUpdateTicketHandling = SupportService.updateTicketHandling;
  const originalGetPublishedFaqById = FaqService.getPublishedFaqById;
  const originalGetTicketMessages = SupportService.getTicketMessages;
  const originalGenerateReply = SupportAgentService.generateReply;

  const localTicket = makeLocalTicket();
  const storedMessages: Array<{
    senderType: string;
    messageText: string;
    ticketId: number;
  }> = [];
  const generatedHistorySizes: number[] = [];
  let createTicketCallCount = 0;
  let ticketMode: 'human' | 'agent' = 'human';
  let latestMessageText = localTicket.message_text;
  let latestMessageId: number | undefined = localTicket.message_id;

  SupportService.getOpenAgentTicketByUserTelegramId = (async () =>
    null) as typeof SupportService.getOpenAgentTicketByUserTelegramId;

  SupportService.getLatestOpenUnforwardedTicketByUserTelegramId = (async () => {
    if (storedMessages.length === 0) {
      return null;
    }

    return {
      ...localTicket,
      handling_mode: ticketMode,
      message_text: latestMessageText,
      message_id: latestMessageId,
    };
  }) as typeof SupportService.getLatestOpenUnforwardedTicketByUserTelegramId;

  let resolutionCall = 0;
  FaqRoutingService.resolveSupportFaq = (async () => {
    resolutionCall += 1;

    if (resolutionCall === 1) {
      return {
        faq: {
          id: 4,
          question_uz: 'Dostavka bormi?',
          question_ru: 'Есть ли доставка?',
          question_en: 'Do you offer delivery?',
          answer_uz: 'Ha, bizda dostavka mavjud.',
          answer_ru: 'Да, у нас есть доставка.',
          answer_en: 'Yes, we offer delivery.',
          status: 'published',
          vector_embedding: '[]',
          agent_enabled: false,
          agent_token: null,
          created_by_admin_telegram_id: 1,
          locked_by_admin_telegram_id: null,
          workflow_stage: 'completed',
          created_at: new Date(),
          updated_at: new Date(),
        },
        resolutionType: 'semantic' as const,
        distance: 0.2,
        confidence: 1,
        reason: 'Top semantic FAQ candidate cleared the static auto-reply threshold.',
      };
    }

    return {
      faq: {
        id: 7,
        question_uz: 'Qaysi telefonlar bor?',
        question_ru: 'Какие телефоны есть?',
        question_en: 'What phones do you have?',
        answer_uz: '__AGENT_FAQ_7__',
        answer_ru: '__AGENT_FAQ_7__',
        answer_en: '__AGENT_FAQ_7__',
        status: 'published',
        vector_embedding: '[]',
        agent_enabled: true,
        agent_token: '__AGENT_FAQ_7__',
        created_by_admin_telegram_id: 1,
        locked_by_admin_telegram_id: null,
        workflow_stage: 'completed',
        created_at: new Date(),
        updated_at: new Date(),
      },
      resolutionType: 'semantic_ai' as const,
      distance: 0.15,
      confidence: 0.95,
      reason: 'AI inventory support agent should handle this request.',
    };
  }) as typeof FaqRoutingService.resolveSupportFaq;

  SupportService.createTicket = (async (params) => {
    createTicketCallCount += 1;
    latestMessageText = params.messageText;
    latestMessageId = params.messageId;

    return {
      ...localTicket,
      message_text: params.messageText,
      message_id: params.messageId,
    };
  }) as typeof SupportService.createTicket;

  SupportService.syncTicketPreviewMessage = (async (params) => {
    latestMessageText = params.messageText;
    latestMessageId = params.messageId ?? undefined;
  }) as typeof SupportService.syncTicketPreviewMessage;

  SupportService.appendMessage = (async (params) => {
    storedMessages.push({
      ticketId: params.ticketId,
      senderType: params.senderType,
      messageText: params.messageText,
    });

    return {
      id: storedMessages.length,
      ticket_id: params.ticketId,
      sender_type: params.senderType,
      message_text: params.messageText,
      photo_file_id: params.photoFileId || null,
      telegram_message_id: params.telegramMessageId || null,
      group_message_id: params.groupMessageId || null,
      created_at: new Date(),
    };
  }) as typeof SupportService.appendMessage;

  SupportService.updateTicketHandling = (async (params) => {
    ticketMode = params.handlingMode;

    return {
      ...localTicket,
      handling_mode: params.handlingMode,
      matched_faq_id: params.matchedFaqId ?? null,
      agent_token: params.agentToken ?? null,
      agent_escalation_reason: params.agentEscalationReason ?? null,
      message_text: latestMessageText,
      message_id: latestMessageId,
    };
  }) as typeof SupportService.updateTicketHandling;

  FaqService.getPublishedFaqById = (async () => ({
    id: 7,
    question_uz: 'Qaysi telefonlar bor?',
    question_ru: 'Какие телефоны есть?',
    question_en: 'What phones do you have?',
    answer_uz: '__AGENT_FAQ_7__',
    answer_ru: '__AGENT_FAQ_7__',
    answer_en: '__AGENT_FAQ_7__',
    status: 'published',
    vector_embedding: '[]',
    agent_enabled: true,
    agent_token: '__AGENT_FAQ_7__',
    created_by_admin_telegram_id: 1,
    locked_by_admin_telegram_id: null,
    workflow_stage: 'completed',
    created_at: new Date(),
    updated_at: new Date(),
  })) as typeof FaqService.getPublishedFaqById;

  SupportService.getTicketMessages = (async () =>
    storedMessages.map((message, index) => ({
      id: index + 1,
      ticket_id: message.ticketId,
      sender_type: message.senderType as 'user' | 'agent' | 'admin' | 'system',
      message_text: message.messageText,
      photo_file_id: null,
      telegram_message_id: null,
      group_message_id: null,
      created_at: new Date(),
    }))) as typeof SupportService.getTicketMessages;

  SupportAgentService.generateReply = (async ({ history }) => {
    generatedHistorySizes.push(history.length);

    return {
      replyText: 'Mana mavjud modellarni yuboraman.',
      shouldEscalate: false,
      escalationReason: '',
    };
  }) as typeof SupportAgentService.generateReply;

  const { ctx, replies } = makeFakeCtx();

  try {
    await processSupportRequest(
      makeFakeApi() as unknown as import('grammy').Api<import('grammy').RawApi>,
      ctx as unknown as import('../../types/context').BotContext,
      makeUser(),
      'Assalomu alaykum, silada dostavka bormi',
      610,
      undefined,
      'uz',
    );

    latestMessageText = 'Silada qanaqa telefonla bor, katalogi bomi';
    latestMessageId = 611;

    await processSupportRequest(
      makeFakeApi() as unknown as import('grammy').Api<import('grammy').RawApi>,
      ctx as unknown as import('../../types/context').BotContext,
      makeUser(),
      'Silada qanaqa telefonla bor, katalogi bomi',
      611,
      undefined,
      'uz',
    );

    assert.equal(createTicketCallCount, 1);
    assert.deepEqual(
      storedMessages.map((message) => `${message.senderType}:${message.messageText}`),
      [
        'user:Assalomu alaykum, silada dostavka bormi',
        'agent:Ha, bizda dostavka mavjud.',
        'user:Silada qanaqa telefonla bor, katalogi bomi',
        'agent:Mana mavjud modellarni yuboraman.',
      ],
    );
    assert.deepEqual(generatedHistorySizes, [3]);
    assert.equal(replies[1], 'Ha, bizda dostavka mavjud.');
    assert.equal(replies[3], 'Mana mavjud modellarni yuboraman.');
  } finally {
    SupportService.getOpenAgentTicketByUserTelegramId = originalGetOpenAgentTicketByUserTelegramId;
    SupportService.getLatestOpenUnforwardedTicketByUserTelegramId =
      originalGetLatestOpenUnforwardedTicketByUserTelegramId;
    FaqRoutingService.resolveSupportFaq = originalResolveSupportFaq;
    SupportService.appendMessage = originalAppendMessage;
    SupportService.createTicket = originalCreateTicket;
    SupportService.syncTicketPreviewMessage = originalSyncTicketPreviewMessage;
    SupportService.updateTicketHandling = originalUpdateTicketHandling;
    FaqService.getPublishedFaqById = originalGetPublishedFaqById;
    SupportService.getTicketMessages = originalGetTicketMessages;
    SupportAgentService.generateReply = originalGenerateReply;
  }
});
