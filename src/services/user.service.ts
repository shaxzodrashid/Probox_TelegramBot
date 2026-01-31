import db from '../database/database';

export interface User {
  id: number;
  telegram_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  sap_card_code?: string;
  language_code: string;
  is_admin: boolean;
  is_support_banned?: boolean;
  created_at: Date;
  updated_at: Date;
}

export class UserService {
  static async getUserByTelegramId(telegramId: number): Promise<User | null> {
    const user = await db('users').where('telegram_id', telegramId).first();
    return user || null;
  }

  static async createUser(userData: Partial<User>): Promise<User> {
    const [result] = await db('users').insert(userData).returning('id');
    const id = typeof result === 'object' ? result.id : result;
    const user = await db('users').where('id', id).first();
    return user;
  }

  static async updateUser(id: number, userData: Partial<User>): Promise<User> {
    await db('users').where('id', id).update(userData);
    const user = await db('users').where('id', id).first();
    return user;
  }

  static async updateUserLanguage(telegramId: number, languageCode: string): Promise<void> {
    await db('users')
      .where('telegram_id', telegramId)
      .update({ language_code: languageCode, updated_at: new Date() });
  }

  static async updateUserName(telegramId: number, firstName: string, lastName: string): Promise<void> {
    await db('users')
      .where('telegram_id', telegramId)
      .update({ first_name: firstName, last_name: lastName, updated_at: new Date() });
  }

  static async updateUserPhone(telegramId: number, phoneNumber: string): Promise<void> {
    await db('users')
      .where('telegram_id', telegramId)
      .update({ phone_number: phoneNumber, updated_at: new Date() });
  }

  /**
   * Mark a user as blocked (user has blocked the bot)
   * This is detected from Telegram API errors when sending messages fails
   */
  static async markUserAsBlocked(telegramId: number): Promise<void> {
    await db('users')
      .where('telegram_id', telegramId)
      .update({ is_blocked: true, updated_at: new Date() });
  }

  /**
   * Unblock a user (e.g., when they start the bot again)
   */
  static async unblockUser(telegramId: number): Promise<void> {
    await db('users')
      .where('telegram_id', telegramId)
      .update({ is_blocked: false, updated_at: new Date() });
  }
  /**
   * Unblock a user only if they are currently blocked.
   * This limits unnecessary updates and timestamp changes.
   */
  static async unblockUserIfBlocked(telegramId: number): Promise<void> {
    await db('users')
      .where('telegram_id', telegramId)
      .andWhere('is_blocked', true)
      .update({ is_blocked: false, updated_at: new Date() });
  }
}
