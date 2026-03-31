import db from '../database/database';

export type MessageTemplateType =
  | 'store_visit'
  | 'purchase'
  | 'referral'
  | 'payment_reminder_d2'
  | 'payment_reminder_d1'
  | 'payment_reminder_d0'
  | 'payment_paid_on_time'
  | 'payment_overdue'
  | 'payment_paid_late'
  | 'winner_notification';

export interface MessageTemplate {
  id: number;
  template_key: string;
  template_type: MessageTemplateType;
  title: string;
  content_uz: string;
  content_ru: string;
  channel: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export class MessageTemplateService {
  static async getActiveTemplateByType(type: MessageTemplateType): Promise<MessageTemplate | null> {
    const template = await db<MessageTemplate>('message_templates')
      .where({ template_type: type, is_active: true, channel: 'telegram_bot' })
      .orderBy('updated_at', 'desc')
      .first();

    return template || null;
  }

  static async getById(id: number): Promise<MessageTemplate | null> {
    const template = await db<MessageTemplate>('message_templates').where({ id }).first();
    return template || null;
  }

  static async listTemplates(): Promise<MessageTemplate[]> {
    return db<MessageTemplate>('message_templates').orderBy('template_type', 'asc').orderBy('id', 'asc');
  }

  static async create(data: Omit<MessageTemplate, 'id' | 'created_at' | 'updated_at'>): Promise<MessageTemplate> {
    const [template] = await db<MessageTemplate>('message_templates')
      .insert({
        ...data,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');
    return template;
  }

  static async update(id: number, data: Partial<Omit<MessageTemplate, 'id' | 'created_at' | 'updated_at'>>): Promise<MessageTemplate | null> {
    const [template] = await db<MessageTemplate>('message_templates')
      .where({ id })
      .update({
        ...data,
        updated_at: new Date(),
      })
      .returning('*');
    return template || null;
  }

  static async setTemplateActiveState(id: number, isActive: boolean): Promise<boolean> {
    const updatedCount = await db('message_templates')
      .where({ id })
      .update({ is_active: isActive, updated_at: new Date() });
    return updatedCount > 0;
  }

  static async delete(id: number): Promise<boolean> {
    const deletedCount = await db('message_templates').where({ id }).delete();
    return deletedCount > 0;
  }

  static render(
    template: MessageTemplate,
    locale: string,
    placeholders: Record<string, string | number | null | undefined>,
  ): string {
    const raw = locale === 'ru' ? template.content_ru : template.content_uz;

    return raw.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string, offset: number) => {
      const value = placeholders[key];
      if (value === null || value === undefined || value === '') {
        return '';
      }
      
      const stringValue = String(value);
      if (key === 'coupon_code') {
        // Check if the placeholder is already wrapped in <code> tags
        const prefix = raw.substring(Math.max(0, offset - 6), offset);
        const suffix = raw.substring(offset + match.length, offset + match.length + 7);
        
        if (prefix.toLowerCase().endsWith('<code>') && suffix.toLowerCase().startsWith('</code>')) {
          return stringValue;
        }
        
        return `<code>${stringValue}</code>`;
      }
      
      return stringValue;
    });
  }
}
