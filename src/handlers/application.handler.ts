import { BotContext } from '../types/context';
import { InlineKeyboard } from 'grammy';
import axios from 'axios';
import FormData from 'form-data';
import { UserService } from '../services/user.service';
import { minioService } from '../services/minio.service';
import { logger } from '../utils/logger';
import { config } from '../config';
import { i18n } from '../i18n';
import { checkRegistrationOrPrompt } from '../utils/registration.check';

export const applicationHandler = async (ctx: BotContext) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const locale = (await ctx.i18n.getLocale()) || 'uz';

  // 1. Check registration
  const user = await checkRegistrationOrPrompt(ctx);
  if (!user) {
    return;
  }

  // 2. Critical validations: JShShIR and Passport series
  // We check if both are present in the database
  if (!user.jshshir || !user.passport_series) {
    await ctx.reply(i18n.t(locale, 'application_passport_required'), {
      reply_markup: new InlineKeyboard().text(i18n.t(locale, 'application_start_passport_button'), 'start_passport_conv'),
    });
    return;
  }

  // 3. Try send API request
  try {
    const objects = await minioService.listObjects(`passports/${telegramId}/`);
    const passportImage = objects.find(obj => 
      obj.toLowerCase().endsWith('.jpg') || 
      obj.toLowerCase().endsWith('.jpeg') || 
      obj.toLowerCase().endsWith('.png')
    );

    if (passportImage) {
      await ctx.reply(i18n.t(locale, 'settings_passport_processing'));
    }

    const form = new FormData();

    // Mapping user data to CRM fields
    form.append('clientName', `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'User');
    form.append('clientPhone', user.phone_number || '');
    form.append('jshshir', user.jshshir || '');
    form.append('passportId', user.passport_series || '');

    // Append file from Minio stream ONLY if it exists
    if (passportImage) {
      const imageStream = await minioService.getFileAsStream(passportImage);
      const ext = passportImage.split('.').pop()?.toLowerCase() || 'jpg';
      const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      
      form.append('file', imageStream, { 
        filename: `passport.${ext}`,
        contentType: contentType 
      });
    }
    const username = config.CRM_LOGIN;
    const password = config.CRM_PASS;

    logger.info(`Payload: ${username}`)
    logger.info(`Payload: ${password}`)

    const response = await axios.post(
      config.CRM_URL,
      form,
      {
        headers: form.getHeaders(),
        auth: {
          username: username,
          password: password,
        },
        maxBodyLength: Infinity,
      }
    );
    logger.info(response.data)

    logger.info(`[CRM] Lead sent successfully for user ${telegramId}: ${JSON.stringify(response.data)}`);
    await ctx.reply(i18n.t(locale, 'application_success'));
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error(`[CRM] Error sending lead for user ${telegramId}:`, error);
    } else {
      logger.error(`[CRM] Error sending lead for user ${telegramId}:`, error);
    }
    await ctx.reply(i18n.t(locale, 'application_error'));
  }
};


