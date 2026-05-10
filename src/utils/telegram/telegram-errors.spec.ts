import test from 'node:test';
import assert from 'node:assert/strict';
import { GrammyError } from 'grammy';
import { isRateLimitError } from './telegram-errors';

test('isRateLimitError returns true for a GrammyError with error_code 429', () => {
  const error = new GrammyError(
    'Too Many Requests: retry after 30',
    {
      ok: false,
      error_code: 429,
      description: 'Too Many Requests: retry after 30',
    } as any,
    'sendMessage',
    {},
  );
  assert.equal(isRateLimitError(error), true);
});

test('isRateLimitError returns false for a GrammyError with error_code !== 429', () => {
  const error = new GrammyError(
    'Bad Request: chat not found',
    {
      ok: false,
      error_code: 400,
      description: 'Bad Request: chat not found',
    } as any,
    'sendMessage',
    {},
  );
  assert.equal(isRateLimitError(error), false);
});

test('isRateLimitError returns false for a regular Error', () => {
  const error = new Error('Some error');
  assert.equal(isRateLimitError(error), false);
});

test('isRateLimitError returns false for other types of values', () => {
  assert.equal(isRateLimitError(null), false);
  assert.equal(isRateLimitError(undefined), false);
  assert.equal(isRateLimitError('error'), false);
  assert.equal(isRateLimitError(123), false);
  assert.equal(isRateLimitError({}), false);
});
