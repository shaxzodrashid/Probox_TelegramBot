import { Keyboard } from 'grammy';
import { BotConversation, BotContext } from '../types/context';
import { i18n } from '../i18n';
import { getMainKeyboardByLocale } from '../keyboards';
import { UserService } from '../services/user.service';
import { minioService } from '../services/minio.service';
import { logger } from '../utils/logger';
import { normalizeButtonText, downloadFile } from './passport_parts/utils.part';
import { handlePhotoMethod } from './passport_parts/photo.part';
import { handleManualMethod } from './passport_parts/manual.part';
import { runConfirmationLoop } from './passport_parts/confirmation.part';

export async function addPassportDataConversation(conversation: BotConversation, ctx: BotContext) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const locale = (ctx.session as any)?.__language_code || 'uz';
  logger.debug(`[Passport] Conversation started. Locale: ${locale}, User: ${telegramId}`);

  try {
    const user = await UserService.getUserByTelegramId(telegramId);
    const isAdmin = user?.is_admin || false;

    let currentSeries = '';
    let currentJshshir = '';
    let method = '';
    let backFileId = '';
    let extractedFirstName: string | null = null;
    let extractedLastName: string | null = null;
    let currentCtx: BotContext = ctx;

    const photoBtn = i18n.t(locale, 'settings_passport_method_photo');
    const manualBtn = i18n.t(locale, 'settings_passport_method_manual');
    const photoBtnNormalized = normalizeButtonText(photoBtn);
    const manualBtnNormalized = normalizeButtonText(manualBtn);

    const methodKeyboard = new Keyboard()
      .text(photoBtn)
      .text(manualBtn)
      .resized()
      .oneTime();

    logger.debug('[Passport] Sending method selection keyboard');
    await ctx.reply(i18n.t(locale, 'settings_add_passport_method'), {
      reply_markup: methodKeyboard
    });

    while (true) {
      logger.debug('[Passport] Waiting for method selection...');
      const methodCtx = await conversation.wait();
      currentCtx = methodCtx;
      
      // If user sent something other than text (e.g. a photo), ask them to use buttons
      if (!methodCtx.message?.text) {
        logger.debug('[Passport] Non-text message received during method selection, prompting user');
        await methodCtx.reply(i18n.t(locale, 'settings_add_passport_method'), {
          reply_markup: methodKeyboard
        });
        continue;
      }

      const text = normalizeButtonText(methodCtx.message.text);
      logger.debug(`[Passport] Method selection received - raw: "${methodCtx.message.text}", normalized: "${text}"`);
    
      if (text === photoBtnNormalized) {
        method = 'method_photo';
        break;
      } else if (text === manualBtnNormalized) {
        method = 'method_manual';
        break;
      } else {
        await methodCtx.reply(i18n.t(locale, 'settings_add_passport_method'), {
          reply_markup: methodKeyboard
        });
      }
    }

    if (method === 'method_photo') {
      const result = await handlePhotoMethod(conversation, currentCtx, locale);
      currentSeries = result.series;
      currentJshshir = result.jshshir;
      extractedFirstName = result.firstName;
      extractedLastName = result.lastName;
      backFileId = result.backFileId;
    } else {
      const result = await handleManualMethod(conversation, currentCtx, locale);
      currentSeries = result.series;
      currentJshshir = result.jshshir;
    }


    // Confirmation logic
    const confirmedData = await runConfirmationLoop(conversation, currentCtx, locale, {
      series: currentSeries,
      jshshir: currentJshshir
    });
    
    currentSeries = confirmedData.series;
    currentJshshir = confirmedData.jshshir;


    // Save to database
    await conversation.external(async () => {
      await UserService.updateUserPassportData(telegramId, currentJshshir, currentSeries);
      
      // Update names if we extracted them and user doesn't have them
      if (extractedFirstName || extractedLastName) {
        const currentUser = await UserService.getUserByTelegramId(telegramId);
        if (currentUser) {
          const first = currentUser.first_name || extractedFirstName || null;
          const last = currentUser.last_name || extractedLastName || null;
          
          if (!currentUser.first_name && extractedFirstName || !currentUser.last_name && extractedLastName) {
            logger.debug(`[Passport] Updating newly extracted names: ${first} ${last}`);
            await UserService.updateUserName(telegramId, first, last);
          }
        }
      }
    });
    
    // Provide success feedback
    await currentCtx.reply(i18n.t(locale, 'settings_passport_success'), {
      reply_markup: getMainKeyboardByLocale(locale, isAdmin, true)
    });

    // Background upload to MinIO
    if (method === 'method_photo' && backFileId) {
      // Use conversation.external for side effects or just ensure it's handled safely
      await conversation.external(async (uninterceptedCtx) => {
        try {
          const buf = await downloadFile(uninterceptedCtx as BotContext, backFileId);
          if (buf) {
            // New logic: Deletes old passports and saves new one in a descriptive path
            // e.g. passports/12345/passport_John_Doe.jpg
            await minioService.uploadUserPassport(telegramId, buf, user || undefined);
            logger.debug(`[Passport] Image updated in MinIO for user ${telegramId}`);
          }
        } catch (err) {
          logger.error('[Passport] MinIO update error:', err);
        }
      }).catch(err => logger.error('[Passport] External minio task error:', err));
    }


  } catch (err) {
    logger.error('[Passport] UNHANDLED ERROR in conversation:', err);
    await ctx.reply(`❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.`).catch(() => {});
  }
}
