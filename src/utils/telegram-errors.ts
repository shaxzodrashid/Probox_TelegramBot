import { GrammyError } from 'grammy';

/**
 * Telegram Bot API error codes for user blocking scenarios
 * 
 * These errors indicate the bot cannot message the user anymore:
 * - 403: Forbidden (user blocked the bot or deleted their account)
 * - 400: Bad Request with user deactivated message
 */

/**
 * Check if an error indicates the user has blocked the bot
 * or their account is no longer reachable
 */
export function isUserBlockedError(error: unknown): boolean {
    if (error instanceof GrammyError) {
        // Error code 403 - User has blocked the bot
        if (error.error_code === 403) {
            return true;
        }

        // Error code 400 with specific descriptions
        if (error.error_code === 400) {
            const description = error.description.toLowerCase();
            // User deactivated their account
            if (description.includes('user is deactivated')) {
                return true;
            }
            // Chat not found (user deleted)
            if (description.includes('chat not found')) {
                return true;
            }
        }
    }

    // Fallback: check error message string for known patterns
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return (
            message.includes('bot was blocked by the user') ||
            message.includes('user is deactivated') ||
            message.includes('chat not found') ||
            message.includes('forbidden')
        );
    }

    return false;
}

/**
 * Check if an error is a rate limit error (429)
 */
export function isRateLimitError(error: unknown): boolean {
    if (error instanceof GrammyError) {
        return error.error_code === 429;
    }
    return false;
}

/**
 * Get retry-after seconds from rate limit error
 */
export function getRetryAfterSeconds(error: unknown): number {
    if (error instanceof GrammyError && error.error_code === 429) {
        // Try to extract retry_after from the error
        const match = error.description.match(/retry after (\d+)/i);
        if (match) {
            return parseInt(match[1], 10);
        }
    }
    return 30; // Default 30 seconds
}
