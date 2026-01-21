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

    const message_id =
      Array.from({ length: 3 }, () =>
        String.fromCharCode(97 + Math.floor(Math.random() * 26)),
      ).join('') +
      Math.floor(Math.random() * 1000000000)
        .toString()
        .padStart(9, '0');

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

    const sms_creadentials = {
      username: config.SMS_USERNAME || '',
      password: config.SMS_PASSWORD || '',
    };

    if (process.env.NODE_ENV !== 'development' && process.env.SMS_API_URL) {
      await axios.post(
        process.env.SMS_API_URL,
        {
          messages: data_to_send,
        },
        {
          auth: sms_creadentials,
        },
      );
    } else {
      logger.info(`OTP sent to ${phoneNumber} with code ${code}`);
    }
  }
}
