import { BotConversation, BotContext } from '../types/context';
import { InlineKeyboard } from 'grammy';
import { getMainKeyboardByLocale } from '../keyboards';
import axios from 'axios';
import FormData from 'form-data';
import { UserService } from '../services/user.service';
import { minioService } from '../services/minio.service';
import { logger } from '../utils/logger';
import { config } from '../config';
import { i18n } from '../i18n';
import { getLocaleFromConversation } from '../utils/locale';
import { redisService } from '../redis/redis.service';

export async function submitApplication(
  conversation: BotConversation,
  ctx: BotContext,
  locale: string,
  initialUser?: Awaited<ReturnType<typeof UserService.getLoggedInUser>>,
) {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    if (telegramId) await conversation.external(() => redisService.delete(`pendingAction:${telegramId}`));
    return;
  }

  let user = initialUser ?? (await conversation.external(() => UserService.getLoggedInUser(telegramId)));
  if (!user) {
    await conversation.external(() => redisService.delete(`pendingAction:${telegramId}`));
    return;
  }

  let currentCtx = ctx;

  if (!user.first_name) {
    await ctx.reply(i18n.t(locale, 'application_ask_first_name'));

    let nameText = '';
    while (true) {
      const nameCtx = await conversation.waitFor('message:text');
      currentCtx = nameCtx;
      if (nameCtx.message?.text) {
        nameText = nameCtx.message.text.trim();
        break;
      }

      await ctx.reply(i18n.t(locale, 'application_ask_first_name'));
    }

    const nameParts = nameText.split(' ').filter((part) => part.length > 0);
    const firstName = nameParts.length > 0 ? nameParts[0] : '';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

    await conversation.external(() => UserService.updateUserName(telegramId, firstName, lastName));

    user = await conversation.external(() => UserService.getLoggedInUser(telegramId));
    if (!user) {
      await conversation.external(() => redisService.delete(`pendingAction:${telegramId}`));
      return;
    }

    await ctx.reply(i18n.t(locale, 'application_first_name_saved'));
  }

  try {
    // 1. Fetch images from passports/ and face_id/
    const passportObjects = await conversation.external(() => minioService.listObjects(`passports/${telegramId}/`));
    const faceIdObjects = await conversation.external(() => minioService.listObjects(`face_id/${telegramId}/`));
    
    const allImageObjects = [...passportObjects, ...faceIdObjects]
      .filter(obj => /\.(jpg|jpeg|png|webp)$/i.test(obj))
      .slice(0, 10); // Limit to 10 images

    if (allImageObjects.length > 0) {
      await ctx.reply(i18n.t(locale, 'settings_passport_processing'));
    }

    // 2. Fetch all images into Buffers using minioService helper
    const imageBuffers: { buffer: Buffer; filename: string; contentType: string }[] = [];
    
    for (const objPath of allImageObjects) {
      const rawBuffer = await conversation.external(() => minioService.getFileAsBuffer(objPath));
      // Re-wrapping with Buffer.from() ensures it's a proper Buffer instance
      const buffer = Buffer.from(rawBuffer);
      
      const ext = objPath.split('.').pop()?.toLowerCase() || 'jpg';
      const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const filename = objPath.split('/').pop() || 'image.jpg';
      
      imageBuffers.push({ buffer, filename, contentType });
    }

    // Build form and send to CRM inside conversation.external()
    // We wrap it in try/catch to ensure we return a plain serializable object,
    // avoiding DataCloneError when Axios throws an error with non-clonable functions.
    const result = await conversation.external(async () => {
      try {
        const form = new FormData();

        form.append('clientName', `${user!.first_name || ''} ${user!.last_name || ''}`.trim() || 'User');
        form.append('clientPhone', user!.phone_number || '');
        form.append('jshshir', user!.jshshir || '');
        form.append('passportId', user!.passport_series || '');

        imageBuffers.forEach(({ buffer, filename, contentType }) => {
          form.append('files', buffer, { filename, contentType });
        });

        const response = await axios.post(config.CRM_URL, form, {
          headers: form.getHeaders(),
          auth: {
            username: config.CRM_LOGIN,
            password: config.CRM_PASS,
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 45000, // 45 seconds timeout for stability
        });

        return { success: true, data: response.data };
      } catch (error: any) {
        return {
          success: false,
          message: error.message,
          status: error.response?.status,
          data: error.response?.data,
        };
      }
    });

    if (!result.success) {
      throw new Error(`CRM_ERROR: ${result.message}${result.status ? ` (Status: ${result.status})` : ''}${result.data ? ` - ${JSON.stringify(result.data)}` : ''}`);
    }

    logger.info(`[CRM] Lead sent successfully for user ${telegramId}: ${JSON.stringify(result.data)}`);
    await conversation.external(() => redisService.delete(`pendingAction:${telegramId}`));
    await ctx.reply(i18n.t(locale, 'application_success'), {
      reply_markup: getMainKeyboardByLocale(locale, user.is_admin, true),
    });
  } catch (error) {
    await conversation.external(() => redisService.delete(`pendingAction:${telegramId}`));

    if (axios.isAxiosError(error)) {
      logger.error(`[CRM] Axios error sending lead for user ${telegramId}:`, error.message);
      if (error.response) {
        logger.error(`[CRM] Response status: ${error.response.status}, Data:`, error.response.data);
      }
    } else {
      logger.error(`[CRM] Error sending lead for user ${telegramId}:`, error instanceof Error ? error.message : error);
    }

    await ctx.reply(i18n.t(locale, 'application_error'), {
      reply_markup: getMainKeyboardByLocale(locale, user?.is_admin || false, true),
    });
  }
}

export async function applicationConversation(conversation: BotConversation, ctx: BotContext) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const locale = await getLocaleFromConversation(conversation);
  await conversation.external(() => redisService.set(`pendingAction:${telegramId}`, 'application', 3600));

  const user = await conversation.external(() => UserService.getLoggedInUser(telegramId));
  if (!user) {
    const keyboard = new InlineKeyboard().text(i18n.t(locale, 'registration_button'), 'start_registration');
    await ctx.reply(i18n.t(locale, 'registration_required'), {
      reply_markup: keyboard,
    });
    
    // Provide the registration button. The bot.ts handles the start_registration callback.
    return;
  }

  if (!user.jshshir || !user.passport_series) {
    const passportKeyboard = new InlineKeyboard().text(
      i18n.t(locale, 'application_start_passport_button'),
      'start_passport_conv',
    );
    await ctx.reply(i18n.t(locale, 'application_passport_required'), {
      reply_markup: passportKeyboard,
    });
    
    // Provide the passport button. The bot.ts handles the start_passport_conv callback.
    return;
  }

  await submitApplication(conversation, ctx, locale, user);
}
