import test from 'node:test';
import assert from 'node:assert/strict';

import { config } from '../config';
import { GeminiService } from './gemini.service';

const getGeminiClient = () =>
  (
    GeminiService as unknown as {
      client: {
        post: (...args: unknown[]) => Promise<unknown>;
      };
    }
  ).client;

test('GeminiService.generateJson parses markdown-fenced JSON payloads', async () => {
  const client = getGeminiClient();
  const originalPost = client.post;
  const originalApiKey = config.GEMINI_API_KEY;

  config.GEMINI_API_KEY = 'test-gemini-key';
  client.post = (async () => ({
    data: {
      candidates: [
        {
          content: {
            parts: [
              {
                text: '```json\n{"reply_text":"Salom","should_escalate":false,"escalation_reason":""}\n```',
              },
            ],
          },
        },
      ],
    },
  })) as typeof client.post;

  try {
    const payload = await GeminiService.generateJson<{
      reply_text: string;
      should_escalate: boolean;
      escalation_reason: string;
    }>({
      prompt: 'test',
      schemaName: 'support agent reply',
    });

    assert.deepEqual(payload, {
      reply_text: 'Salom',
      should_escalate: false,
      escalation_reason: '',
    });
  } finally {
    client.post = originalPost;
    config.GEMINI_API_KEY = originalApiKey;
  }
});

test('GeminiService.generateJson repairs common LLM JSON formatting mistakes', async () => {
  const client = getGeminiClient();
  const originalPost = client.post;
  const originalApiKey = config.GEMINI_API_KEY;

  config.GEMINI_API_KEY = 'test-gemini-key';
  client.post = (async () => ({
    data: {
      candidates: [
        {
          content: {
            parts: [
              {
                text: `Here is the decision:
\`\`\`json
{
  should_auto_reply: True,
  matched_faq_id: 8,
  confidence: 0.91,
  reason: 'It's a direct match for FAQ 8',
}
\`\`\``,
              },
            ],
          },
        },
      ],
    },
  })) as typeof client.post;

  try {
    const payload = await GeminiService.generateJson<{
      should_auto_reply: boolean;
      matched_faq_id: number;
      confidence: number;
      reason: string;
    }>({
      prompt: 'test',
      schemaName: 'support FAQ routing decision',
    });

    assert.deepEqual(payload, {
      should_auto_reply: true,
      matched_faq_id: 8,
      confidence: 0.91,
      reason: "It's a direct match for FAQ 8",
    });
  } finally {
    client.post = originalPost;
    config.GEMINI_API_KEY = originalApiKey;
  }
});

test('GeminiService.generateJson extracts inner JSON from doubly wrapped JS-style payloads', async () => {
  const client = getGeminiClient();
  const originalPost = client.post;
  const originalApiKey = config.GEMINI_API_KEY;

  config.GEMINI_API_KEY = 'test-gemini-key';
  client.post = (async () => ({
    data: {
      candidates: [
        {
          content: {
            parts: [
              {
                text: `Routing decision:
{{should_auto_reply: true, matched_faq_id: 8, confidence: 0.93, reason: 'The stock-check agent FAQ covers this request.'}}`,
              },
            ],
          },
        },
      ],
    },
  })) as typeof client.post;

  try {
    const payload = await GeminiService.generateJson<{
      should_auto_reply: boolean;
      matched_faq_id: number;
      confidence: number;
      reason: string;
    }>({
      prompt: 'test',
      schemaName: 'support FAQ routing decision',
    });

    assert.deepEqual(payload, {
      should_auto_reply: true,
      matched_faq_id: 8,
      confidence: 0.93,
      reason: 'The stock-check agent FAQ covers this request.',
    });
  } finally {
    client.post = originalPost;
    config.GEMINI_API_KEY = originalApiKey;
  }
});

test('GeminiService.generateJsonWithTools extracts JSON from wrapped model text', async () => {
  const client = getGeminiClient();
  const originalPost = client.post;
  const originalApiKey = config.GEMINI_API_KEY;

  config.GEMINI_API_KEY = 'test-gemini-key';
  client.post = (async () => ({
    data: {
      candidates: [
        {
          content: {
            role: 'model',
            parts: [
              {
                text: 'Here is the final answer:\n```json\n{"reply_text":"Mavjud variantlarni tekshirdim.","should_escalate":false,"escalation_reason":""}\n```',
              },
            ],
          },
        },
      ],
    },
  })) as typeof client.post;

  try {
    const payload = await GeminiService.generateJsonWithTools<{
      reply_text: string;
      should_escalate: boolean;
      escalation_reason: string;
    }>({
      prompt: 'test',
      schemaName: 'support agent reply',
      tools: [
        {
          declaration: {
            name: 'dummy_tool',
            description: 'No-op tool for parser coverage.',
            parameters: {
              type: 'object',
              properties: {},
            },
          },
          execute: async () => ({ ok: true }),
        },
      ],
    });

    assert.deepEqual(payload, {
      reply_text: 'Mavjud variantlarni tekshirdim.',
      should_escalate: false,
      escalation_reason: '',
    });
  } finally {
    client.post = originalPost;
    config.GEMINI_API_KEY = originalApiKey;
  }
});

test('GeminiService.generateJsonWithTools preserves schema and system instructions when no tools are enabled', async () => {
  const client = getGeminiClient();
  const originalPost = client.post;
  const originalApiKey = config.GEMINI_API_KEY;

  let capturedBody: Record<string, unknown> | null = null;

  config.GEMINI_API_KEY = 'test-gemini-key';
  client.post = (async (_url, body) => {
    capturedBody = body as Record<string, unknown>;

    return {
      data: {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  text: '{"reply_text":"Tayyor","should_escalate":false,"escalation_reason":""}',
                },
              ],
            },
          },
        ],
      },
    };
  }) as typeof client.post;

  try {
    const payload = await GeminiService.generateJsonWithTools<{
      reply_text: string;
      should_escalate: boolean;
      escalation_reason: string;
    }>({
      prompt: 'test',
      schemaName: 'support agent reply',
      tools: [],
      systemInstruction: ['Instruction one'],
      responseSchema: {
        type: 'object',
        properties: {
          reply_text: { type: 'string' },
        },
        required: ['reply_text'],
      },
    });

    assert.deepEqual(payload, {
      reply_text: 'Tayyor',
      should_escalate: false,
      escalation_reason: '',
    });

    if (!capturedBody) {
      assert.fail('Expected Gemini request body to be captured');
    }

    const requestBody = capturedBody as Record<string, unknown>;
    assert.deepEqual(requestBody['systemInstruction'], {
      parts: [{ text: 'Instruction one' }],
    });
    assert.deepEqual(requestBody['generationConfig'], {
      responseMimeType: 'application/json',
      responseJsonSchema: {
        type: 'object',
        properties: {
          reply_text: { type: 'string' },
        },
        required: ['reply_text'],
      },
    });
  } finally {
    client.post = originalPost;
    config.GEMINI_API_KEY = originalApiKey;
  }
});

test('GeminiService.generateJsonWithTools sends structured output config separately from tool config', async () => {
  const client = getGeminiClient();
  const originalPost = client.post;
  const originalApiKey = config.GEMINI_API_KEY;

  let capturedBody: Record<string, unknown> | null = null;

  config.GEMINI_API_KEY = 'test-gemini-key';
  client.post = (async (_url, body) => {
    capturedBody = body as Record<string, unknown>;

    return {
      data: {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  text: '{"reply_text":"Salom","should_escalate":false,"escalation_reason":""}',
                },
              ],
            },
          },
        ],
      },
    };
  }) as typeof client.post;

  try {
    await GeminiService.generateJsonWithTools<{
      reply_text: string;
      should_escalate: boolean;
      escalation_reason: string;
    }>({
      prompt: 'test',
      schemaName: 'support agent reply',
      tools: [
        {
          declaration: {
            name: 'dummy_tool',
            description: 'No-op tool for request-shape coverage.',
            parameters: {
              type: 'object',
              properties: {},
            },
          },
          execute: async () => ({ ok: true }),
        },
      ],
      systemInstruction: ['Instruction one', 'Instruction two'],
      responseSchema: {
        type: 'object',
        properties: {
          reply_text: { type: 'string' },
        },
        required: ['reply_text'],
      },
      functionCallingConfig: {
        mode: 'VALIDATED',
      },
    });

    if (!capturedBody) {
      assert.fail('Expected Gemini request body to be captured');
    }

    const requestBody = capturedBody as Record<string, unknown>;

    assert.deepEqual(requestBody['systemInstruction'], {
      parts: [{ text: 'Instruction one' }, { text: 'Instruction two' }],
    });
    assert.deepEqual(requestBody['toolConfig'], {
      functionCallingConfig: {
        mode: 'VALIDATED',
      },
    });
    assert.deepEqual(requestBody['generationConfig'], {
      responseMimeType: 'application/json',
      responseJsonSchema: {
        type: 'object',
        properties: {
          reply_text: { type: 'string' },
        },
        required: ['reply_text'],
      },
    });
  } finally {
    client.post = originalPost;
    config.GEMINI_API_KEY = originalApiKey;
  }
});

test('GeminiService.generateJsonWithTools preserves function call ids and thought signatures across tool turns', async () => {
  const client = getGeminiClient();
  const originalPost = client.post;
  const originalApiKey = config.GEMINI_API_KEY;

  const requestBodies: Array<Record<string, unknown>> = [];

  config.GEMINI_API_KEY = 'test-gemini-key';
  client.post = (async (_url, body) => {
    const requestBody = body as Record<string, unknown>;
    requestBodies.push(requestBody);

    if (requestBodies.length === 1) {
      return {
        data: {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    functionCall: {
                      id: 'call-123',
                      name: 'dummy_tool',
                      args: {
                        query: 'iphone 16',
                      },
                    },
                    thoughtSignature: 'signature-abc',
                  },
                ],
              },
            },
          ],
        },
      };
    }

    return {
      data: {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  text: '{"reply_text":"Tekshirdim","should_escalate":false,"escalation_reason":""}',
                },
              ],
            },
          },
        ],
      },
    };
  }) as typeof client.post;

  try {
    const payload = await GeminiService.generateJsonWithTools<{
      reply_text: string;
      should_escalate: boolean;
      escalation_reason: string;
    }>({
      prompt: 'test',
      schemaName: 'support agent reply',
      tools: [
        {
          declaration: {
            name: 'dummy_tool',
            description: 'No-op tool for multi-turn coverage.',
            parameters: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                },
              },
              required: ['query'],
            },
          },
          execute: async (args) => ({
            ok: true,
            received_query: args.query,
          }),
        },
      ],
    });

    assert.deepEqual(payload, {
      reply_text: 'Tekshirdim',
      should_escalate: false,
      escalation_reason: '',
    });
    assert.equal(requestBodies.length, 2);

    const secondRequestContents = requestBodies[1].contents as Array<{
      role: string;
      parts: Array<Record<string, unknown>>;
    }>;

    assert.equal(secondRequestContents.length, 3);
    assert.deepEqual(secondRequestContents[1], {
      role: 'model',
      parts: [
        {
          functionCall: {
            id: 'call-123',
            name: 'dummy_tool',
            args: {
              query: 'iphone 16',
            },
          },
          thoughtSignature: 'signature-abc',
        },
      ],
    });
    assert.deepEqual(secondRequestContents[2], {
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: 'dummy_tool',
            id: 'call-123',
            response: {
              ok: true,
              received_query: 'iphone 16',
            },
          },
        },
      ],
    });
  } finally {
    client.post = originalPost;
    config.GEMINI_API_KEY = originalApiKey;
  }
});

test('GeminiService.generateJsonWithTools reuses grounded results for duplicate tool calls', async () => {
  const client = getGeminiClient();
  const originalPost = client.post;
  const originalApiKey = config.GEMINI_API_KEY;

  let executeCount = 0;
  const requestBodies: Array<Record<string, unknown>> = [];

  config.GEMINI_API_KEY = 'test-gemini-key';
  client.post = (async (_url, body) => {
    const requestBody = body as Record<string, unknown>;
    requestBodies.push(requestBody);

    if (requestBodies.length <= 2) {
      return {
        data: {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    functionCall: {
                      id: `call-${requestBodies.length}`,
                      name: 'dummy_tool',
                      args: {
                        query: 'iphone 15 pro max used',
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      };
    }

    return {
      data: {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  text: '{"reply_text":"Narxlarni tayyorlab berdim","should_escalate":false,"escalation_reason":""}',
                },
              ],
            },
          },
        ],
      },
    };
  }) as typeof client.post;

  try {
    const payload = await GeminiService.generateJsonWithTools<{
      reply_text: string;
      should_escalate: boolean;
      escalation_reason: string;
    }>({
      prompt: 'test',
      schemaName: 'support agent reply',
      tools: [
        {
          declaration: {
            name: 'dummy_tool',
            description: 'No-op tool for duplicate-call coverage.',
            parameters: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                },
              },
              required: ['query'],
            },
          },
          execute: async (args) => {
            executeCount += 1;
            return {
              ok: true,
              query: args.query,
            };
          },
        },
      ],
      maxToolIterations: 3,
    });

    assert.deepEqual(payload, {
      reply_text: 'Narxlarni tayyorlab berdim',
      should_escalate: false,
      escalation_reason: '',
    });
    assert.equal(executeCount, 1);
    assert.equal(requestBodies.length, 3);

    const thirdRequestContents = requestBodies[2].contents as Array<{
      role: string;
      parts: Array<Record<string, unknown>>;
    }>;
    const duplicateNote = thirdRequestContents
      .flatMap((content) => content.parts)
      .find(
        (part) =>
          typeof part.text === 'string' && part.text.includes('Duplicate call to dummy_tool'),
      );

    assert.ok(duplicateNote);
  } finally {
    client.post = originalPost;
    config.GEMINI_API_KEY = originalApiKey;
  }
});
