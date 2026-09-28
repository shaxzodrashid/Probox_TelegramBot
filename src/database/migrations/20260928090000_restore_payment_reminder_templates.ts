import type { Knex } from 'knex';

// Only ordinary payment messages. Never recreate the retired reward templates.
export const PAYMENT_REMINDER_DEFAULTS = [
  {
    type: 'payment_reminder_d2',
    title: 'Payment due in two days',
    uz: 'Assalomu alaykum, {{customer_name}}! To‘lov sanasi: {{payment_due_date}}. To‘lovga 2 kun qoldi.',
    ru: 'Здравствуйте, {{customer_name}}! Дата платежа: {{payment_due_date}}. До платежа осталось 2 дня.',
  },
  {
    type: 'payment_reminder_d1',
    title: 'Payment due tomorrow',
    uz: 'Assalomu alaykum, {{customer_name}}! Ertaga, {{payment_due_date}}, to‘lov kuni.',
    ru: 'Здравствуйте, {{customer_name}}! Завтра, {{payment_due_date}}, наступает срок платежа.',
  },
  {
    type: 'payment_reminder_d0',
    title: 'Payment due today',
    uz: 'Assalomu alaykum, {{customer_name}}! Bugun, {{payment_due_date}}, to‘lov kuni.',
    ru: 'Здравствуйте, {{customer_name}}! Сегодня, {{payment_due_date}}, наступает срок платежа.',
  },
  {
    type: 'payment_overdue',
    title: 'Payment overdue',
    uz: 'Assalomu alaykum, {{customer_name}}! {{payment_due_date}} sanasidagi to‘lov muddati o‘tgan. Iltimos, to‘lovni amalga oshiring. To‘lov qilgan bo‘lsangiz, ushbu xabarni e’tiborsiz qoldiring.',
    ru: 'Здравствуйте, {{customer_name}}! Срок платежа от {{payment_due_date}} истёк. Пожалуйста, внесите платёж. Если вы уже оплатили, не обращайте внимания на это сообщение.',
  },
  {
    type: 'payment_paid_late',
    title: 'Late payment received',
    uz: 'Assalomu alaykum, {{customer_name}}! {{payment_due_date}} sanasiga belgilangan to‘lovingiz qabul qilindi. Rahmat!',
    ru: 'Здравствуйте, {{customer_name}}! Ваш платёж со сроком {{payment_due_date}} получен. Спасибо!',
  },
];

export async function up(knex: Knex): Promise<void> {
  for (const template of PAYMENT_REMINDER_DEFAULTS) {
    const existing = await knex('message_templates')
      .where({ template_type: template.type, channel: 'telegram_bot', is_active: true })
      .first();
    if (existing) continue;
    await knex('message_templates')
      .insert({
        template_key: `retirement_default_${template.type}`,
        template_type: template.type,
        title: template.title,
        content_uz: template.uz,
        content_ru: template.ru,
        channel: 'telegram_bot',
        is_active: true,
      })
      .onConflict('template_key')
      .ignore();
  }
}

export async function down(): Promise<void> {
  // Keep restored templates and dispatch references; rollback must not delete message history.
}
