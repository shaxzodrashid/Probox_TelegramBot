import type { FastifyReply, FastifyRequest } from 'fastify';
import { ApiError } from '../errors/api-error';
import { strictNormalizeUzPhone } from '../../utils/uz-phone.util';
import { UserService } from '../../services/user.service';
import { BotNotificationService } from '../../services/bot-notification.service';
import { logger } from '../../utils/logger';

interface SendMessageBody {
  phone: string;
  message: string;
}

export class BotController {
  static async sendMessage(
    request: FastifyRequest<{ Body: SendMessageBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { phone, message } = request.body;

    if (!phone) {
      throw new ApiError(400, 'Telefon raqami noto‘g‘ri formatda', 'MISSING_PHONE');
    }

    if (!message) {
      throw new ApiError(400, 'Xabar matni bo‘sh bo‘lishi mumkin emas', 'MISSING_MESSAGE');
    }

    let normalizedPhone: string;
    try {
      normalizedPhone = strictNormalizeUzPhone(phone);
    } catch (error) {
      throw new ApiError(400, 'Telefon raqami noto‘g‘ri formatda', 'INVALID_PHONE_FORMAT');
    }

    const user = await UserService.getUserByPhoneNumber(normalizedPhone);

    if (!user) {
      logger.info(`Message attempt: user not found for phone ${normalizedPhone}`);
      throw new ApiError(404, 'Foydalanuvchi topilmadi', 'USER_NOT_FOUND');
    }

    logger.info(`Sending message to user ${user.id} (${normalizedPhone})`);

    const result = await BotNotificationService.sendDirectMessage({
      user,
      text: message,
      dispatchType: 'api_send_message',
    });

    if (!result.delivered) {
      logger.error(`Failed to send message to user ${user.id}: ${result.error}`);
      throw new ApiError(
        403,
        'Xabar yuborilmadi. Foydalanuvchi botni bloklagan bo‘lishi mumkin',
        'MESSAGE_NOT_DELIVERED',
      );
    }

    logger.info(`Message successfully sent to user ${user.id}`);
    reply.status(200).send({ success: true });
  }
}
