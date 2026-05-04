import db from '../database/database';
import { InputFile } from 'grammy';
import { isUserBlockedError } from '../utils/telegram/telegram-errors';
import { MessageTemplate, MessageTemplateService, MessageTemplateType } from './message-template.service';
import { User, UserService } from './user.service';

export interface NotificationResult {
  delivered: boolean;
  dispatchLogId?: number;
  error?: string;
}

export interface NotificationPhoto {
  buffer: Buffer;
  fileName?: string | null;
}

export class BotNotificationService {
  private static async getBot() {
    const botModule = await import('../bot.js');
    return botModule.bot;
  }

  private static async writeDispatchLog(params: {
    userId?: number | null;
    couponId?: number | null;
    templateId?: number | null;
    dispatchType: string;
    status: string;
    errorMessage?: string | null;
  }): Promise<number | undefined> {
    const [log] = await db('message_dispatch_logs')
      .insert({
        user_id: params.userId || null,
        coupon_id: params.couponId || null,
        template_id: params.templateId || null,
        dispatch_type: params.dispatchType,
        status: params.status,
        error_message: params.errorMessage || null,
      })
      .returning('id');

    return typeof log === 'object' ? log.id : log;
  }

  static async sendTemplateMessage(params: {
    user: User;
    templateType: MessageTemplateType;
    placeholders: Record<string, string | number | null | undefined>;
    couponId?: number;
    dispatchType: string;
    photo?: NotificationPhoto | null;
  }): Promise<NotificationResult> {
    const template = await MessageTemplateService.getActiveTemplateByType(params.templateType);

    if (!template) {
      const dispatchLogId = await this.writeDispatchLog({
        userId: params.user.id,
        couponId: params.couponId,
        dispatchType: params.dispatchType,
        status: 'template_not_found',
      });

      return {
        delivered: false,
        dispatchLogId,
        error: `Template not found for type ${params.templateType}`,
      };
    }

    return this.sendRenderedMessage({
      user: params.user,
      template,
      placeholders: params.placeholders,
      couponId: params.couponId,
      dispatchType: params.dispatchType,
      photo: params.photo,
    });
  }

  static async sendRenderedMessage(params: {
    user: User;
    template: MessageTemplate;
    placeholders: Record<string, string | number | null | undefined>;
    couponId?: number;
    dispatchType: string;
    photo?: NotificationPhoto | null;
  }): Promise<NotificationResult> {
    try {
      const locale = params.user.language_code || 'uz';
      const text = MessageTemplateService.render(params.template, locale, params.placeholders);
      const bot = await this.getBot();
      const shouldAttachPrizePhoto =
        Boolean(params.photo)
        && MessageTemplateService.hasPlaceholder(params.template, locale, 'prize_name');

      if (shouldAttachPrizePhoto && params.photo) {
        const photo = new InputFile(params.photo.buffer, params.photo.fileName || 'prize.jpg');

        if (text.length <= 1024) {
          await bot.api.sendPhoto(params.user.telegram_id, photo, {
            caption: text,
            parse_mode: 'HTML',
          });
        } else {
          await bot.api.sendPhoto(params.user.telegram_id, photo);
          await bot.api.sendMessage(params.user.telegram_id, text, { parse_mode: 'HTML' });
        }
      } else {
        await bot.api.sendMessage(params.user.telegram_id, text, { parse_mode: 'HTML' });
      }
      await UserService.unblockUserIfBlocked(params.user.telegram_id);

      const dispatchLogId = await this.writeDispatchLog({
        userId: params.user.id,
        couponId: params.couponId,
        templateId: params.template.id,
        dispatchType: params.dispatchType,
        status: 'sent',
      });

      return { delivered: true, dispatchLogId };
    } catch (error) {
      if (isUserBlockedError(error)) {
        await UserService.markUserAsBlocked(params.user.telegram_id);
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      const dispatchLogId = await this.writeDispatchLog({
        userId: params.user.id,
        couponId: params.couponId,
        templateId: params.template.id,
        dispatchType: params.dispatchType,
        status: 'failed',
        errorMessage,
      });

      return { delivered: false, dispatchLogId, error: errorMessage };
    }
  }

  static async sendDirectMessage(params: {
    user: User;
    text: string;
    dispatchType: string;
  }): Promise<NotificationResult> {
    try {
      const bot = await this.getBot();
      await bot.api.sendMessage(params.user.telegram_id, params.text, { parse_mode: 'HTML' });
      await UserService.unblockUserIfBlocked(params.user.telegram_id);

      const dispatchLogId = await this.writeDispatchLog({
        userId: params.user.id,
        dispatchType: params.dispatchType,
        status: 'sent',
      });

      return { delivered: true, dispatchLogId };
    } catch (error) {
      if (isUserBlockedError(error)) {
        await UserService.markUserAsBlocked(params.user.telegram_id);
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      const dispatchLogId = await this.writeDispatchLog({
        userId: params.user.id,
        dispatchType: params.dispatchType,
        status: 'failed',
        errorMessage,
      });

      return { delivered: false, dispatchLogId, error: errorMessage };
    }
  }
}
