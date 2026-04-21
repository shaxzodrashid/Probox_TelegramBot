import test from 'node:test';
import assert from 'node:assert/strict';

import { formatGeminiRequestFailure } from './gemini-error.util';

test('formatGeminiRequestFailure redacts Gemini API keys from Axios error details', () => {
  const message = formatGeminiRequestFailure({
    isAxiosError: true,
    message: 'timeout of 30000ms exceeded',
    code: 'ECONNABORTED',
    response: undefined,
    config: {
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/models',
      url: '/gemini-3.1-flash-lite-preview:generateContent?key=SECRET_API_KEY',
    },
  });

  assert.match(message, /timeout of 30000ms exceeded/);
  assert.match(message, /code=ECONNABORTED/);
  assert.match(
    message,
    /url=https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.1-flash-lite-preview:generateContent\?key=\[REDACTED\]/,
  );
  assert.doesNotMatch(message, /SECRET_API_KEY/);
});

test('formatGeminiRequestFailure includes Gemini response body and compact request context', () => {
  const message = formatGeminiRequestFailure({
    isAxiosError: true,
    message: 'Request failed with status code 400',
    code: 'ERR_BAD_REQUEST',
    response: {
      status: 400,
      data: {
        error: {
          code: 400,
          message: 'Invalid request payload',
          status: 'INVALID_ARGUMENT',
        },
      },
    },
    config: {
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/models',
      url: '/gemini-2.5-flash:generateContent',
      data: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Customer prompt should not be logged verbatim here.' }],
          },
        ],
        systemInstruction: {
          parts: [{ text: 'Instruction one' }, { text: 'Instruction two' }],
        },
        tools: [
          {
            functionDeclarations: [
              {
                name: 'lookup_store_items',
                parameters: { type: 'object', properties: {} },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: { type: 'object' },
        },
        toolConfig: {
          functionCallingConfig: {
            mode: 'AUTO',
          },
        },
      }),
    },
  });

  assert.match(message, /status=400/);
  assert.match(message, /Invalid request payload/);
  assert.match(message, /"structuredOutput":true/);
  assert.match(message, /"responseJsonSchema":"present"/);
  assert.match(message, /"mode":"AUTO"/);
  assert.match(message, /"toolNames":\["lookup_store_items"\]/);
  assert.match(message, /"systemInstructionParts":2/);
  assert.doesNotMatch(message, /Customer prompt should not be logged verbatim here/);
});
