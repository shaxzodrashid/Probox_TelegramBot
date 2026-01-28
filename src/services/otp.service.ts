import { redisService } from '../redis/redis.service';
import { config } from '../config';
import { logger } from '../utils/logger';
import axios from 'axios';

export class OtpService {
  private static readonly OTP_EXPIRY = 300; // 5 minutes in seconds

  static generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  static async createOtp(phoneNumber: string): Promise<string> {
    const otp = this.generateOtp();
    const redisKey = `otp:${phoneNumber}`;
    
    await redisService.set(redisKey, otp, this.OTP_EXPIRY);
    
    await this.send_code(phoneNumber, otp);
    
    return otp;
  }

  static async verifyOtp(phoneNumber: string, otp: string): Promise<boolean> {
    const redisKey = `otp:${phoneNumber}`;
    const storedOtp = await redisService.get<string>(redisKey);
    
    if (storedOtp !== null && String(storedOtp) === String(otp)) {
      await redisService.delete(redisKey);
      return true;
    }
    
    return false;
  }

  static async clearOtp(phoneNumber: string): Promise<void> {
    const redisKey = `otp:${phoneNumber}`;
    await redisService.delete(redisKey);
  }

  private static async send_code(phoneNumber: string, code: string): Promise<void> {
    const fixed_phone = Number(phoneNumber.slice(-9));

    logger.info(`Sending OTP to ${fixed_phone} with code ${code}`);

    const message_id =
      Array.from({ length: 3 }, () =>
        String.fromCharCode(97 + Math.floor(Math.random() * 26)),
      ).join('') +
      Math.floor(Math.random() * 1000000000)
        .toString()
        .padStart(9, '0');

    logger.info(`Message ID: ${message_id}`);

    const data_to_send = {
      recipient: Number(fixed_phone),
      'message-id': message_id,
      sms: {
        originator: config.SMS_ORIGINATOR,
        content: {
          text: `Tasdiqlash kodi: ${code}\nKod faqat siz uchun. Uni boshqalarga bermang.`,
        },
      },
    };

    logger.info(`Data to send: ${JSON.stringify(data_to_send)}`);

    const sms_creadentials = {
      username: config.SMS_USERNAME || '',
      password: config.SMS_PASSWORD || '',
    };

    logger.info(`SMS credentials: ${JSON.stringify(sms_creadentials)}`);

    if (config.NODE_ENV !== 'development' && config.SMS_API_URL) {
      const response = await axios.post(
        config.SMS_API_URL,
        {
          messages: data_to_send,
        },
        {
          auth: sms_creadentials,
        },
      );

      logger.info(`Response: ${JSON.stringify(response.data)}`);
    } else {
      logger.info(`OTP sent to ${phoneNumber} with code ${code}`);
    }
  }
}
