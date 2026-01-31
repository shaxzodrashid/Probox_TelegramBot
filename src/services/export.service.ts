import ExcelJS from 'exceljs';
import { AdminService } from './admin.service';
import { SupportService } from './support.service';
import { User } from './user.service';
import { logger } from '../utils/logger';
import { redisService } from '../redis/redis.service';
import { config } from '../config';
import { SupportTicketWithUser } from '../types/support.types';

/**
 * ExportService - Excel generation for admin exports
 */
export class ExportService {
    private static readonly RATE_KEY_PREFIX = 'rate:export:';
    private static readonly RATE_WINDOW = 3600; // 1 hour in seconds

    /**
     * Check rate limit for exports
     */
    static async checkRateLimit(adminId: number): Promise<boolean> {
        const key = `${this.RATE_KEY_PREFIX}${adminId}`;
        const redis = redisService.getClient();

        const current = await redis.incr(key);
        if (current === 1) {
            await redis.expire(key, this.RATE_WINDOW);
        }

        return current <= config.EXPORT_RATE_LIMIT;
    }

    /**
     * Get remaining rate limit time
     */
    static async getRateLimitRemaining(adminId: number): Promise<number> {
        const key = `${this.RATE_KEY_PREFIX}${adminId}`;
        const ttl = await redisService.getClient().ttl(key);
        return ttl > 0 ? ttl : 0;
    }

    /**
     * Export users to Excel
     * @returns Excel file as Buffer
     */
    static async exportUsersToExcel(): Promise<Buffer> {
        const users = await AdminService.getAllUsers();
        const tickets = await SupportService.getAllTickets();

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Probox Bot';
        workbook.created = new Date();

        // 1. Users Worksheet
        const usersSheet = workbook.addWorksheet('Users', {
            properties: { tabColor: { argb: 'FF0066' } }
        });

        // Define columns for Users
        usersSheet.columns = [
            { header: 'ID', key: 'id', width: 10 },
            { header: 'Telegram ID', key: 'telegram_id', width: 15 },
            { header: 'Username', key: 'username', width: 20 },
            { header: 'First Name', key: 'first_name', width: 20 },
            { header: 'Last Name', key: 'last_name', width: 20 },
            { header: 'Phone Number', key: 'phone_number', width: 18 },
            { header: 'SAP Code', key: 'sap_card_code', width: 15 },
            { header: 'Language', key: 'language_code', width: 10 },
            { header: 'Is Admin', key: 'is_admin', width: 10 },
            { header: 'Support Banned', key: 'is_support_banned', width: 15 },
            { header: 'Created At', key: 'created_at', width: 20 },
        ];

        // Style header row for Users
        usersSheet.getRow(1).font = { bold: true };
        usersSheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4A90D9' }
        };
        usersSheet.getRow(1).alignment = { horizontal: 'center' };

        // Add user data rows
        users.forEach((user: User) => {
            usersSheet.addRow({
                id: user.id,
                telegram_id: user.telegram_id,
                username: user.username || '-',
                first_name: user.first_name || '-',
                last_name: user.last_name || '-',
                phone_number: user.phone_number || '-',
                sap_card_code: user.sap_card_code || '-',
                language_code: user.language_code || 'uz',
                is_admin: user.is_admin ? 'Yes' : 'No',
                is_support_banned: user.is_support_banned ? 'Yes' : 'No',
                created_at: user.created_at ? new Date(user.created_at).toLocaleString('uz-UZ') : '-',
            });
        });

        // Auto-filter for Users
        usersSheet.autoFilter = {
            from: 'A1',
            to: 'K1',
        };

        // 2. Support History Worksheet
        const supportSheet = workbook.addWorksheet('Support History', {
            properties: { tabColor: { argb: '00FF00' } }
        });

        // Define columns for Support History
        supportSheet.columns = [
            { header: 'ID', key: 'id', width: 10 },
            { header: 'Ticket Number', key: 'ticket_number', width: 15 },
            { header: 'Telegram ID', key: 'user_telegram_id', width: 15 },
            { header: 'User Name', key: 'user_name', width: 25 },
            { header: 'Phone Number', key: 'phone_number', width: 18 },
            { header: 'Message', key: 'message_text', width: 40 },
            { header: 'Status', key: 'status', width: 12 },
            { header: 'Reply Message', key: 'reply_message', width: 40 },
            { header: 'Created At', key: 'created_at', width: 20 },
            { header: 'Replied At', key: 'replied_at', width: 20 },
        ];

        // Style header row for Support History
        supportSheet.getRow(1).font = { bold: true };
        supportSheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4A90D9' }
        };
        supportSheet.getRow(1).alignment = { horizontal: 'center' };

        // Add support data rows
        tickets.forEach((ticket: SupportTicketWithUser) => {
            const userName = [ticket.first_name, ticket.last_name].filter(Boolean).join(' ') || 'Unknown';
            supportSheet.addRow({
                id: ticket.id,
                ticket_number: ticket.ticket_number,
                user_telegram_id: ticket.user_telegram_id,
                user_name: userName,
                phone_number: ticket.phone_number || '-',
                message_text: ticket.message_text,
                status: ticket.status.toUpperCase(),
                reply_message: ticket.reply_message || '-',
                created_at: ticket.created_at ? new Date(ticket.created_at).toLocaleString('uz-UZ') : '-',
                replied_at: ticket.replied_at ? new Date(ticket.replied_at).toLocaleString('uz-UZ') : '-',
            });
        });

        // Auto-filter for Support History
        supportSheet.autoFilter = {
            from: 'A1',
            to: 'J1',
        };

        const arrayBuffer = await workbook.xlsx.writeBuffer();
        const buffer = Buffer.from(arrayBuffer);
        logger.info(`Excel export generated with ${users.length} users and ${tickets.length} support tickets`);

        return buffer;
    }
}

