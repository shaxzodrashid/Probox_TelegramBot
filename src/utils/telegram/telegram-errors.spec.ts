import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { GrammyError } from 'grammy';
import { isUserBlockedError } from './telegram-errors';

// Helper to create GrammyError
function createGrammyError(errorCode: number, description: string): GrammyError {
    return new GrammyError("msg", { ok: false, error_code: errorCode, description } as any, "method", {});
}

describe('isUserBlockedError', () => {
    test('should return true for GrammyError with error_code 403', () => {
        const error = createGrammyError(403, 'Forbidden: bot was blocked by the user');
        assert.equal(isUserBlockedError(error), true);
    });

    test('should return true for GrammyError with error_code 400 and user deactivated description', () => {
        const error = createGrammyError(400, 'Bad Request: user is deactivated');
        assert.equal(isUserBlockedError(error), true);
    });

    test('should return true for GrammyError with error_code 400 and chat not found description', () => {
        const error = createGrammyError(400, 'Bad Request: chat not found');
        assert.equal(isUserBlockedError(error), true);
    });

    test('should return false for GrammyError with error_code 400 and unrelated description', () => {
        const error = createGrammyError(400, 'Bad Request: message is not modified');
        assert.equal(isUserBlockedError(error), false);
    });

    test('should return false for GrammyError with other error codes', () => {
        const error = createGrammyError(429, 'Too Many Requests: retry after 30');
        assert.equal(isUserBlockedError(error), false);
    });

    test('should return true for generic Error with bot blocked message', () => {
        const error = new Error('Some Error: bot was blocked by the user');
        assert.equal(isUserBlockedError(error), true);
    });

    test('should return true for generic Error with user deactivated message', () => {
        const error = new Error('Some Error: user is deactivated');
        assert.equal(isUserBlockedError(error), true);
    });

    test('should return true for generic Error with chat not found message', () => {
        const error = new Error('Some Error: chat not found');
        assert.equal(isUserBlockedError(error), true);
    });

    test('should return true for generic Error with forbidden message', () => {
        const error = new Error('Some Error: forbidden');
        assert.equal(isUserBlockedError(error), true);
    });

    test('should return false for generic Error with unrelated message', () => {
        const error = new Error('Some Error: something went wrong');
        assert.equal(isUserBlockedError(error), false);
    });

    test('should return false for non-error objects', () => {
        assert.equal(isUserBlockedError(null), false);
        assert.equal(isUserBlockedError(undefined), false);
        assert.equal(isUserBlockedError('string error'), false);
        assert.equal(isUserBlockedError({ message: 'bot was blocked by the user' }), false);
    });
});
