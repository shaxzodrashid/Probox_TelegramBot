import { redisService } from '../redis/redis.service';
import { logger } from '../utils/logger';

/**
 * LockService - Redis-based distributed locking for duplicate prevention
 * 
 * Lock Types:
 * - Reply Intent Lock: Prevents multiple admins from starting reply (30s TTL)
 * - Reply Confirmation Lock: Ensures atomicity of reply operation (60s TTL)
 */
export class LockService {
    private static readonly LOCK_PREFIX = 'lock:ticket:';
    private static readonly REPLY_LOCK_PREFIX = 'lock:ticket:reply:';
    private static readonly DEFAULT_INTENT_TTL = 30; // seconds
    private static readonly DEFAULT_CONFIRM_TTL = 60; // seconds

    /**
     * Acquire reply lock for a ticket
     * Uses Redis SET NX for atomic lock acquisition
     * @param ticketId - The ticket ID to lock
     * @param adminId - The admin attempting to acquire the lock
     * @param ttlSeconds - Lock TTL in seconds (default: 30)
     * @returns true if lock acquired, false if already held
     */
    static async acquireReplyLock(
        ticketId: number | string,
        adminId: number,
        ttlSeconds: number = this.DEFAULT_INTENT_TTL
    ): Promise<boolean> {
        const key = `${this.LOCK_PREFIX}${ticketId}`;
        const redis = redisService.getClient();

        // SET NX - only set if not exists
        const result = await redis.set(key, adminId.toString(), 'EX', ttlSeconds, 'NX');

        if (result === 'OK') {
            logger.info(`Lock acquired for ticket ${ticketId} by admin ${adminId}`);
            return true;
        }

        logger.info(`Lock acquisition failed for ticket ${ticketId} - already held`);
        return false;
    }

    /**
     * Release reply lock for a ticket
     * Only releases if the lock is held by the same admin
     * @param ticketId - The ticket ID to unlock
     * @param adminId - The admin attempting to release the lock
     * @returns true if lock released, false if not held or held by another admin
     */
    static async releaseReplyLock(
        ticketId: number | string,
        adminId: number
    ): Promise<boolean> {
        const key = `${this.LOCK_PREFIX}${ticketId}`;

        // Check if lock is held by this admin
        const currentHolder = await this.getLockHolder(ticketId);

        if (currentHolder === adminId) {
            await redisService.delete(key);
            logger.info(`Lock released for ticket ${ticketId} by admin ${adminId}`);
            return true;
        }

        logger.warn(`Lock release failed for ticket ${ticketId} - not held by admin ${adminId}`);
        return false;
    }

    /**
     * Get the admin ID holding the lock
     * @param ticketId - The ticket ID to check
     * @returns Admin ID if locked, null if not locked
     */
    static async getLockHolder(ticketId: number | string): Promise<number | null> {
        const key = `${this.LOCK_PREFIX}${ticketId}`;
        const holder = await redisService.get<string>(key);

        if (holder) {
            return parseInt(holder, 10);
        }

        return null;
    }

    /**
     * Confirm reply was sent - creates a separate lock to prevent retries
     * @param ticketId - The ticket ID that was replied to
     * @param ttlSeconds - Lock TTL in seconds (default: 60)
     * @returns true if confirmation lock set
     */
    static async confirmReply(
        ticketId: number | string,
        ttlSeconds: number = this.DEFAULT_CONFIRM_TTL
    ): Promise<boolean> {
        const key = `${this.REPLY_LOCK_PREFIX}${ticketId}`;
        const redis = redisService.getClient();

        const result = await redis.set(key, 'confirmed', 'EX', ttlSeconds, 'NX');

        if (result === 'OK') {
            logger.info(`Reply confirmed for ticket ${ticketId}`);
            return true;
        }

        return false;
    }

    /**
     * Check if reply was already confirmed
     * @param ticketId - The ticket ID to check
     * @returns true if reply was confirmed, false otherwise
     */
    static async isReplyConfirmed(ticketId: number | string): Promise<boolean> {
        const key = `${this.REPLY_LOCK_PREFIX}${ticketId}`;
        const exists = await redisService.exists(key);
        return exists > 0;
    }

    /**
     * Extend lock TTL if still held by the same admin
     * @param ticketId - The ticket ID
     * @param adminId - The admin ID
     * @param ttlSeconds - New TTL in seconds
     * @returns true if extended, false if not held
     */
    static async extendLock(
        ticketId: number | string,
        adminId: number,
        ttlSeconds: number = this.DEFAULT_INTENT_TTL
    ): Promise<boolean> {
        const currentHolder = await this.getLockHolder(ticketId);

        if (currentHolder === adminId) {
            const key = `${this.LOCK_PREFIX}${ticketId}`;
            await redisService.expire(key, ttlSeconds);
            logger.info(`Lock extended for ticket ${ticketId} by admin ${adminId}`);
            return true;
        }

        return false;
    }
}
