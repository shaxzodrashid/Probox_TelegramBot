import test from 'node:test';
import assert from 'node:assert/strict';

import { SupportTicketMessage } from '../../types/support.types';
import { GeminiService } from '../gemini.service';
import { SupportAgentService } from './support-agent.service';
import { SupportInstallmentService } from './support-installment.service';
import { SupportItemAvailabilityService } from './support-item-availability.service';
import { User } from '../user.service';

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
  search: query,
  query,
  store: null,
  requested_filters: {
    model: null,
    device_type: null,
    memory: null,
    color: null,
    sim_type: null,
    condition: null,
  },
  exact_match: true,
  no_exact_match: false,
  no_exact_match_message: null,
  total_matches: 1,
  returned_matches: 1,
  items: [
    {
      item_code: 'IP16',
      imei: '123456789012345',
      item_name: 'iPhone 16',
      store_code: 'W01',
      store_name: 'Nurafshon',
      on_hand: 3,
      sale_price: 12000000,
      item_group_name: 'Phones',
      model: 'iPhone 16',
      device_type: null,
      color: 'Black',
      memory: '128GB',
      condition: 'Yangi',
      sim_type: 'eSIM',
    },
  ],
  suggestions: null,
});

const makeEmptyInventoryResult = (query: string) => ({
  ok: true,
  search: query,
  query,
  store: null,
  requested_filters: {
    model: null,
    device_type: null,
    memory: null,
    color: null,
    sim_type: null,
    condition: null,
  },
  exact_match: false,
  no_exact_match: true,
  no_exact_match_message: null,
  total_matches: 0,
  returned_matches: 0,
  items: [],
  suggestions: null,
});

const makeAlternativeInventoryResult = (query: string) => ({
  ok: true,
  search: query,
  query,
  store: null,
  requested_filters: {
    model: null,
    device_type: null,
    memory: null,
    color: null,
    sim_type: null,
    condition: null,
  },
  exact_match: true,
  no_exact_match: false,
  no_exact_match_message: null,
  total_matches: 3,
  returned_matches: 3,
  items: [
    {
      item_code: 'IP16',
      imei: null,
      item_name: 'iPhone 16',
      store_code: 'W01',
      store_name: 'Nurafshon',
      on_hand: 4,
      sale_price: 12000000,
      item_group_name: 'Phones',
      model: 'iPhone 16',
      device_type: null,
      color: 'Black',
      memory: '128GB',
      condition: 'Yangi',
      sim_type: 'eSIM',
    },
    {
      item_code: 'IP16P',
      imei: null,
      item_name: 'iPhone 16 Pro',
      store_code: 'W02',
      store_name: 'Samarqand Darvoza',
      on_hand: 2,
      sale_price: 16500000,
      item_group_name: 'Phones',
      model: 'iPhone 16',
      device_type: 'Pro',
      color: 'Natural',
      memory: '256GB',
      condition: 'Yangi',
      sim_type: 'eSIM',
    },
    {
      item_code: 'IP15PM',
      imei: null,
      item_name: 'iPhone 15 Pro Max',
      store_code: 'W03',
      store_name: 'Compass',
      on_hand: 1,
      sale_price: 17000000,
      item_group_name: 'Phones',
      model: 'iPhone 15',
      device_type: 'Pro Max',
      color: 'Blue',
      memory: '256GB',
      condition: 'Yangi',
      sim_type: 'eSIM',
    },
  ],
  suggestions: null,
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

test('SupportAgentService does not preload inventory for unrelated non-stock check wording', async () => {
  const originalGenerateJsonWithTools = GeminiService.generateJsonWithTools;
  const originalLookupAvailableItems = SupportItemAvailabilityService.lookupAvailableItems;

  let inventoryLookupCallCount = 0;
  let capturedPrompt = '';

  SupportItemAvailabilityService.lookupAvailableItems = (async (params) => {
    inventoryLookupCallCount += 1;
    return makeInventoryResult(params.query);
  }) as typeof SupportItemAvailabilityService.lookupAvailableItems;

  GeminiService.generateJsonWithTools = (async (params) => {
    capturedPrompt = params.prompt;

    return {
      reply_text: 'To‘lov holatini tekshirish uchun sizga yordam beraman.',
      should_escalate: false,
      escalation_reason: '',
    };
  }) as typeof GeminiService.generateJsonWithTools;

  try {
    const result = await SupportAgentService.generateReply({
      user: makeUser(),
      history: makeHistory(),
      latestUserMessage: 'To‘lovni qanday tekshiraman?',
    });

    assert.equal(result.replyText, 'To‘lov holatini tekshirish uchun sizga yordam beraman.');
    assert.equal(inventoryLookupCallCount, 0);
    assert.match(capturedPrompt, /"query": null/);
    assert.match(capturedPrompt, /"result": null/);
    assert.match(capturedPrompt, /User profile:/);
    assert.match(capturedPrompt, /Conversation transcript:/);
    assert.doesNotMatch(capturedPrompt, /Matched FAQ metadata/i);
    assert.doesNotMatch(
      capturedPrompt,
      /question_uz|question_ru|question_en|answer_uz|answer_ru|answer_en/,
    );
  } finally {
    GeminiService.generateJsonWithTools = originalGenerateJsonWithTools;
    SupportItemAvailabilityService.lookupAvailableItems = originalLookupAvailableItems;
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

test('SupportAgentService preserves an AI handoff note when escalation is requested', async () => {
  const originalGenerateJsonWithTools = GeminiService.generateJsonWithTools;

  GeminiService.generateJsonWithTools = (async () => ({
    reply_text: 'Murojaatingizni qo‘llab-quvvatlash jamoasiga yo‘naltirdim.',
    should_escalate: true,
    escalation_reason: 'Needs human review.',
  })) as typeof GeminiService.generateJsonWithTools;

  try {
    const result = await SupportAgentService.generateReply({
      user: makeUser(),
      history: makeHistory(),
      latestUserMessage: 'Buyurtmam qayerda?',
    });

    assert.equal(result.shouldEscalate, true);
    assert.equal(result.replyText, 'Murojaatingizni qo‘llab-quvvatlash jamoasiga yo‘naltirdim.');
    assert.equal(result.escalationReason, 'Needs human review.');
  } finally {
    GeminiService.generateJsonWithTools = originalGenerateJsonWithTools;
  }
});

test('SupportAgentService escalates explicit admin handoff requests without calling Gemini', async () => {
  const originalGenerateJsonWithTools = GeminiService.generateJsonWithTools;
  let geminiCalled = false;

  GeminiService.generateJsonWithTools = (async () => {
    geminiCalled = true;
    throw new Error('Gemini should not run for explicit handoff requests');
  }) as typeof GeminiService.generateJsonWithTools;

  try {
    const result = await SupportAgentService.generateReply({
      user: makeUser(),
      history: makeHistory(),
      latestUserMessage: 'adminlaga etib qoyin shuni',
    });

    assert.equal(geminiCalled, false);
    assert.equal(result.shouldEscalate, true);
    assert.match(result.replyText, /qo'llab-quvvatlash jamoasiga yo'naltirdim/i);
    assert.match(result.escalationReason, /operator|admin/i);
  } finally {
    GeminiService.generateJsonWithTools = originalGenerateJsonWithTools;
  }
});

test('SupportAgentService accepts an empty reply when escalation is requested', async () => {
  const originalGenerateJsonWithTools = GeminiService.generateJsonWithTools;

  GeminiService.generateJsonWithTools = (async () => ({
    reply_text: '',
    should_escalate: true,
    escalation_reason: 'Needs manual review.',
  })) as typeof GeminiService.generateJsonWithTools;

  try {
    const result = await SupportAgentService.generateReply({
      user: makeUser(),
      history: makeHistory(),
      latestUserMessage: 'Buyurtmam qayerda?',
    });

    assert.equal(result.shouldEscalate, true);
    assert.equal(result.replyText, '');
    assert.equal(result.escalationReason, 'Needs manual review.');
  } finally {
    GeminiService.generateJsonWithTools = originalGenerateJsonWithTools;
  }
});

test('SupportAgentService passes system instructions, focused tool config, and schema to Gemini', async () => {
  const originalGenerateJsonWithTools = GeminiService.generateJsonWithTools;

  let capturedPrompt = '';
  let capturedSystemInstruction: string | string[] | undefined;
  let capturedToolNames: string[] = [];
  let capturedResponseSchema: Record<string, unknown> | undefined;
  let capturedFunctionCallingMode = '';
  let capturedMaxToolIterations: number | undefined;

  GeminiService.generateJsonWithTools = (async (params) => {
    capturedPrompt = params.prompt;
    capturedSystemInstruction = params.systemInstruction;
    capturedToolNames = params.tools.map((tool) => tool.declaration.name);
    capturedResponseSchema = params.responseSchema;
    capturedFunctionCallingMode = params.functionCallingConfig?.mode || '';
    capturedMaxToolIterations = params.maxToolIterations;

    return {
      reply_text: 'Taxminan 1 477 USD bo‘ladi.',
      should_escalate: false,
      escalation_reason: '',
    };
  }) as typeof GeminiService.generateJsonWithTools;

  try {
    await SupportAgentService.generateReply({
      user: makeUser(),
      history: [
        ...makeHistory(),
        {
          id: 2,
          ticket_id: 99,
          sender_type: 'agent',
          message_text: "Narxi 18 467 000 so'm bo'ladi.",
          photo_file_id: null,
          telegram_message_id: 112,
          group_message_id: null,
          created_at: new Date(),
        },
      ],
      latestUserMessage: 'Bu dollarda qancha bo‘ladi?',
    });

    assert.ok(Array.isArray(capturedSystemInstruction));
    assert.match(
      capturedSystemInstruction.join('\n'),
      /Return raw JSON only with exactly: reply_text, should_escalate, escalation_reason/i,
    );
    assert.match(
      capturedSystemInstruction.join('\n'),
      /Format reply_text for Telegram for easy scanning: short readable blocks, blank lines between sections, compact bullets for lists, and bold labels with Telegram HTML/i,
    );
    assert.match(
      capturedSystemInstruction.join('\n'),
      /one direct summary sentence, then bullets grouped by branch\/option\/payment detail, then one concise CTA/i,
    );
    assert.match(
      capturedSystemInstruction.join('\n'),
      /Do not bury prices, monthly payments, stock counts, or down payments inside long paragraphs/i,
    );
    assert.match(
      capturedSystemInstruction.join('\n'),
      /Never do manual arithmetic for prices, currency conversions, installment payments, discounts, or totals/i,
    );
    assert.match(
      capturedSystemInstruction.join('\n'),
      /Do not repeat greetings or the customer name unnecessarily/i,
    );
    assert.match(
      capturedSystemInstruction.join('\n'),
      /Tools available in some turns: lookup_store_items, lookup_available_devices, lookup_currency_rate, convert_currency_amount, calculate_installment_price/i,
    );
    assert.match(
      capturedSystemInstruction.join('\n'),
      /Use at most 3 tool iterations total\. Prefer 0-1 if grounded context already answers\.|Use at most 3 tool iterations total\. Prefer 0–1 if grounded context already answers\./i,
    );
    assert.match(
      capturedSystemInstruction.join('\n'),
      /Never repeat the same tool call just to confirm the same fact/i,
    );
    assert.match(
      capturedSystemInstruction.join('\n'),
      /Normalize slang\/transliterated product names into official SAP-style naming before inventory lookups/i,
    );
    assert.match(
      capturedSystemInstruction.join('\n'),
      /For price conversion use convert_currency_amount unless the exact conversion is already grounded here/i,
    );
    assert.match(
      capturedSystemInstruction.join('\n'),
      /Never ask customers for item codes or IMEI numbers/i,
    );
    assert.match(
      capturedSystemInstruction.join('\n'),
      /Never mention the total installment amount, total payable amount, total after percentage, interest amount, or "jami qiymati"/i,
    );
    assert.match(
      capturedSystemInstruction.join('\n'),
      /Never calculate, estimate, derive, round, or adjust installment prices manually/i,
    );
    assert.match(
      capturedSystemInstruction.join('\n'),
      /Down payment is required for installments and must be at least 1,000,000 UZS/i,
    );
    assert.match(
      capturedSystemInstruction.join('\n'),
      /first calculate with the default down_payment=1000000/i,
    );
    assert.match(
      capturedSystemInstruction.join('\n'),
      /Yangi uses SalePrice, B\/U or B\\U uses PurchasePrice/i,
    );
    assert.match(
      capturedSystemInstruction.join('\n'),
      /Set should_escalate=true only for unsupported actions, risky assumptions, missing grounding, or required manual confirmation/i,
    );
    assert.match(capturedPrompt, /<context>/i);
    assert.match(capturedPrompt, /Tools enabled for this turn: convert_currency_amount/i);
    assert.match(capturedPrompt, /User profile:/);
    assert.match(capturedPrompt, /Conversation transcript:/);
    assert.match(capturedPrompt, /Narxi 18 467 000 so'm bo'ladi\./);
    assert.doesNotMatch(capturedPrompt, /Matched FAQ metadata/i);
    assert.doesNotMatch(
      capturedPrompt,
      /question_uz|question_ru|question_en|answer_uz|answer_ru|answer_en/,
    );
    assert.match(capturedPrompt, /Use the system instructions as the primary policy/i);
    assert.match(
      capturedPrompt,
      /If the customer names a specific phone or model series, prefer detailed inventory grounding over broad catalog behavior/i,
    );
    assert.match(
      capturedPrompt,
      /When the customer asks vaguely what devices exist overall, prefer the device catalog tool/i,
    );
    assert.match(
      capturedPrompt,
      /If a grounded device catalog pre-check is already present for the current message, answer from that grounded catalog instead of improvising a list/i,
    );
    assert.equal(capturedFunctionCallingMode, 'AUTO');
    assert.deepEqual(capturedResponseSchema, {
      type: 'object',
      properties: {
        reply_text: {
          type: 'string',
          description:
            'Customer-facing support reply text. Keep empty only when escalating without a reply.',
        },
        should_escalate: {
          type: 'boolean',
          description: 'Whether a human support agent should take over.',
        },
        escalation_reason: {
          type: 'string',
          description:
            'Short internal reason for escalation. Keep empty when no escalation is needed.',
        },
      },
      required: ['reply_text', 'should_escalate', 'escalation_reason'],
      propertyOrdering: ['reply_text', 'should_escalate', 'escalation_reason'],
    });
    assert.deepEqual(capturedToolNames, ['convert_currency_amount']);
    assert.equal(capturedMaxToolIterations, 3);
  } finally {
    GeminiService.generateJsonWithTools = originalGenerateJsonWithTools;
  }
});

test('SupportAgentService strips total payable lines from installment replies', async () => {
  const originalGenerateJsonWithTools = GeminiService.generateJsonWithTools;

  GeminiService.generateJsonWithTools = (async () => ({
    reply_text:
      'iPhone 17 Pro modelini 15 oyga olishingiz mumkin:\n\n• Oyiga to‘lov: 2 108 567 so‘m\n• Boshlang‘ich to‘lovsiz\n• Jami qiymati (ustama bilan): 31 628 500 so‘m',
    should_escalate: false,
    escalation_reason: '',
  })) as typeof GeminiService.generateJsonWithTools;

  try {
    const result = await SupportAgentService.generateReply({
      user: makeUser(),
      history: makeHistory(),
      latestUserMessage: '15 oyga qancha tushadi?',
    });

    assert.equal(
      result.replyText,
      'iPhone 17 Pro modelini 15 oyga olishingiz mumkin:\n\n• Oyiga to‘lov: 2 108 567 so‘m\n• Boshlang‘ich to‘lovsiz',
    );
    assert.doesNotMatch(result.replyText, /jami qiymati|31 628 500/i);
  } finally {
    GeminiService.generateJsonWithTools = originalGenerateJsonWithTools;
  }
});

test('SupportAgentService enables only the inventory tool for specific stock questions', async () => {
  const originalGenerateJsonWithTools = GeminiService.generateJsonWithTools;
  const originalLookupAvailableItems = SupportItemAvailabilityService.lookupAvailableItems;

  let capturedToolNames: string[] = [];

  SupportItemAvailabilityService.lookupAvailableItems = (async (params) =>
    makeInventoryResult(
      params.query,
    )) as typeof SupportItemAvailabilityService.lookupAvailableItems;

  GeminiService.generateJsonWithTools = (async (params) => {
    capturedToolNames = params.tools.map((tool) => tool.declaration.name);

    return {
      reply_text: 'Ha, mavjud variantlarni tekshirdim.',
      should_escalate: false,
      escalation_reason: '',
    };
  }) as typeof GeminiService.generateJsonWithTools;

  try {
    await SupportAgentService.generateReply({
      user: makeUser(),
      history: makeHistory(),
      latestUserMessage: 'silada 15 pro bomi',
    });

    assert.deepEqual(capturedToolNames, ['lookup_store_items']);
  } finally {
    GeminiService.generateJsonWithTools = originalGenerateJsonWithTools;
    SupportItemAvailabilityService.lookupAvailableItems = originalLookupAvailableItems;
  }
});

test('SupportAgentService enables only the catalog tool for broad assortment questions', async () => {
  const originalGenerateJsonWithTools = GeminiService.generateJsonWithTools;
  const originalLookupAvailableDevices = SupportItemAvailabilityService.lookupAvailableDevices;

  let capturedToolNames: string[] = [];

  SupportItemAvailabilityService.lookupAvailableDevices = (async () => ({
    ok: true,
    new_devices: ['iPhone 15', 'iPhone 16 Pro'],
    used_devices: ['iPhone 14 Pro Max'],
  })) as typeof SupportItemAvailabilityService.lookupAvailableDevices;

  GeminiService.generateJsonWithTools = (async (params) => {
    capturedToolNames = params.tools.map((tool) => tool.declaration.name);

    return {
      reply_text: 'Hozir mavjud modellarning umumiy ro‘yxatini yuboraman.',
      should_escalate: false,
      escalation_reason: '',
    };
  }) as typeof GeminiService.generateJsonWithTools;

  try {
    await SupportAgentService.generateReply({
      user: makeUser(),
      history: makeHistory(),
      latestUserMessage: 'Silada qanaqa telefonla bor',
    });

    assert.deepEqual(capturedToolNames, ['lookup_available_devices']);
  } finally {
    GeminiService.generateJsonWithTools = originalGenerateJsonWithTools;
    SupportItemAvailabilityService.lookupAvailableDevices = originalLookupAvailableDevices;
  }
});

test('SupportAgentService exposes the Gemini inventory tool that delegates to item lookup', async () => {
  const originalGenerateJsonWithTools = GeminiService.generateJsonWithTools;
  const originalLookupAvailableItems = SupportItemAvailabilityService.lookupAvailableItems;

  let executedToolResult: unknown = null;
  const lookupCalls: unknown[] = [];

  SupportItemAvailabilityService.lookupAvailableItems = (async (params) => {
    lookupCalls.push(params);

    return {
      ok: true,
      search: params.search || params.query || null,
      query: params.query,
      store: params.store || null,
      requested_filters: {
        model: params.model || null,
        device_type: params.deviceType || null,
        memory: params.memory || null,
        color: params.color || null,
        sim_type: params.simType || null,
        condition: params.condition || null,
      },
      exact_match: true,
      no_exact_match: false,
      no_exact_match_message: null,
      total_matches: 1,
      returned_matches: 1,
      items: [
        {
          item_code: 'IP16',
          imei: '123456789012345',
          item_name: 'iPhone 16',
          store_code: 'W01',
          store_name: 'Nurafshon',
          on_hand: 3,
          sale_price: 12000000,
          item_group_name: 'Phones',
          model: 'iPhone 16',
          device_type: params.deviceType || null,
          color: params.color || 'Black',
          memory: params.memory || '128GB',
          condition: params.condition || 'Yangi',
          sim_type: params.simType || 'eSIM',
        },
      ],
      suggestions: null,
    };
  }) as typeof SupportItemAvailabilityService.lookupAvailableItems;

  GeminiService.generateJsonWithTools = (async (params) => {
    const inventoryTool = params.tools.find(
      (tool) => tool.declaration.name === 'lookup_store_items',
    );

    assert.ok(inventoryTool);
    assert.equal(inventoryTool.declaration.strict, true);
    assert.equal(inventoryTool.declaration.parameters.additionalProperties, false);
    assert.deepEqual(inventoryTool.declaration.parameters.required, [
      'search',
      'model',
      'device_type',
      'memory',
      'color',
      'sim_type',
      'condition',
      'store',
      'limit',
      'query',
    ]);
    assert.ok('search' in inventoryTool.declaration.parameters.properties);
    assert.ok('model' in inventoryTool.declaration.parameters.properties);
    assert.ok('device_type' in inventoryTool.declaration.parameters.properties);
    assert.ok('memory' in inventoryTool.declaration.parameters.properties);
    assert.ok('color' in inventoryTool.declaration.parameters.properties);
    assert.ok('sim_type' in inventoryTool.declaration.parameters.properties);
    assert.ok('condition' in inventoryTool.declaration.parameters.properties);

    executedToolResult = await inventoryTool.execute({
      search: 'APPLE2549',
      model: 'iPhone 17',
      device_type: 'Pro Max',
      memory: '256GB',
      color: 'Deep Blue',
      sim_type: 'nano-SIM',
      condition: 'Yangi',
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
      user: makeUser(),
      history: makeHistory(),
      latestUserMessage: 'Nurafshonda iPhone 16 bormi?',
    });

    assert.equal(result.replyText, 'Nurafshon filialida mavjud.');
    assert.deepEqual(lookupCalls[lookupCalls.length - 1], {
      search: 'APPLE2549',
      query: '',
      store: 'Nurafshon',
      limit: 7,
      model: 'iPhone 17',
      deviceType: 'Pro Max',
      memory: '256GB',
      color: 'Deep Blue',
      simType: 'nano-SIM',
      condition: 'Yangi',
    });
    assert.deepEqual(executedToolResult, {
      ok: true,
      search: 'APPLE2549',
      query: '',
      store: 'Nurafshon',
      requested_filters: {
        model: 'iPhone 17',
        device_type: 'Pro Max',
        memory: '256GB',
        color: 'Deep Blue',
        sim_type: 'nano-SIM',
        condition: 'Yangi',
      },
      exact_match: true,
      no_exact_match: false,
      no_exact_match_message: null,
      total_matches: 1,
      returned_matches: 1,
      items: [
        {
          item_code: 'IP16',
          imei: '123456789012345',
          item_name: 'iPhone 16',
          store_code: 'W01',
          store_name: 'Nurafshon',
          on_hand: 3,
          sale_price: 12000000,
          item_group_name: 'Phones',
          model: 'iPhone 16',
          device_type: 'Pro Max',
          color: 'Deep Blue',
          memory: '256GB',
          condition: 'Yangi',
          sim_type: 'nano-SIM',
        },
      ],
      suggestions: null,
    });
  } finally {
    GeminiService.generateJsonWithTools = originalGenerateJsonWithTools;
    SupportItemAvailabilityService.lookupAvailableItems = originalLookupAvailableItems;
  }
});

test('SupportAgentService exposes the Gemini device catalog tool that delegates to available device lookup', async () => {
  const originalGenerateJsonWithTools = GeminiService.generateJsonWithTools;
  const originalLookupAvailableDevices = SupportItemAvailabilityService.lookupAvailableDevices;

  let executedToolResult: unknown = null;

  SupportItemAvailabilityService.lookupAvailableDevices = (async () => ({
    ok: true,
    new_devices: ['iPhone 15', 'iPhone 16 Pro'],
    used_devices: ['iPhone 14 Pro Max'],
  })) as typeof SupportItemAvailabilityService.lookupAvailableDevices;

  GeminiService.generateJsonWithTools = (async (params) => {
    const deviceCatalogTool = params.tools.find(
      (tool) => tool.declaration.name === 'lookup_available_devices',
    );

    assert.ok(deviceCatalogTool);

    executedToolResult = await deviceCatalogTool.execute({});

    return {
      reply_text: 'Hozir mavjud modellarning umumiy ro‘yxatini yubordim.',
      should_escalate: false,
      escalation_reason: '',
    };
  }) as typeof GeminiService.generateJsonWithTools;

  try {
    const result = await SupportAgentService.generateReply({
      user: makeUser(),
      history: makeHistory(),
      latestUserMessage: 'Mavjud telefonlar ro‘yxatini yuboring',
    });

    assert.equal(result.replyText, 'Hozir mavjud modellarning umumiy ro‘yxatini yubordim.');
    assert.deepEqual(executedToolResult, {
      ok: true,
      new_devices: ['iPhone 15', 'iPhone 16 Pro'],
      used_devices: ['iPhone 14 Pro Max'],
    });
  } finally {
    GeminiService.generateJsonWithTools = originalGenerateJsonWithTools;
    SupportItemAvailabilityService.lookupAvailableDevices = originalLookupAvailableDevices;
  }
});

test('SupportAgentService exposes installment calculator with grounded item identifiers', async () => {
  const originalGenerateJsonWithTools = GeminiService.generateJsonWithTools;
  const originalLookupAvailableItems = SupportItemAvailabilityService.lookupAvailableItems;
  const originalCalculateMonthlyInstallment = SupportInstallmentService.calculateMonthlyInstallment;

  let capturedToolNames: string[] = [];
  let executedToolResult: unknown = null;
  const calculatorCalls: unknown[] = [];
  let defaultDownPaymentToolResult: unknown = null;

  SupportItemAvailabilityService.lookupAvailableItems = (async (params) =>
    makeInventoryResult(
      params.query,
    )) as typeof SupportItemAvailabilityService.lookupAvailableItems;

  SupportInstallmentService.calculateMonthlyInstallment = (async (params) => {
    calculatorCalls.push(params);

    return {
      ok: true,
      error: null,
      lookup: {
        imei: params.imei || null,
        item_code: params.itemCode || null,
        used: 'imei',
      },
      months: params.months,
      down_payment: params.downPayment || 0,
      product: {
        imei: params.imei || null,
        item_code: params.itemCode || 'IP16',
        item_name: 'iPhone 16',
        store_code: 'W01',
        store_name: 'Nurafshon',
        on_hand: 1,
        sale_price: 12000000,
        purchase_price: null,
        model: 'iPhone 16',
        device_type: null,
        memory: '128GB',
        color: 'Black',
        sim_type: 'eSIM',
        condition: 'Yangi',
      },
      percentage: 63,
      sale_price: 12000000,
      purchase_price: null,
      actual_price: 12000000,
      price_source: 'SalePrice',
      financed_amount: 10000000,
      monthly_installment: 1358333,
    };
  }) as typeof SupportInstallmentService.calculateMonthlyInstallment;

  GeminiService.generateJsonWithTools = (async (params) => {
    capturedToolNames = params.tools.map((tool) => tool.declaration.name);
    const calculatorTool = params.tools.find(
      (tool) => tool.declaration.name === 'calculate_installment_price',
    );

    assert.ok(calculatorTool);
    assert.equal(calculatorTool.declaration.strict, true);
    assert.deepEqual(calculatorTool.declaration.parameters.required, [
      'imei',
      'item_code',
      'months',
      'down_payment',
    ]);
    const calculatorParameters = calculatorTool.declaration.parameters as unknown as {
      properties: {
        down_payment: {
          description: string;
        };
      };
    };
    assert.match(
      calculatorParameters.properties.down_payment.description,
      /Minimum is 1,000,000 UZS/i,
    );

    executedToolResult = await calculatorTool.execute({
      imei: '123456789012345',
      item_code: 'IP16',
      months: 12,
      down_payment: 2000000,
    });
    defaultDownPaymentToolResult = await calculatorTool.execute({
      imei: '123456789012345',
      item_code: 'IP16',
      months: 12,
      down_payment: null,
    });

    return {
      reply_text: '12 oyga oyiga 1 358 333 so‘mdan bo‘ladi.',
      should_escalate: false,
      escalation_reason: '',
    };
  }) as typeof GeminiService.generateJsonWithTools;

  try {
    const result = await SupportAgentService.generateReply({
      user: makeUser(),
      history: [
        {
          id: 1,
          ticket_id: 99,
          sender_type: 'user',
          message_text: 'iPhone 16 128GB black bormi?',
          photo_file_id: null,
          telegram_message_id: 111,
          group_message_id: null,
          created_at: new Date(),
        },
      ],
      latestUserMessage: '2 million boshlangich tolov bilan 12 oyga qancha?',
    });

    assert.equal(result.replyText, '12 oyga oyiga 1 358 333 so‘mdan bo‘ladi.');
    assert.deepEqual(capturedToolNames, ['lookup_store_items', 'calculate_installment_price']);
    assert.deepEqual(calculatorCalls[0], {
      imei: '123456789012345',
      itemCode: 'IP16',
      months: 12,
      downPayment: 2000000,
    });
    assert.deepEqual(calculatorCalls[1], {
      imei: '123456789012345',
      itemCode: 'IP16',
      months: 12,
      downPayment: 1000000,
    });
    assert.deepEqual(executedToolResult, {
      ok: true,
      error: null,
      lookup: {
        imei: '123456789012345',
        item_code: 'IP16',
        used: 'imei',
      },
      months: 12,
      down_payment: 2000000,
      product: {
        imei: '123456789012345',
        item_code: 'IP16',
        item_name: 'iPhone 16',
        store_code: 'W01',
        store_name: 'Nurafshon',
        on_hand: 1,
        sale_price: 12000000,
        purchase_price: null,
        model: 'iPhone 16',
        device_type: null,
        memory: '128GB',
        color: 'Black',
        sim_type: 'eSIM',
        condition: 'Yangi',
      },
      percentage: 63,
      sale_price: 12000000,
      purchase_price: null,
      actual_price: 12000000,
      price_source: 'SalePrice',
      financed_amount: 10000000,
      monthly_installment: 1358333,
    });
    assert.deepEqual(defaultDownPaymentToolResult, {
      ok: true,
      error: null,
      lookup: {
        imei: '123456789012345',
        item_code: 'IP16',
        used: 'imei',
      },
      months: 12,
      down_payment: 1000000,
      product: {
        imei: '123456789012345',
        item_code: 'IP16',
        item_name: 'iPhone 16',
        store_code: 'W01',
        store_name: 'Nurafshon',
        on_hand: 1,
        sale_price: 12000000,
        purchase_price: null,
        model: 'iPhone 16',
        device_type: null,
        memory: '128GB',
        color: 'Black',
        sim_type: 'eSIM',
        condition: 'Yangi',
      },
      percentage: 63,
      sale_price: 12000000,
      purchase_price: null,
      actual_price: 12000000,
      price_source: 'SalePrice',
      financed_amount: 10000000,
      monthly_installment: 1358333,
    });
  } finally {
    GeminiService.generateJsonWithTools = originalGenerateJsonWithTools;
    SupportItemAvailabilityService.lookupAvailableItems = originalLookupAvailableItems;
    SupportInstallmentService.calculateMonthlyInstallment = originalCalculateMonthlyInstallment;
  }
});

test('SupportAgentService treats down-payment follow-up slang as installment intent', async () => {
  const originalGenerateJsonWithTools = GeminiService.generateJsonWithTools;

  let capturedToolNames: string[] = [];

  GeminiService.generateJsonWithTools = (async (params) => {
    capturedToolNames = params.tools.map((tool) => tool.declaration.name);

    return {
      reply_text:
        '<b>Muddatli to‘lov</b>\n\n• Boshlang‘ich to‘lov: 1 000 000 so‘m\n• Oylik to‘lovni kalkulyator orqali tekshirib beraman.',
      should_escalate: false,
      escalation_reason: '',
    };
  }) as typeof GeminiService.generateJsonWithTools;

  try {
    await SupportAgentService.generateReply({
      user: makeUser(),
      history: [
        {
          id: 1,
          ticket_id: 99,
          sender_type: 'user',
          message_text: '17 pro oqi bomi 256 tali',
          photo_file_id: null,
          telegram_message_id: 111,
          group_message_id: null,
          created_at: new Date(),
        },
        {
          id: 2,
          ticket_id: 99,
          sender_type: 'agent',
          message_text:
            "iPhone 17 Pro 256GB Silver (oq) modelimiz mavjud. Narxi 18 605 000 so'm.",
          photo_file_id: null,
          telegram_message_id: 112,
          group_message_id: null,
          created_at: new Date(),
        },
        {
          id: 3,
          ticket_id: 99,
          sender_type: 'user',
          message_text: '15 oyga osam nechpulda tushadi',
          photo_file_id: null,
          telegram_message_id: 113,
          group_message_id: null,
          created_at: new Date(),
        },
        {
          id: 4,
          ticket_id: 99,
          sender_type: 'agent',
          message_text:
            "15 oyga oyiga 2 108 567 so'mdan to'lov qilasiz (1 000 000 so'm boshlang'ich to'lov bilan).",
          photo_file_id: null,
          telegram_message_id: 114,
          group_message_id: null,
          created_at: new Date(),
        },
      ],
      latestUserMessage: 'boshiga bermasda osa boladimi',
    });

    assert.deepEqual(capturedToolNames, ['lookup_store_items', 'calculate_installment_price']);
  } finally {
    GeminiService.generateJsonWithTools = originalGenerateJsonWithTools;
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
      user: makeUser(),
      history: makeHistory(),
      latestUserMessage: 'iPhone 17 olmoqchiman, sizlarda bormi?',
    });

    assert.equal(preloadedQuery, 'iphone 17');
    assert.match(capturedPrompt, /Inventory pre-check:/);
    assert.match(capturedPrompt, /"query": "iphone 17"/);
    assert.match(capturedPrompt, /"returned_matches": 1/);
  } finally {
    GeminiService.generateJsonWithTools = originalGenerateJsonWithTools;
    SupportItemAvailabilityService.lookupAvailableItems = originalLookupAvailableItems;
  }
});

test('SupportAgentService normalizes shorthand model slang like "silada 15 pro bomi" into an iPhone lookup', async () => {
  const originalGenerateJsonWithTools = GeminiService.generateJsonWithTools;
  const originalLookupAvailableItems = SupportItemAvailabilityService.lookupAvailableItems;

  let preloadedQuery = '';

  SupportItemAvailabilityService.lookupAvailableItems = (async (params) => {
    preloadedQuery = params.query;
    return makeInventoryResult(params.query);
  }) as typeof SupportItemAvailabilityService.lookupAvailableItems;

  GeminiService.generateJsonWithTools = (async () => ({
    reply_text: 'Ha, iPhone 15 Pro bo‘yicha variantlarni tekshirib beraman.',
    should_escalate: false,
    escalation_reason: '',
  })) as typeof GeminiService.generateJsonWithTools;

  try {
    await SupportAgentService.generateReply({
      user: makeUser(),
      history: makeHistory(),
      latestUserMessage: 'silada 15 pro bomi',
    });

    assert.equal(preloadedQuery, 'iphone 15 pro');
  } finally {
    GeminiService.generateJsonWithTools = originalGenerateJsonWithTools;
    SupportItemAvailabilityService.lookupAvailableItems = originalLookupAvailableItems;
  }
});

test('SupportAgentService carries previous iPhone model into memory/color follow-up slang', async () => {
  const originalGenerateJsonWithTools = GeminiService.generateJsonWithTools;
  const originalLookupAvailableItems = SupportItemAvailabilityService.lookupAvailableItems;

  let preloadedQuery = '';

  SupportItemAvailabilityService.lookupAvailableItems = (async (params) => {
    preloadedQuery = params.query;
    return makeInventoryResult(params.query);
  }) as typeof SupportItemAvailabilityService.lookupAvailableItems;

  GeminiService.generateJsonWithTools = (async () => ({
    reply_text: 'iPhone 15 Pro 256GB oq rang bo‘yicha tekshirib beraman.',
    should_escalate: false,
    escalation_reason: '',
  })) as typeof GeminiService.generateJsonWithTools;

  try {
    await SupportAgentService.generateReply({
      user: makeUser(),
      history: [
        {
          id: 1,
          ticket_id: 99,
          sender_type: 'user',
          message_text: '15 pro bomi',
          photo_file_id: null,
          telegram_message_id: 111,
          group_message_id: null,
          created_at: new Date(),
        },
        {
          id: 2,
          ticket_id: 99,
          sender_type: 'agent',
          message_text: 'Qaysi xotira va rang kerak?',
          photo_file_id: null,
          telegram_message_id: 112,
          group_message_id: null,
          created_at: new Date(),
        },
      ],
      latestUserMessage: 'oqi bomi 256 tali',
    });

    assert.equal(preloadedQuery, 'iphone 15 pro 256gb white');
  } finally {
    GeminiService.generateJsonWithTools = originalGenerateJsonWithTools;
    SupportItemAvailabilityService.lookupAvailableItems = originalLookupAvailableItems;
  }
});

test('SupportAgentService treats shorthand price questions like "17 lani narxi qancha bo\'votti" as iPhone 17 queries', async () => {
  const originalGenerateJsonWithTools = GeminiService.generateJsonWithTools;
  const originalLookupAvailableItems = SupportItemAvailabilityService.lookupAvailableItems;

  let preloadedQuery = '';

  SupportItemAvailabilityService.lookupAvailableItems = (async (params) => {
    preloadedQuery = params.query;
    return makeInventoryResult(params.query);
  }) as typeof SupportItemAvailabilityService.lookupAvailableItems;

  GeminiService.generateJsonWithTools = (async () => ({
    reply_text: 'iPhone 17 bo‘yicha narxlarni tekshirib beraman.',
    should_escalate: false,
    escalation_reason: '',
  })) as typeof GeminiService.generateJsonWithTools;

  try {
    await SupportAgentService.generateReply({
      user: makeUser(),
      history: makeHistory(),
      latestUserMessage: "17 lani narxi qancha bo'votti",
    });

    assert.equal(preloadedQuery, 'iphone 17');
  } finally {
    GeminiService.generateJsonWithTools = originalGenerateJsonWithTools;
    SupportItemAvailabilityService.lookupAvailableItems = originalLookupAvailableItems;
  }
});

test('SupportAgentService preloads grounded alternative inventory suggestions when exact stock is unavailable', async () => {
  const originalGenerateJsonWithTools = GeminiService.generateJsonWithTools;
  const originalLookupAvailableItems = SupportItemAvailabilityService.lookupAvailableItems;

  const lookupQueries: string[] = [];
  let capturedPrompt = '';

  SupportItemAvailabilityService.lookupAvailableItems = (async (params) => {
    lookupQueries.push(params.query);

    if (params.query === 'iphone 17') {
      return makeEmptyInventoryResult(params.query);
    }

    if (params.query === 'iphone') {
      return makeAlternativeInventoryResult(params.query);
    }

    return makeEmptyInventoryResult(params.query);
  }) as typeof SupportItemAvailabilityService.lookupAvailableItems;

  GeminiService.generateJsonWithTools = (async (params) => {
    capturedPrompt = params.prompt;

    return {
      reply_text: 'Hozircha iPhone 17 yo‘q, lekin boshqa variantlarni taklif qilaman.',
      should_escalate: false,
      escalation_reason: '',
    };
  }) as typeof GeminiService.generateJsonWithTools;

  try {
    await SupportAgentService.generateReply({
      user: makeUser(),
      history: makeHistory(),
      latestUserMessage: 'Ulardan iphone 17 topamanmi',
    });

    assert.deepEqual(lookupQueries, ['iphone 17', 'iphone']);
    assert.match(capturedPrompt, /Alternative inventory suggestions:/);
    assert.match(capturedPrompt, /"strategy": "product_family"/);
    assert.match(capturedPrompt, /"query": "iphone"/);
    assert.match(capturedPrompt, /"item_name": "iPhone 16"/);
    assert.match(capturedPrompt, /"item_name": "iPhone 16 Pro"/);
  } finally {
    GeminiService.generateJsonWithTools = originalGenerateJsonWithTools;
    SupportItemAvailabilityService.lookupAvailableItems = originalLookupAvailableItems;
  }
});

test('SupportAgentService derives a generic iphone inventory query for catalog-style questions', async () => {
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
      reply_text: 'Hozir mavjud iPhone variantlarini aytib beraman.',
      should_escalate: false,
      escalation_reason: '',
    };
  }) as typeof GeminiService.generateJsonWithTools;

  try {
    await SupportAgentService.generateReply({
      user: makeUser(),
      history: [
        {
          id: 1,
          ticket_id: 99,
          sender_type: 'user',
          message_text: 'sizlarda qaysi turdagi iphonelar bor',
          photo_file_id: null,
          telegram_message_id: 111,
          group_message_id: null,
          created_at: new Date(),
        },
      ],
      latestUserMessage: 'sizlarda qaysi turdagi iphonelar bor',
    });

    assert.equal(preloadedQuery, 'iphone');
    assert.match(capturedPrompt, /Inventory pre-check:/);
    assert.match(capturedPrompt, /"query": "iphone"/);
  } finally {
    GeminiService.generateJsonWithTools = originalGenerateJsonWithTools;
    SupportItemAvailabilityService.lookupAvailableItems = originalLookupAvailableItems;
  }
});

test('SupportAgentService preloads grounded device catalog context for broad assortment questions', async () => {
  const originalGenerateJsonWithTools = GeminiService.generateJsonWithTools;
  const originalLookupAvailableDevices = SupportItemAvailabilityService.lookupAvailableDevices;
  const originalLookupAvailableItems = SupportItemAvailabilityService.lookupAvailableItems;

  let capturedPrompt = '';
  let catalogLookupCount = 0;
  let itemLookupCount = 0;

  SupportItemAvailabilityService.lookupAvailableDevices = (async () => {
    catalogLookupCount += 1;
    return {
      ok: true,
      new_devices: ['iPhone 15', 'iPhone 16 Pro'],
      used_devices: ['iPhone 14 Pro Max'],
    };
  }) as typeof SupportItemAvailabilityService.lookupAvailableDevices;

  SupportItemAvailabilityService.lookupAvailableItems = (async () => {
    itemLookupCount += 1;
    return makeInventoryResult('iphone');
  }) as typeof SupportItemAvailabilityService.lookupAvailableItems;

  GeminiService.generateJsonWithTools = (async (params) => {
    capturedPrompt = params.prompt;

    return {
      reply_text: 'Hozir mavjud modellarning umumiy ro‘yxatini yuboraman.',
      should_escalate: false,
      escalation_reason: '',
    };
  }) as typeof GeminiService.generateJsonWithTools;

  try {
    const result = await SupportAgentService.generateReply({
      user: makeUser(),
      history: makeHistory(),
      latestUserMessage: 'Silada qanaqa telefonla bor',
    });

    assert.equal(result.replyText, 'Hozir mavjud modellarning umumiy ro‘yxatini yuboraman.');
    assert.equal(catalogLookupCount, 1);
    assert.equal(itemLookupCount, 0);
    assert.match(capturedPrompt, /Device catalog pre-check:/);
    assert.match(capturedPrompt, /"new_devices": \[/);
    assert.match(capturedPrompt, /"iPhone 16 Pro"/);
  } finally {
    GeminiService.generateJsonWithTools = originalGenerateJsonWithTools;
    SupportItemAvailabilityService.lookupAvailableDevices = originalLookupAvailableDevices;
    SupportItemAvailabilityService.lookupAvailableItems = originalLookupAvailableItems;
  }
});

test('SupportAgentService asks a deterministic clarification when grounding is missing for an inventory-style request', async () => {
  const originalGenerateJsonWithTools = GeminiService.generateJsonWithTools;

  let geminiCallCount = 0;

  GeminiService.generateJsonWithTools = (async () => {
    geminiCallCount += 1;
    return {
      reply_text: 'Should not be used',
      should_escalate: false,
      escalation_reason: '',
    };
  }) as typeof GeminiService.generateJsonWithTools;

  try {
    const result = await SupportAgentService.generateReply({
      user: makeUser(),
      history: makeHistory(),
      latestUserMessage: 'Bironta telefon bormi?',
    });

    assert.equal(geminiCallCount, 0);
    assert.match(result.replyText, /Qaysi marka yoki modelni tekshirib berishimni yozib yuboring/i);
    assert.equal(result.shouldEscalate, false);
  } finally {
    GeminiService.generateJsonWithTools = originalGenerateJsonWithTools;
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

test('SupportAgentService broadens "other series" follow-ups to the product family query', async () => {
  const originalGenerateJsonWithTools = GeminiService.generateJsonWithTools;
  const originalLookupAvailableItems = SupportItemAvailabilityService.lookupAvailableItems;

  const lookupQueries: string[] = [];

  SupportItemAvailabilityService.lookupAvailableItems = (async (params) => {
    lookupQueries.push(params.query);
    return makeAlternativeInventoryResult(params.query);
  }) as typeof SupportItemAvailabilityService.lookupAvailableItems;

  GeminiService.generateJsonWithTools = (async () => ({
    reply_text: 'Hozirgi mavjud iPhone variantlarini aytib beraman.',
    should_escalate: false,
    escalation_reason: '',
  })) as typeof GeminiService.generateJsonWithTools;

  try {
    await SupportAgentService.generateReply({
      user: makeUser(),
      history: [
        {
          id: 1,
          ticket_id: 99,
          sender_type: 'user',
          message_text: 'Ulardan iphone 17 topamanmi',
          photo_file_id: null,
          telegram_message_id: 111,
          group_message_id: null,
          created_at: new Date(),
        },
      ],
      latestUserMessage: "iphone 17'ning boshqa seriyalarichi ?",
    });

    assert.deepEqual(lookupQueries, ['iphone']);
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
