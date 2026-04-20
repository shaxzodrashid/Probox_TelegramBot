import { InlineKeyboard } from 'grammy';
import { i18n } from '../i18n';
import { FaqRecord } from '../types/faq.types';

export const ADMIN_FAQ_CREATE_CALLBACK = 'admin_faq_create';
export const ADMIN_FAQ_RESUME_CALLBACK = 'admin_faq_resume';
export const ADMIN_FAQ_BACK_CALLBACK = 'admin_faq_back';
export const ADMIN_FAQ_PAGE_CALLBACK_PREFIX = 'afp:';
export const ADMIN_FAQ_DETAIL_CALLBACK_PREFIX = 'afd:';
export const ADMIN_FAQ_EDIT_CALLBACK_PREFIX = 'afe:';
export const ADMIN_FAQ_DELETE_CALLBACK_PREFIX = 'afdel:';
export const ADMIN_FAQ_DELETE_CONFIRM_CALLBACK_PREFIX = 'afdelc:';
export const ADMIN_FAQ_DELETE_CANCEL_CALLBACK_PREFIX = 'afdelx:';
export const ADMIN_FAQ_BACK_TO_LIST_CALLBACK = 'admin_faqs_back';

export const getAdminFaqSectionKeyboard = (
  locale: string,
  options: { hasDraft: boolean },
) => {
  const keyboard = new InlineKeyboard()
    .text(i18n.t(locale, 'admin_faq_create'), ADMIN_FAQ_CREATE_CALLBACK)
    .row();

  if (options.hasDraft) {
    keyboard.text(i18n.t(locale, 'admin_faq_resume'), ADMIN_FAQ_RESUME_CALLBACK).row();
  }

  keyboard.text(i18n.t(locale, 'admin_back_to_menu'), ADMIN_FAQ_BACK_CALLBACK);
  return keyboard;
};

export const getAdminFaqListKeyboard = (
  faqs: FaqRecord[],
  page: number,
  totalPages: number,
  locale: string,
  options: { hasDraft: boolean; total: number; pageSize: number },
) => {
  const keyboard = new InlineKeyboard();

  faqs.forEach((faq, index) => {
    const itemNumber = (page - 1) * options.pageSize + index + 1;
    keyboard.text(`❓ ${itemNumber}`, `${ADMIN_FAQ_DETAIL_CALLBACK_PREFIX}${faq.id}`);

    if ((index + 1) % 3 === 0 || index === faqs.length - 1) {
      keyboard.row();
    }
  });

  if (options.total > 0) {
    if (totalPages > 1) {
      if (page > 1) {
        keyboard.text('⬅️', `${ADMIN_FAQ_PAGE_CALLBACK_PREFIX}${page - 1}`);
      }
      keyboard.text(`${page}/${totalPages}`, 'noop');
      if (page < totalPages) {
        keyboard.text('➡️', `${ADMIN_FAQ_PAGE_CALLBACK_PREFIX}${page + 1}`);
      }
      keyboard.row();
    } else {
      keyboard.text(`1/${totalPages}`, 'noop').row();
    }
  }

  keyboard.text(i18n.t(locale, 'admin_faq_create'), ADMIN_FAQ_CREATE_CALLBACK).row();

  if (options.hasDraft) {
    keyboard.text(i18n.t(locale, 'admin_faq_resume'), ADMIN_FAQ_RESUME_CALLBACK).row();
  }

  keyboard.text(i18n.t(locale, 'admin_back_to_menu'), ADMIN_FAQ_BACK_CALLBACK);
  return keyboard;
};

export const getAdminFaqDetailKeyboard = (
  faq: FaqRecord,
  locale: string,
  options: { hasDraft: boolean },
) => {
  const keyboard = new InlineKeyboard()
    .text(
      i18n.t(locale, 'admin_faq_edit_questions'),
      `${ADMIN_FAQ_EDIT_CALLBACK_PREFIX}${faq.id}:question_variants`,
    )
    .text(
      i18n.t(locale, 'admin_faq_edit_answers'),
      `${ADMIN_FAQ_EDIT_CALLBACK_PREFIX}${faq.id}:answer_variants`,
    )
    .row()
    .text(
      faq.agent_enabled
        ? i18n.t(locale, 'admin_faq_refresh_agent_mode')
        : i18n.t(locale, 'admin_faq_mark_for_agent'),
      `${ADMIN_FAQ_EDIT_CALLBACK_PREFIX}${faq.id}:agent_mode`,
    )
    .text(i18n.t(locale, 'admin_faq_delete'), `${ADMIN_FAQ_DELETE_CALLBACK_PREFIX}${faq.id}`)
    .row()
    .text(i18n.t(locale, 'admin_faq_open_list'), ADMIN_FAQ_BACK_TO_LIST_CALLBACK)
    .row()
    .text(i18n.t(locale, 'admin_faq_create'), ADMIN_FAQ_CREATE_CALLBACK)
    .row();

  if (options.hasDraft) {
    keyboard.text(i18n.t(locale, 'admin_faq_resume'), ADMIN_FAQ_RESUME_CALLBACK).row();
  }

  keyboard.text(i18n.t(locale, 'admin_back_to_menu'), ADMIN_FAQ_BACK_CALLBACK);
  return keyboard;
};

export const getAdminFaqDeleteConfirmKeyboard = (faqId: number, locale: string) =>
  new InlineKeyboard()
    .text(i18n.t(locale, 'admin_confirm_yes'), `${ADMIN_FAQ_DELETE_CONFIRM_CALLBACK_PREFIX}${faqId}`)
    .text(i18n.t(locale, 'admin_confirm_no'), `${ADMIN_FAQ_DELETE_CANCEL_CALLBACK_PREFIX}${faqId}`);
