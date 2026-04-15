import { Context, SessionFlavor } from 'grammy';
import { I18nFlavor } from '@grammyjs/i18n';
import { ConversationFlavor, Conversation } from '@grammyjs/conversations';

import { Contract } from '../data/contracts.mock';
import { PaymentContract } from '../interfaces/payment.interface';
import { FaqAnswerVariants, FaqQuestionVariants } from './faq.types';

export type CustomContext = Context & I18nFlavor & SessionFlavor<SessionData>;
export type BotContext = ConversationFlavor<CustomContext>;
export type BotConversation = Conversation<BotContext, BotContext>;

export type PromotionEditableField =
  | 'slug'
  | 'title_uz'
  | 'title_ru'
  | 'about_uz'
  | 'about_ru'
  | 'cover_image'
  | 'starts_at'
  | 'ends_at'
  | 'assign_coupons';

export type PromotionPrizeEditableField =
  | 'promotion_id'
  | 'title'
  | 'description';

export type MessageTemplateEditableField =
  | 'template_key'
  | 'template_type'
  | 'title'
  | 'content_uz'
  | 'content_ru'
  | 'channel'
  | 'is_active';

export interface SessionData {
  user_phone?: string;
  pendingAction?: 'application';
  __language_code?: string;
  languageSelected?: boolean;
  deepLinkSlug?: string;
  promotions?: Array<{
    id: number;
    title: string;
  }>;
  contracts?: Contract[];
  currentContractsPage?: number;
  // Payments session data
  payments?: PaymentContract[];
  // Admin reply session data
  adminReplyTicketNumber?: string;
  adminReplyTicketId?: number;
  // Admin send message target
  adminSendTargetUser?: number;
  adminPromotionListPage?: number;
  adminPromotionEditTarget?: {
    promotionId: number;
    field: PromotionEditableField;
  };
  adminPrizeListPage?: number;
  adminPrizeEditTarget?: {
    prizeId: number;
    field: PromotionPrizeEditableField;
  };
  adminWinnerCouponCode?: string;
  adminTemplateListPage?: number;
  adminTemplateEditTarget?: {
    templateId: number;
    field: MessageTemplateEditableField;
  };
  passportDraft?: {
    series: string;
    jshshir: string;
    method: string;
  };
  adminFaqSourceQuestion?: string;
  adminFaqQuestionVariants?: FaqQuestionVariants;
  adminFaqDraftId?: number;
  adminFaqAnswerVariants?: FaqAnswerVariants;
  adminFaqAnswerRegenerationInstructions?: string;
  adminFaqListPage?: number;
  adminFaqAgentToken?: string;
}
