import db from '../database/database';

export interface User {
  id: number;
  telegram_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  language_code: string;
  is_admin: boolean;
  created_at: Date;
  updated_at: Date;
}

export class UserService {
  static async getUserByPhone(phoneNumber: string): Promise<User | null> {
    const normalizedPhone = phoneNumber.replace('+', '');
    const user = await db('users')
      .where('phone_number', normalizedPhone)
      .orWhere('phone_number', `+${normalizedPhone}`)
      .first();
    return user || null;
  }

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
}
