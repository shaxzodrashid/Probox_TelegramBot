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
