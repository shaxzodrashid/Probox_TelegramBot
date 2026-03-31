import { InlineKeyboard, Keyboard } from 'grammy';
import { BotContext, BotConversation, MessageTemplateEditableField } from '../types/context';
import { MessageTemplate, MessageTemplateService, MessageTemplateType } from '../services/message-template.service';
import { getAdminMenuKeyboard } from '../keyboards/admin.keyboards';
import {
  getAdminTemplateDetailKeyboard,
  getAdminTemplatesKeyboard,
  ADMIN_TEMPLATE_BACK_TO_LIST_CALLBACK
} from '../keyboards/template.keyboards';
import { i18n } from '../i18n';
import { logger } from '../utils/logger';

const TEMPLATE_TYPES: MessageTemplateType[] = [
  'store_visit',
  'purchase',
  'referral',
  'payment_reminder_d2',
  'payment_reminder_d1',
  'payment_reminder_d0',
  'payment_paid_on_time',
  'payment_overdue',
  'payment_paid_late',
  'winner_notification'
];

const getCancelKeyboard = (locale: string) =>
  new Keyboard()
    .text(i18n.t(locale, 'admin_cancel'))
    .resized()
    .oneTime();

const isCancelText = (value: string, locale: string): boolean => value === i18n.t(locale, 'admin_cancel');

const buildAdminTemplateSummary = (template: MessageTemplate, locale: string): string => {
  const status = template.is_active
    ? i18n.t(locale, 'admin_campaign_status_active')
    : i18n.t(locale, 'admin_campaign_status_inactive');

  return [
    `<b>${i18n.t(locale, 'admin_campaign_template_detail_header')}</b>`,
    '',
    `<b>${template.title}</b>`,
    `🔑 ${i18n.t(locale, 'admin_campaign_edit_template_key')}: <code>${template.template_key}</code>`,
    `📂 ${i18n.t(locale, 'admin_campaign_edit_template_type')}: <code>${template.template_type}</code>`,
    `📡 ${i18n.t(locale, 'admin_campaign_status_label')}: ${status}`,
    '',
    `🇺🇿 <b>${i18n.t(locale, 'admin_campaign_edit_template_content_uz')}:</b>`,
    `${template.content_uz}`,
    '',
    `🇷🇺 <b>${i18n.t(locale, 'admin_campaign_edit_template_content_ru')}:</b>`,
    `${template.content_ru}`,
  ].join('\n');
};

export const showAdminTemplatesList = async (ctx: BotContext, locale: string) => {
  const templates = await MessageTemplateService.listTemplates();
  
  // Basic pagination simulation if needed, but for now just list all or first N
  const page = 1;
  const totalPages = 1;

  await ctx.reply(i18n.t(locale, 'admin_campaign_templates'), {
    reply_markup: getAdminTemplatesKeyboard(templates, page, totalPages, locale),
  });
};

export const showAdminTemplateDetailCard = async (
  ctx: BotContext,
  locale: string,
  templateId: number,
) => {
  const template = await MessageTemplateService.getById(templateId);
  if (!template) {
    await ctx.reply(i18n.t(locale, 'admin_error'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
    return;
  }

  const summary = buildAdminTemplateSummary(template, locale);
  const keyboard = getAdminTemplateDetailKeyboard(template.id, template.is_active, locale);

  await ctx.reply(summary, {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
};

const waitForText = async (
  conversation: BotConversation,
  ctx: BotContext,
  locale: string,
  prompt: string,
): Promise<string | null> => {
  await ctx.reply(prompt, { reply_markup: getCancelKeyboard(locale), parse_mode: 'HTML' });

  while (true) {
    const messageCtx = await conversation.waitFor('message:text');
    const value = messageCtx.message.text.trim();

    if (isCancelText(value, locale)) {
      await messageCtx.reply(i18n.t(locale, 'admin_cancelled'), {
        reply_markup: getAdminMenuKeyboard(locale),
      });
      return null;
    }

    return value;
  }
};

const waitForTypeSelection = async (
  conversation: BotConversation,
  ctx: BotContext,
  locale: string,
  prompt: string,
): Promise<MessageTemplateType | null> => {
  const keyboard = new InlineKeyboard();
  TEMPLATE_TYPES.forEach((type, index) => {
    keyboard.text(type, `type_select:${type}`);
    if ((index + 1) % 2 === 0) keyboard.row();
  });
  keyboard.row().text(i18n.t(locale, 'admin_cancel'), 'admin_cancel');

  await ctx.reply(prompt, { reply_markup: keyboard, parse_mode: 'HTML' });

  while (true) {
    const callbackCtx = await conversation.wait();
    if (callbackCtx.callbackQuery) {
      const data = callbackCtx.callbackQuery.data || '';
      await callbackCtx.answerCallbackQuery();

      if (data === 'admin_cancel') {
        await callbackCtx.reply(i18n.t(locale, 'admin_cancelled'), {
          reply_markup: getAdminMenuKeyboard(locale),
        });
        return null;
      }

      if (data.startsWith('type_select:')) {
        return data.split(':')[1] as MessageTemplateType;
      }
    } else if (callbackCtx.message?.text && isCancelText(callbackCtx.message.text, locale)) {
      await callbackCtx.reply(i18n.t(locale, 'admin_cancelled'), {
        reply_markup: getAdminMenuKeyboard(locale),
      });
      return null;
    }
  }
};

export async function adminTemplateCreateConversation(
  conversation: BotConversation,
  ctx: BotContext,
) {
  const session = await conversation.external((c) => c.session);
  const locale = session?.__language_code || 'uz';

  await ctx.reply(i18n.t(locale, 'admin_campaign_template_create_guidance'), { parse_mode: 'HTML' });

  const title = await waitForText(conversation, ctx, locale, i18n.t(locale, 'admin_campaign_ask_template_title'));
  if (title === null) return;

  const key = await waitForText(conversation, ctx, locale, i18n.t(locale, 'admin_campaign_ask_template_key'));
  if (key === null) return;

  const type = await waitForTypeSelection(conversation, ctx, locale, i18n.t(locale, 'admin_campaign_ask_template_type'));
  if (type === null) return;

  const contentUz = await waitForText(conversation, ctx, locale, i18n.t(locale, 'admin_campaign_ask_template_content_uz'));
  if (contentUz === null) return;

  const contentRu = await waitForText(conversation, ctx, locale, i18n.t(locale, 'admin_campaign_ask_template_content_ru'));
  if (contentRu === null) return;

  try {
    const created = await conversation.external(() => MessageTemplateService.create({
      title,
      template_key: key,
      template_type: type,
      content_uz: contentUz,
      content_ru: contentRu,
      channel: 'telegram_bot',
      is_active: true
    }));

    await ctx.reply(i18n.t(locale, 'admin_template_created'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
    await showAdminTemplateDetailCard(ctx, locale, Number(created.id));
  } catch (error) {
    logger.error('Error creating template:', error);
    await ctx.reply(i18n.t(locale, 'admin_error'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
  }
}

export async function adminTemplateEditConversation(
  conversation: BotConversation,
  ctx: BotContext,
) {
  const adminSession = await conversation.external((c) => c.session);
  const locale = adminSession?.__language_code || 'uz';
  const target = adminSession?.adminTemplateEditTarget;

  if (!target) {
    await ctx.reply(i18n.t(locale, 'admin_error'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
    return;
  }

  const template = await conversation.external(() => MessageTemplateService.getById(target.templateId));
  if (!template) {
    await ctx.reply(i18n.t(locale, 'admin_error'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
    return;
  }

  let newValue: any = null;

  switch (target.field) {
    case 'title':
      newValue = await waitForText(conversation, ctx, locale, i18n.t(locale, 'admin_campaign_edit_prompt_template_title'));
      break;
    case 'template_key':
      newValue = await waitForText(conversation, ctx, locale, i18n.t(locale, 'admin_campaign_edit_prompt_template_key'));
      break;
    case 'template_type':
      newValue = await waitForTypeSelection(conversation, ctx, locale, i18n.t(locale, 'admin_campaign_ask_template_type'));
      break;
    case 'content_uz':
      newValue = await waitForText(conversation, ctx, locale, i18n.t(locale, 'admin_campaign_edit_prompt_template_content_uz'));
      break;
    case 'content_ru':
      newValue = await waitForText(conversation, ctx, locale, i18n.t(locale, 'admin_campaign_edit_prompt_template_content_ru'));
      break;
  }

  if (newValue === null) return;

  try {
    await conversation.external(() => MessageTemplateService.update(target.templateId, { [target.field]: newValue }));
    await ctx.reply(i18n.t(locale, 'admin_template_updated'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
    await showAdminTemplateDetailCard(ctx, locale, target.templateId);
  } catch (error) {
    logger.error('Error updating template:', error);
    await ctx.reply(i18n.t(locale, 'admin_error'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
  } finally {
    await conversation.external((c) => {
       if (c.session) c.session.adminTemplateEditTarget = undefined;
    });
  }
}
