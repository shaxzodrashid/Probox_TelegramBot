import axios from 'axios';
import { InputFile } from 'grammy';
import { bot } from '../bot';
import { config } from '../config';
import { logger } from '../utils/logger';
import { escapeHtml } from '../utils/telegram-rich-text.util';
import { isUserBlockedError } from '../utils/telegram-errors';
import { User, UserService } from './user.service';

export type PurchasePdfMatchBy = 'jshshir' | 'cardCode' | null;

export interface PurchasePdfDeliveryPayload {
  jshshir?: string;
  cardCode?: string;
  pdfUrl: string;
  fileName?: string;
  docEntry?: string;
}

export interface PurchasePdfDeliveryResult {
  status: boolean;
  userFound: boolean;
  matchedBy: PurchasePdfMatchBy;
  userDelivered: boolean;
  adminGroupDelivered: boolean;
  fileName: string;
  identifiers: {
    jshshir?: string;
    cardCode?: string;
    docEntry?: string;
  };
  user: {
    id: number;
    telegramId: number;
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    sapCardCode?: string;
    jshshir?: string;
  } | null;
  errors: {
    user?: string;
    adminGroup?: string;
  };
}

export class PurchasePdfDeliveryError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'PurchasePdfDeliveryError';
  }
}

type UserResolution = {
  user: User | null;
  matchedBy: PurchasePdfMatchBy;
};

type UserDeliveryAttempt = {
  delivered: boolean;
  error?: string;
};

export class PurchasePdfDeliveryService {
  private static readonly USER_CAPTION_MAX_LENGTH = 120;

  private static trimValue(value: string | undefined, maxLength: number = this.USER_CAPTION_MAX_LENGTH): string {
    if (!value) {
      return '';
    }

    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, maxLength - 3)}...`;
  }

  private static getUserFullName(user: User | null): string {
    if (!user) {
      return 'Topilmadi';
    }

    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    return fullName || "Noma'lum";
  }

  private static sanitizeFileName(fileName: string): string {
    const sanitized = fileName
      .replace(/[<>:"/\\|?*]/g, '_')
      .split('')
      .map((character) => (character.charCodeAt(0) < 32 ? '_' : character))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();

    if (!sanitized) {
      return 'purchase.pdf';
    }

    return sanitized.toLowerCase().endsWith('.pdf') ? sanitized : `${sanitized}.pdf`;
  }

  private static resolveFileName(payload: PurchasePdfDeliveryPayload): string {
    if (payload.fileName?.trim()) {
      return this.sanitizeFileName(payload.fileName);
    }

    try {
      const parsedUrl = new URL(payload.pdfUrl);
      const fileName = decodeURIComponent(parsedUrl.pathname.split('/').pop() || '').trim();
      if (fileName) {
        return this.sanitizeFileName(fileName);
      }
    } catch {
      // Validation happens earlier, so this is only a fallback.
    }

    const suffix = payload.docEntry || payload.cardCode || payload.jshshir || Date.now().toString();
    return this.sanitizeFileName(`purchase-${suffix}`);
  }

  private static async downloadPdf(pdfUrl: string): Promise<Buffer> {
    try {
      const response = await axios.get<ArrayBuffer>(pdfUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
      });

      return Buffer.from(response.data);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error(`[PURCHASE_PDF_DELIVERY] Failed to download PDF from ${pdfUrl}: ${error.message}`);
        throw new PurchasePdfDeliveryError(
          502,
          'PDF_DOWNLOAD_FAILED',
          'Failed to download the PDF from the provided URL.',
          { pdfUrl, upstreamStatus: error.response?.status ?? null },
        );
      }

      logger.error(`[PURCHASE_PDF_DELIVERY] Unexpected PDF download error for ${pdfUrl}: ${error}`);
      throw new PurchasePdfDeliveryError(
        500,
        'PDF_DOWNLOAD_FAILED',
        'Failed to download the PDF from the provided URL.',
        { pdfUrl },
      );
    }
  }

  private static async resolveUser(payload: PurchasePdfDeliveryPayload): Promise<UserResolution> {
    if (payload.jshshir) {
      const user = await UserService.getUserByJshshir(payload.jshshir);
      if (user) {
        return { user, matchedBy: 'jshshir' };
      }
    }

    if (payload.cardCode) {
      const user = await UserService.getUserBySapCardCode(payload.cardCode);
      if (user) {
        return { user, matchedBy: 'cardCode' };
      }
    }

    return { user: null, matchedBy: null };
  }

  private static async sendPdfToUser(
    user: User,
    pdfBuffer: Buffer,
    fileName: string,
  ): Promise<UserDeliveryAttempt> {
    try {
      await bot.api.sendDocument(
        user.telegram_id,
        new InputFile(Buffer.from(pdfBuffer), fileName),
      );
      await UserService.unblockUserIfBlocked(user.telegram_id);

      return { delivered: true };
    } catch (error) {
      if (isUserBlockedError(error)) {
        await UserService.markUserAsBlocked(user.telegram_id);
      }

      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[PURCHASE_PDF_DELIVERY] Failed to send PDF to user ${user.telegram_id}: ${message}`);
      return {
        delivered: false,
        error: message,
      };
    }
  }

  private static buildAdminCaption(params: {
    payload: PurchasePdfDeliveryPayload;
    user: User | null;
    matchedBy: PurchasePdfMatchBy;
    userDelivered: boolean;
    userError?: string;
    fileName: string;
  }): string {
    const matchLabel = params.matchedBy === 'jshshir'
      ? 'JSHSHIR'
      : params.matchedBy === 'cardCode'
        ? 'CardCode'
        : 'Topilmadi';
    const userDeliveryLabel = params.user
      ? params.userDelivered
        ? 'Yuborildi'
        : 'Yuborilmadi'
      : 'Foydalanuvchi topilmadi';
    const phoneNumber = params.user?.phone_number || "Yo'q";
    const lines = [
      '<b>Purchase PDF keldi</b>',
      '',
      `<b>JSHSHIR:</b> <code>${escapeHtml(params.payload.jshshir || "Yo'q")}</code>`,
      `<b>CardCode:</b> <code>${escapeHtml(params.payload.cardCode || "Yo'q")}</code>`,
      params.payload.docEntry
        ? `<b>DocEntry:</b> <code>${escapeHtml(params.payload.docEntry)}</code>`
        : '',
      `<b>Qidiruv natijasi:</b> ${escapeHtml(matchLabel)}`,
      `<b>Userga yuborish:</b> ${escapeHtml(userDeliveryLabel)}`,
      `<b>Fayl:</b> ${escapeHtml(this.trimValue(params.fileName, 80))}`,
      '',
      `<b>Foydalanuvchi:</b> ${escapeHtml(this.trimValue(this.getUserFullName(params.user)))}`,
      `<b>Telegram ID:</b> <code>${escapeHtml(params.user?.telegram_id?.toString() || "Yo'q")}</code>`,
      `<b>Telefon:</b> ${escapeHtml(this.trimValue(phoneNumber, 30))}`,
    ].filter(Boolean);

    if (params.user?.sap_card_code) {
      lines.push(`<b>DB CardCode:</b> <code>${escapeHtml(this.trimValue(params.user.sap_card_code, 40))}</code>`);
    }

    if (params.user?.jshshir) {
      lines.push(`<b>DB JSHSHIR:</b> <code>${escapeHtml(params.user.jshshir)}</code>`);
    }

    if (params.userError) {
      lines.push(`<b>User xatoligi:</b> ${escapeHtml(this.trimValue(params.userError, 180))}`);
    }

    return lines.join('\n');
  }

  private static async sendPdfToAdminGroup(params: {
    pdfBuffer: Buffer;
    fileName: string;
    caption: string;
  }): Promise<{ delivered: boolean; error?: string }> {
    if (!config.ADMIN_GROUP_ID) {
      return {
        delivered: false,
        error: 'ADMIN_GROUP_ID is not configured.',
      };
    }

    try {
      await bot.api.sendDocument(
        config.ADMIN_GROUP_ID,
        new InputFile(Buffer.from(params.pdfBuffer), params.fileName),
        {
          caption: params.caption,
          parse_mode: 'HTML',
        },
      );

      return { delivered: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[PURCHASE_PDF_DELIVERY] Failed to send PDF to admin group: ${message}`);
      return {
        delivered: false,
        error: message,
      };
    }
  }

  static async process(payload: PurchasePdfDeliveryPayload): Promise<PurchasePdfDeliveryResult> {
    const fileName = this.resolveFileName(payload);
    const pdfBuffer = await this.downloadPdf(payload.pdfUrl);
    const resolvedUser = await this.resolveUser(payload);

    const result: PurchasePdfDeliveryResult = {
      status: false,
      userFound: Boolean(resolvedUser.user),
      matchedBy: resolvedUser.matchedBy,
      userDelivered: false,
      adminGroupDelivered: false,
      fileName,
      identifiers: {
        jshshir: payload.jshshir,
        cardCode: payload.cardCode,
        docEntry: payload.docEntry,
      },
      user: resolvedUser.user
        ? {
            id: resolvedUser.user.id,
            telegramId: resolvedUser.user.telegram_id,
            firstName: resolvedUser.user.first_name,
            lastName: resolvedUser.user.last_name,
            phoneNumber: resolvedUser.user.phone_number,
            sapCardCode: resolvedUser.user.sap_card_code,
            jshshir: resolvedUser.user.jshshir,
          }
        : null,
      errors: {},
    };

    if (resolvedUser.user) {
      const userDeliveryAttempt = await this.sendPdfToUser(resolvedUser.user, pdfBuffer, fileName);
      result.userDelivered = userDeliveryAttempt.delivered;

      if (userDeliveryAttempt.error) {
        result.errors.user = userDeliveryAttempt.error;
      }
    }

    const adminGroupAttempt = await this.sendPdfToAdminGroup({
      pdfBuffer,
      fileName,
      caption: this.buildAdminCaption({
        payload,
        user: resolvedUser.user,
        matchedBy: resolvedUser.matchedBy,
        userDelivered: result.userDelivered,
        userError: result.errors.user,
        fileName,
      }),
    });

    result.adminGroupDelivered = adminGroupAttempt.delivered;
    result.status = adminGroupAttempt.delivered;

    if (adminGroupAttempt.error) {
      result.errors.adminGroup = adminGroupAttempt.error;
    }

    return result;
  }
}
