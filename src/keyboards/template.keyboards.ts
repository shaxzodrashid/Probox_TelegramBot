import { InlineKeyboard } from 'grammy';
import { i18n } from '../i18n';
import { MessageTemplate } from '../services/message-template.service';

export const ADMIN_TEMPLATE_PAGE_CALLBACK_PREFIX = 'atpg:';
export const ADMIN_TEMPLATE_DETAIL_CALLBACK_PREFIX = 'atpd:';
export const ADMIN_TEMPLATE_EDIT_CALLBACK_PREFIX = 'ate:';
export const ADMIN_TEMPLATE_TOGGLE_CALLBACK_PREFIX = 'att:';
export const ADMIN_TEMPLATE_DELETE_CALLBACK_PREFIX = 'atdl:';
export const ADMIN_TEMPLATE_CREATE_CALLBACK = 'admin_template_create';
export const ADMIN_TEMPLATE_BACK_TO_LIST_CALLBACK = 'admin_templates_back';

export const getAdminTemplatesKeyboard = (
  templates: MessageTemplate[],
  page: number,
  totalPages: number,
  locale: string,
) => {
  const keyboard = new InlineKeyboard();

  templates.forEach((template) => {
    const icon = template.is_active ? '🟢' : '⚫';
    keyboard.text(`${icon} ${template.title}`, `${ADMIN_TEMPLATE_DETAIL_CALLBACK_PREFIX}${template.id}`).row();
  });

  if (totalPages > 1) {
    if (page > 1) {
      keyboard.text('⬅️', `${ADMIN_TEMPLATE_PAGE_CALLBACK_PREFIX}${page - 1}`);
    }
    keyboard.text(`${page}/${totalPages}`, 'noop');
    if (page < totalPages) {
      keyboard.text('➡️', `${ADMIN_TEMPLATE_PAGE_CALLBACK_PREFIX}${page + 1}`);
    }
    keyboard.row();
  }

  keyboard
    .text(i18n.t(locale, 'admin_campaign_template_create'), ADMIN_TEMPLATE_CREATE_CALLBACK)
    .row()
    .text(i18n.t(locale, 'admin_back_to_menu'), 'admin_back_to_menu');

  return keyboard;
};

export const getAdminTemplateDetailKeyboard = (
  templateId: number,
  isActive: boolean,
  locale: string,
) => {
  const keyboard = new InlineKeyboard();

  keyboard
    .text(i18n.t(locale, 'admin_campaign_edit_template_key'), `${ADMIN_TEMPLATE_EDIT_CALLBACK_PREFIX}${templateId}:template_key`)
    .text(i18n.t(locale, 'admin_campaign_edit_template_type'), `${ADMIN_TEMPLATE_EDIT_CALLBACK_PREFIX}${templateId}:template_type`)
    .row()
    .text(i18n.t(locale, 'admin_campaign_edit_template_title'), `${ADMIN_TEMPLATE_EDIT_CALLBACK_PREFIX}${templateId}:title`)
    .row()
    .text(i18n.t(locale, 'admin_campaign_edit_template_content_uz'), `${ADMIN_TEMPLATE_EDIT_CALLBACK_PREFIX}${templateId}:content_uz`)
    .text(i18n.t(locale, 'admin_campaign_edit_template_content_ru'), `${ADMIN_TEMPLATE_EDIT_CALLBACK_PREFIX}${templateId}:content_ru`)
    .row()
    .text(
      isActive ? i18n.t(locale, 'admin_campaign_make_inactive') : i18n.t(locale, 'admin_campaign_make_active'),
      `${ADMIN_TEMPLATE_TOGGLE_CALLBACK_PREFIX}${templateId}`,
    )
    .row()
    .text(i18n.t(locale, 'admin_campaign_delete'), `${ADMIN_TEMPLATE_DELETE_CALLBACK_PREFIX}${templateId}`)
    .row()
    .text(i18n.t(locale, 'admin_campaign_templates_back'), ADMIN_TEMPLATE_BACK_TO_LIST_CALLBACK);

  return keyboard;
};

export const getAdminMissingTemplateKeyboard = (locale: string) => {
  return new InlineKeyboard()
    .text(i18n.t(locale, 'admin_campaign_template_create'), ADMIN_TEMPLATE_CREATE_CALLBACK)
    .row()
    .text(i18n.t(locale, 'admin_back_to_menu'), 'admin_back_to_menu');
};

