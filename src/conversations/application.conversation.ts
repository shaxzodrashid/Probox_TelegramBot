import { BotConversation, BotContext } from '../types/context';
import { InlineKeyboard } from 'grammy';
import axios from 'axios';
import FormData from 'form-data';
import { UserService } from '../services/user.service';
import { minioService } from '../services/minio.service';
import { logger } from '../utils/logger';
import { config } from '../config';
import { i18n } from '../i18n';
import { getLocaleFromConversation } from '../utils/locale';

export async function applicationConversation(conversation: BotConversation, ctx: BotContext) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const locale = await getLocaleFromConversation(conversation);

  // 1. Check registration
  let user = await conversation.external(() => UserService.getLoggedInUser(telegramId));
  if (!user) {
    await ctx.reply(i18n.t(locale, 'registration_required'), {
      reply_markup: new InlineKeyboard().text(i18n.t(locale, 'registration_button'), 'start_registration'),
    });
    return;
  }

  // 2. Critical validations: JShShIR and Passport series
  if (!user.jshshir || !user.passport_series) {
    await ctx.reply(i18n.t(locale, 'application_passport_required'), {
      reply_markup: new InlineKeyboard().text(i18n.t(locale, 'application_start_passport_button'), 'start_passport_conv'),
    });
    return;
  }

  // 3. New Validation: Check if first_name is present
  if (!user.first_name) {
    await ctx.reply(i18n.t(locale, 'application_ask_first_name'));

    // Wait for text input
    let nameText = '';
    while (true) {
        const nameCtx = await conversation.waitFor('message:text');
        if (nameCtx.message?.text) {
            nameText = nameCtx.message.text.trim();
            break;
        } else {
            await ctx.reply(i18n.t(locale, 'application_ask_first_name'));
        }
    }

    // Split text into firstName and lastName if possible
    const nameParts = nameText.split(' ').filter(p => p.length > 0);
    const firstName = nameParts.length > 0 ? nameParts[0] : '';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

    // Save to database
    await conversation.external(() => UserService.updateUserName(telegramId, firstName, lastName));
    
    // Refresh user object
    user = await conversation.external(() => UserService.getLoggedInUser(telegramId));
    if (!user) return; // safety
    
    await ctx.reply(i18n.t(locale, 'application_first_name_saved'));
  }

  // 4. Try send API request
  try {
    const objects = await conversation.external(() => minioService.listObjects(`passports/${telegramId}/`));
    const passportImage = objects.find(obj => 
      obj.toLowerCase().endsWith('.jpg') || 
      obj.toLowerCase().endsWith('.jpeg') || 
      obj.toLowerCase().endsWith('.png')
    );

    if (passportImage) {
      await ctx.reply(i18n.t(locale, 'settings_passport_processing'));
    }

    // Move everything that involves non-serializable objects (FormData, Streams, Axios Responses)
    // into a single conversation.external call.
    const result = await conversation.external(async () => {
      const form = new FormData();

      // Mapping user data to CRM fields
      form.append('clientName', `${user!.first_name || ''} ${user!.last_name || ''}`.trim() || 'User');
      form.append('clientPhone', user!.phone_number || '');
      form.append('jshshir', user!.jshshir);
      form.append('passportId', user!.passport_series);

      // Fetch file as Buffer instead of Stream if we need to pass it around, 
      // but here we keep it inside the external block so Stream is fine too.
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
      
      return response.data; // Only return the plain data object
    });

    logger.info(`[CRM] Lead sent successfully for user ${telegramId}: ${JSON.stringify(result)}`);
    await ctx.reply(i18n.t(locale, 'application_success'));

  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error(`[CRM] Axios error sending lead for user ${telegramId}:`, error.message);
      if (error.response) {
        logger.error(`[CRM] Response status: ${error.response.status}, Data:`, error.response.data);
      }
    } else {
      logger.error(`[CRM] Error sending lead for user ${telegramId}:`, error);
    }
    await ctx.reply(i18n.t(locale, 'application_error'));
  }
}

