import db from '../database/database';
import { User } from './user.service';
import { logger } from '../utils/logger';

export interface PaginatedResult<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface UserFilter {
    isAdmin?: boolean;
    isSupportBanned?: boolean;
    search?: string; // Search by name or phone
}

/**
 * AdminService - Admin-specific business logic
 */
export class AdminService {
    /**
     * Get paginated user list with optional filters
     * @param page - Page number (1-indexed)
     * @param limit - Items per page
     * @param filter - Optional filters
     */
    static async getUsers(
        page: number = 1,
        limit: number = 20,
        filter?: UserFilter
    ): Promise<PaginatedResult<User>> {
        let query = db('users');
        let countQuery = db('users');

        // Apply filters
        if (filter) {
            if (filter.isAdmin !== undefined) {
                query = query.where('is_admin', filter.isAdmin);
                countQuery = countQuery.where('is_admin', filter.isAdmin);
            }

            if (filter.isSupportBanned !== undefined) {
                query = query.where('is_support_banned', filter.isSupportBanned);
                countQuery = countQuery.where('is_support_banned', filter.isSupportBanned);
            }

            if (filter.search) {
                const searchPattern = `%${filter.search}%`;
                query = query.where(function () {
                    this.whereRaw('LOWER(first_name) LIKE LOWER(?)', [searchPattern])
                        .orWhereRaw('LOWER(last_name) LIKE LOWER(?)', [searchPattern])
                        .orWhere('phone_number', 'like', searchPattern);
                });
                countQuery = countQuery.where(function () {
                    this.whereRaw('LOWER(first_name) LIKE LOWER(?)', [searchPattern])
                        .orWhereRaw('LOWER(last_name) LIKE LOWER(?)', [searchPattern])
                        .orWhere('phone_number', 'like', searchPattern);
                });
            }
        }

        // Get total count
        const [{ count }] = await countQuery.count('id as count');
        const total = parseInt(count as string, 10);

        // Calculate pagination
        const offset = (page - 1) * limit;
        const totalPages = Math.ceil(total / limit);

        // Get paginated data
        const data = await query
            .orderBy('created_at', 'desc')
            .limit(limit)
            .offset(offset);

        return {
            data,
            total,
            page,
            limit,
            totalPages,
        };
    }

    /**
     * Search users by name, phone number or telegram ID
     * @param searchTerm - Name, phone or ID to search
     * @param limit - Max results to return
     */
    static async searchUsers(
        searchTerm: string,
        limit: number = 10
    ): Promise<User[]> {
        const searchPattern = `%${searchTerm}%`;
        const digits = searchTerm.replace(/\D+/g, '');
        const isNumeric = /^\d+$/.test(searchTerm.trim());

        // Try to normalize search term as Uzbek phone number
        let normalizedPhone = '';
        if (digits.length === 9) {
            normalizedPhone = `+998${digits}`;
        } else if (digits.length === 12 && digits.startsWith('998')) {
            normalizedPhone = `+${digits}`;
        }

        const users = await db('users')
            .where(function () {
                this.whereRaw('LOWER(first_name) LIKE LOWER(?)', [searchPattern])
                    .orWhereRaw('LOWER(last_name) LIKE LOWER(?)', [searchPattern])
                    .orWhere('phone_number', 'like', searchPattern);

                if (normalizedPhone) {
                    this.orWhere('phone_number', 'like', `%${normalizedPhone}%`);
                }

                if (isNumeric) {
                    this.orWhere('telegram_id', parseInt(searchTerm.trim(), 10));
                }
            })
            .orderBy('first_name', 'asc')
            .limit(limit);

        return users;
    }

    /**
     * Ban or unban user from support
     * @param telegramId - User's Telegram ID
     * @param banned - true to ban, false to unban
     */
    static async banUserFromSupport(
        telegramId: number,
        banned: boolean
    ): Promise<boolean> {
        const result = await db('users')
            .where('telegram_id', telegramId)
            .update({
                is_support_banned: banned,
                updated_at: new Date(),
            });

        if (result > 0) {
            logger.info(`User ${telegramId} support ${banned ? 'banned' : 'unbanned'}`);
            return true;
        }

        return false;
    }

    /**
     * Check if user is banned from support
     */
    static async isUserSupportBanned(telegramId: number): Promise<boolean> {
        const user = await db('users')
            .where('telegram_id', telegramId)
            .select('is_support_banned')
            .first();

        return user?.is_support_banned ?? false;
    }

    /**
     * Get all users for export
     * Returns all user data for Excel generation
     */
    static async getAllUsers(): Promise<User[]> {
        const users = await db('users')
            .where('is_admin', false)
            .orderBy('created_at', 'desc');
        return users;
    }

    /**
     * Get user count
     */
    static async getUserCount(): Promise<number> {
        const [{ count }] = await db('users').count('id as count');
        return parseInt(count as string, 10);
    }

    /**
     * Get user statistics
     */
    static async getUserStats(): Promise<{
        total: number;
        admins: number;
        supportBanned: number;
        withSapCode: number;
    }> {
        const total = await this.getUserCount();

        const [admins] = await db('users')
            .where('is_admin', true)
            .count('id as count');

        const [supportBanned] = await db('users')
            .where('is_support_banned', true)
            .count('id as count');

        const [withSapCode] = await db('users')
            .whereNotNull('sap_card_code')
            .count('id as count');

        return {
            total,
            admins: parseInt(admins.count as string, 10),
            supportBanned: parseInt(supportBanned.count as string, 10),
            withSapCode: parseInt(withSapCode.count as string, 10),
        };
    }

    /**
     * Get user by Telegram ID with support ban info
     */
    static async getUserDetails(telegramId: number): Promise<User | null> {
        const user = await db('users')
            .where('telegram_id', telegramId)
            .first();
        return user || null;
    }
}
