import test from 'node:test';
import assert from 'node:assert/strict';

import { FaqRecord } from '../types/faq.types';
import { SupportTicketMessage } from '../types/support.types';
import { GeminiService } from './gemini.service';
import { SupportAgentService } from './support-agent.service';
import { SupportItemAvailabilityService } from './support-item-availability.service';
import { User } from './user.service';

const AGENT_TOKEN = '__AGENT_FAQ_12__';

const makeFaq = (): FaqRecord => ({
  id: 12,
  question_uz: 'Savol',
  question_ru: 'Вопрос',
  question_en: 'Question',
  answer_uz: AGENT_TOKEN,
  answer_ru: AGENT_TOKEN,
  answer_en: AGENT_TOKEN,
  status: 'published',
  vector_embedding: '[]',
  agent_enabled: true,
  agent_token: AGENT_TOKEN,
  created_by_admin_telegram_id: 1,
  locked_by_admin_telegram_id: null,
  workflow_stage: 'completed',
  created_at: new Date(),
  updated_at: new Date(),
});

const makeUser = (): User => ({
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

const makeHistory = (): SupportTicketMessage[] => [
  {
    id: 1,
    ticket_id: 99,
    sender_type: 'user',
    message_text: 'Menga yordam kerak',
    photo_file_id: null,
    telegram_message_id: 111,
    group_message_id: null,
    created_at: new Date(),
  },
];

const makeInventoryResult = (query: string) => ({
  ok: true,
  query,
  store: null,
  total_matches: 1,
  returned_matches: 1,
  items: [
    {
      item_code: 'IP16',
      item_name: 'iPhone 16',
      store_code: 'W01',
      store_name: 'Nurafshon',
      on_hand: 3,
      sale_price: 12000000,
      item_group_name: 'Phones',
      model: 'iPhone 16',
      color: 'Black',
      memory: '128GB',
      condition: 'Yangi',
      sim_type: 'eSIM',
    },
  ],
});

test('SupportAgentService returns parsed Gemini reply payload', async () => {
  const originalGenerateJsonWithTools = GeminiService.generateJsonWithTools;

  GeminiService.generateJsonWithTools = (async () => ({
    reply_text: 'Albatta, yordam beraman.',
    should_escalate: false,
    escalation_reason: '',
  })) as typeof GeminiService.generateJsonWithTools;

  try {
    const result = await SupportAgentService.generateReply({
      faq: makeFaq(),
      user: makeUser(),
      history: makeHistory(),
      latestUserMessage: 'To‘lovni qanday tekshiraman?',
    });

    assert.equal(result.replyText, 'Albatta, yordam beraman.');
    assert.equal(result.shouldEscalate, false);
    assert.equal(result.escalationReason, '');
  } finally {
    GeminiService.generateJsonWithTools = originalGenerateJsonWithTools;
  }
});

test('SupportAgentService rejects empty non-escalation replies', async () => {
  const originalGenerateJsonWithTools = GeminiService.generateJsonWithTools;

  GeminiService.generateJsonWithTools = (async () => ({
    reply_text: '',
    should_escalate: false,
    escalation_reason: '',
  })) as typeof GeminiService.generateJsonWithTools;

  try {
    await assert.rejects(
      () =>
        SupportAgentService.generateReply({
          faq: makeFaq(),
          user: makeUser(),
          history: makeHistory(),
          latestUserMessage: 'To‘lovni qanday tekshiraman?',
        }),
      /empty reply/i,
    );
  } finally {
    GeminiService.generateJsonWithTools = originalGenerateJsonWithTools;
  }
});

test('SupportAgentService includes natural tone and conversion tool guidance in the prompt', async () => {
  const originalGenerateJsonWithTools = GeminiService.generateJsonWithTools;

  let capturedPrompt = '';
  let capturedToolNames: string[] = [];

  GeminiService.generateJsonWithTools = (async (params) => {
    capturedPrompt = params.prompt;
    capturedToolNames = params.tools.map((tool) => tool.declaration.name);

    return {
      reply_text: 'Taxminan 1 477 USD bo‘ladi.',
      should_escalate: false,
      escalation_reason: '',
    };
  }) as typeof GeminiService.generateJsonWithTools;

  try {
    await SupportAgentService.generateReply({
      faq: makeFaq(),
      user: makeUser(),
      history: makeHistory(),
      latestUserMessage: 'Bu dollarda qancha bo‘ladi?',
    });

    assert.match(capturedPrompt, /Do not repeat the customer name in every message/i);
    assert.match(capturedPrompt, /convert_currency_amount/i);
    assert.match(
      capturedPrompt,
      /Prefer answering the customer directly instead of escalating for simple price conversion questions/i,
    );
    assert.deepEqual(capturedToolNames, [
      'lookup_store_items',
      'lookup_currency_rate',
      'convert_currency_amount',
    ]);
  } finally {
    GeminiService.generateJsonWithTools = originalGenerateJsonWithTools;
  }
});

test('SupportAgentService exposes the Gemini inventory tool that delegates to item lookup', async () => {
  const originalGenerateJsonWithTools = GeminiService.generateJsonWithTools;
  const originalLookupAvailableItems = SupportItemAvailabilityService.lookupAvailableItems;

  let executedToolResult: unknown = null;

  SupportItemAvailabilityService.lookupAvailableItems = (async (params) => ({
    ok: true,
    query: params.query,
    store: params.store || null,
    total_matches: 1,
    returned_matches: 1,
    items: [
      {
        item_code: 'IP16',
        item_name: 'iPhone 16',
        store_code: 'W01',
        store_name: 'Nurafshon',
        on_hand: 3,
        sale_price: 12000000,
        item_group_name: 'Phones',
        model: 'iPhone 16',
        color: 'Black',
        memory: '128GB',
        condition: 'Yangi',
        sim_type: 'eSIM',
      },
    ],
  })) as typeof SupportItemAvailabilityService.lookupAvailableItems;

  GeminiService.generateJsonWithTools = (async (params) => {
    const inventoryTool = params.tools.find(
      (tool) => tool.declaration.name === 'lookup_store_items',
    );

    assert.ok(inventoryTool);

    executedToolResult = await inventoryTool.execute({
      query: 'iphone 16',
      store: 'Nurafshon',
      limit: '7',
    });

    return {
      reply_text: 'Nurafshon filialida mavjud.',
      should_escalate: false,
      escalation_reason: '',
    };
  }) as typeof GeminiService.generateJsonWithTools;

  try {
    const result = await SupportAgentService.generateReply({
      faq: makeFaq(),
      user: makeUser(),
      history: makeHistory(),
      latestUserMessage: 'Nurafshonda iPhone 16 bormi?',
    });

    assert.equal(result.replyText, 'Nurafshon filialida mavjud.');
    assert.deepEqual(executedToolResult, {
      ok: true,
      query: 'iphone 16',
      store: 'Nurafshon',
      total_matches: 1,
      returned_matches: 1,
      items: [
        {
          item_code: 'IP16',
          item_name: 'iPhone 16',
          store_code: 'W01',
          store_name: 'Nurafshon',
          on_hand: 3,
          sale_price: 12000000,
          item_group_name: 'Phones',
          model: 'iPhone 16',
          color: 'Black',
          memory: '128GB',
          condition: 'Yangi',
          sim_type: 'eSIM',
        },
      ],
    });
  } finally {
    GeminiService.generateJsonWithTools = originalGenerateJsonWithTools;
    SupportItemAvailabilityService.lookupAvailableItems = originalLookupAvailableItems;
  }
});

test('SupportAgentService preloads live inventory context for direct availability questions', async () => {
  const originalGenerateJsonWithTools = GeminiService.generateJsonWithTools;
  const originalLookupAvailableItems = SupportItemAvailabilityService.lookupAvailableItems;

  let capturedPrompt = '';
  let preloadedQuery = '';

  SupportItemAvailabilityService.lookupAvailableItems = (async (params) => {
    preloadedQuery = params.query;
    return makeInventoryResult(params.query);
  }) as typeof SupportItemAvailabilityService.lookupAvailableItems;

  GeminiService.generateJsonWithTools = (async (params) => {
    capturedPrompt = params.prompt;

    return {
      reply_text: 'Ha, hozir ayrim variantlari mavjud.',
      should_escalate: false,
      escalation_reason: '',
    };
  }) as typeof GeminiService.generateJsonWithTools;

  try {
    await SupportAgentService.generateReply({
      faq: makeFaq(),
      user: makeUser(),
      history: makeHistory(),
      latestUserMessage: 'iPhone 17 olmoqchiman, sizlarda bormi?',
    });

    assert.equal(preloadedQuery, 'iphone 17');
    assert.match(
      capturedPrompt,
      /Do not reject a product as nonexistent, unreleased, or impossible/i,
    );
    assert.match(capturedPrompt, /Inventory pre-check:/);
    assert.match(capturedPrompt, /"query": "iphone 17"/);
    assert.match(capturedPrompt, /"returned_matches": 1/);
  } finally {
    GeminiService.generateJsonWithTools = originalGenerateJsonWithTools;
    SupportItemAvailabilityService.lookupAvailableItems = originalLookupAvailableItems;
  }
});

test('SupportAgentService derives follow-up inventory queries from prior context for model-only questions', async () => {
  const originalGenerateJsonWithTools = GeminiService.generateJsonWithTools;
  const originalLookupAvailableItems = SupportItemAvailabilityService.lookupAvailableItems;

  let preloadedQuery = '';

  SupportItemAvailabilityService.lookupAvailableItems = (async (params) => {
    preloadedQuery = params.query;
    return makeInventoryResult(params.query);
  }) as typeof SupportItemAvailabilityService.lookupAvailableItems;

  GeminiService.generateJsonWithTools = (async () => ({
    reply_text: 'iPhone 16 bo‘yicha ham variantlar bor.',
    should_escalate: false,
    escalation_reason: '',
  })) as typeof GeminiService.generateJsonWithTools;

  try {
    await SupportAgentService.generateReply({
      faq: makeFaq(),
      user: makeUser(),
      history: [
        {
          id: 1,
          ticket_id: 99,
          sender_type: 'user',
          message_text: 'iPhone 17 olmoqchiman, sizlarda bormi',
          photo_file_id: null,
          telegram_message_id: 111,
          group_message_id: null,
          created_at: new Date(),
        },
        {
          id: 2,
          ticket_id: 99,
          sender_type: 'agent',
          message_text: 'Omborni tekshirib beraman.',
          photo_file_id: null,
          telegram_message_id: 112,
          group_message_id: null,
          created_at: new Date(),
        },
      ],
      latestUserMessage: '16 modellarichi',
    });

    assert.equal(preloadedQuery, 'iphone 16');
  } finally {
    GeminiService.generateJsonWithTools = originalGenerateJsonWithTools;
    SupportItemAvailabilityService.lookupAvailableItems = originalLookupAvailableItems;
  }
});

test('SupportAgentService reuses the previous product query for warehouse-check follow-ups', async () => {
  const originalGenerateJsonWithTools = GeminiService.generateJsonWithTools;
  const originalLookupAvailableItems = SupportItemAvailabilityService.lookupAvailableItems;

  let preloadedQuery = '';

  SupportItemAvailabilityService.lookupAvailableItems = (async (params) => {
    preloadedQuery = params.query;
    return makeInventoryResult(params.query);
  }) as typeof SupportItemAvailabilityService.lookupAvailableItems;

  GeminiService.generateJsonWithTools = (async () => ({
    reply_text: 'Tekshirib ko‘rdim, omborda bor.',
    should_escalate: false,
    escalation_reason: '',
  })) as typeof GeminiService.generateJsonWithTools;

  try {
    await SupportAgentService.generateReply({
      faq: makeFaq(),
      user: makeUser(),
      history: [
        {
          id: 1,
          ticket_id: 99,
          sender_type: 'user',
          message_text: 'iPhone 17 olmoqchiman, sizlarda bormi',
          photo_file_id: null,
          telegram_message_id: 111,
          group_message_id: null,
          created_at: new Date(),
        },
      ],
      latestUserMessage: 'Balki omborni tekshirish kerakdir',
    });

    assert.equal(preloadedQuery, 'iphone 17');
  } finally {
    GeminiService.generateJsonWithTools = originalGenerateJsonWithTools;
    SupportItemAvailabilityService.lookupAvailableItems = originalLookupAvailableItems;
  }
});
