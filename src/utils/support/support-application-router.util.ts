import { SupportService } from '../../services/support/support.service';
import { SupportTicket, SupportTicketMessage } from '../../types/support.types';
import { logger } from '../logger';

export interface SupportApplicationRoute {
  ticket: SupportTicket;
  history: SupportTicketMessage[];
  reason: string;
}

const normalizeIntentText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const CONFIRMATION_INTENT_REGEX =
  /^(?:ha|xa|x[a]?|haa|haaa|albatta|mayli|ok|okay|xo['’`]?p|hop|да|ага|угу|yes|yeah|yep|sure)[.!?\s]*$/i;

const DIRECT_APPLICATION_INTENT_REGEX =
  /\b(?:olaman|olmoqchiman|omoqchiman|olay|olaylik|rasmiylashtir\w*|ariza\s+qoldir\w*|zayavka\s+qoldir\w*|buyurtma\s+ber\w*|xarid\s+qil\w*|sotib\s+ol\w*|оформ\w*|заявк\w*|куп\w*|покуп\w*|buy|purchase|submit)\b/i;

const APPLICATION_CTA_REGEX =
  /\b(?:rasmiylashtir\w*|ariza\s+qoldir\w*|zayavka\s+qoldir\w*|xarid\s+qil\w*|sotib\s+ol\w*|olmoqchimisiz|оформ\w*|заявк\w*|куп\w*|покуп\w*|buy|purchase|submit)\b/i;

const GROUNDED_PURCHASE_CONTEXT_REGEX =
  /\b(?:iphone|ipad|macbook|airpods|apple\s+watch|gb|tb|narx\w*|price|цена|sotuvda|mavjud|do['’`]?kon|filial|store|stock|sklad|ombor|oyiga|oylik|bo['’`]?lib|to['’`]?lov|boshlang['’`]?ich|installment|рассроч\w*|ежемесяч\w*|первоначаль\w*|сум|so['’`]?m|uzs|usd|\d[\d\s.,]*(?:so['’`]?m|сум|uzs|usd)?)\b/i;

const getRecentAgentMessages = (history: SupportTicketMessage[]): SupportTicketMessage[] =>
  history.filter((message) => message.sender_type === 'agent').slice(-4);

const hasRecentApplicationCta = (history: SupportTicketMessage[]): boolean =>
  getRecentAgentMessages(history).some((message) =>
    APPLICATION_CTA_REGEX.test(normalizeIntentText(message.message_text)),
  );

const hasRecentGroundedPurchaseContext = (history: SupportTicketMessage[]): boolean =>
  history
    .slice(-8)
    .some((message) =>
      GROUNDED_PURCHASE_CONTEXT_REGEX.test(normalizeIntentText(message.message_text)),
    );

export const isCrmApplicationEscalationReason = (reason: string | null | undefined): boolean => {
  const normalizedReason = normalizeIntentText(reason || '');

  return (
    /\bcrm\b/.test(normalizedReason) &&
    /\b(?:application|app|ariza|zayavka|заявк\w*|lead|buy|purchase)\b/.test(normalizedReason)
  );
};

export const isSupportApplicationIntent = (
  messageText: string,
  history: SupportTicketMessage[],
): boolean => {
  const normalizedMessage = normalizeIntentText(messageText);
  if (!normalizedMessage) {
    return false;
  }

  const hasGroundedContext = hasRecentGroundedPurchaseContext(history);
  if (!hasGroundedContext) {
    return false;
  }

  if (CONFIRMATION_INTENT_REGEX.test(normalizedMessage)) {
    return hasRecentApplicationCta(history);
  }

  return DIRECT_APPLICATION_INTENT_REGEX.test(normalizedMessage);
};

export async function resolveSupportApplicationRoute(
  userTelegramId: number,
  messageText: string,
): Promise<SupportApplicationRoute | null> {
  const activeAgentTicket = await SupportService.getOpenAgentTicketByUserTelegramId(userTelegramId);
  if (!activeAgentTicket) {
    return null;
  }

  const history = await SupportService.getTicketMessages(activeAgentTicket.id);
  if (!isSupportApplicationIntent(messageText, history)) {
    return null;
  }

  return {
    ticket: activeAgentTicket,
    history,
    reason: 'CRM application requested',
  };
}

export async function markSupportApplicationRouteStarted(params: {
  ticket: SupportTicket;
  messageText: string;
  messageId?: number | null;
  photoFileId?: string | null;
}): Promise<void> {
  await SupportService.syncTicketPreviewMessage({
    ticketId: params.ticket.id,
    messageText: params.messageText,
    messageId: params.messageId,
    photoFileId: params.photoFileId,
  });

  await SupportService.appendMessage({
    ticketId: params.ticket.id,
    senderType: 'user',
    messageText: params.messageText,
    photoFileId: params.photoFileId,
    telegramMessageId: params.messageId,
  });

  await SupportService.appendMessage({
    ticketId: params.ticket.id,
    senderType: 'system',
    messageText: 'AI support thread moved to application conversation: CRM application requested',
  });

  await SupportService.closeTicket(params.ticket.id);

  logger.info(
    `[SUPPORT] Routed AI support ticket ${params.ticket.ticket_number} to application conversation.`,
  );
}
