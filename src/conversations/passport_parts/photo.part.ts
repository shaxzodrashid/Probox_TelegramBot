import { BotConversation, BotContext } from '../../types/context';
import { i18n } from '../../i18n';
import { logger } from '../../utils/logger';
import { downloadFile } from './utils.part';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { OCRService } from '../../services/ocr.service';
import { config } from '../../config';

export async function handlePhotoMethod(
  conversation: BotConversation, 
  ctx: BotContext, 
  locale: string
): Promise<{ series: string; jshshir: string; firstName: string | null; lastName: string | null; backFileId: string }> {
  const chatId = ctx.chat?.id;
  
  // Send photo prompt directly (not in external - using replayed ctx inside external causes hangs)
  logger.debug('[Passport] Sending photo prompt...');
  if (chatId) {
    if (config.PASSPORT_SCANNER_GIF_ID) {
      await ctx.api.sendAnimation(chatId, config.PASSPORT_SCANNER_GIF_ID, {
        caption: i18n.t(locale, 'settings_passport_prompt'),
        reply_markup: { remove_keyboard: true }
      }).catch((err) => logger.error('[Passport] Failed to send photo prompt with GIF:', err));
    } else {
      await ctx.api.sendMessage(chatId, i18n.t(locale, 'settings_passport_prompt'), {
        reply_markup: { remove_keyboard: true }
      }).catch((err) => logger.error('[Passport] Failed to send photo prompt:', err));
    }
  }
  logger.debug('[Passport] Photo prompt sent, now waiting for photo...');
  
  // Use a loop to handle non-photo messages
  let backFileId = '';
  let photoCtx: BotContext = ctx;
  
  while (true) {
    logger.debug('[Passport] Calling conversation.wait() for photo...');
    photoCtx = await conversation.wait();
    logger.debug(`[Passport] Got update in photo wait - has photo: ${!!photoCtx.message?.photo}, has text: ${!!photoCtx.message?.text}`);
    if (photoCtx.message?.photo) {
      const photos = photoCtx.message.photo;
      backFileId = photos[photos.length - 1].file_id;
      logger.debug(`[Passport] Photo received, file_id: ${backFileId}`);
      break;
    } else if (photoCtx.message?.text) {
      // If user sends text instead of photo, we give a hint and wait again.
      await photoCtx.reply(i18n.t(locale, 'settings_passport_prompt'));
    } else {
      logger.debug('[Passport] Received non-photo non-text message during photo wait, ignoring');
    }
  }

  // Send processing message directly (not in external for same reason)
  let processingMsgId: number | null = null;
  try {
    if (chatId) {
      logger.debug('[Passport] Sending processing message...');
      const msg = await photoCtx.api.sendMessage(chatId, i18n.t(locale, 'settings_passport_processing'));
      processingMsgId = msg.message_id;
      logger.debug(`[Passport] Processing message sent, ID: ${processingMsgId}`);
    }
  } catch (e) {
    logger.debug('[Passport] Error sending processing message');
    processingMsgId = null;
  }

  // Always use the latest context (photoCtx) for operations that might rely on the current update
  logger.debug('[Passport] Entering conversation.external for image processing...');
  const result = await conversation.external(async (uninterceptedCtx) => {
    logger.debug('[Passport] Inside external: Starting OCR processing');
    let cardNumber = null;
    let jshshir = null;
    let firstName: string | null = null;
    let lastName: string | null = null;
    // VERY IMPORTANT: Use the uninterceptedCtx here, NOT photoCtx! 
    // If you use photoCtx.api inside external(), Grammy's interceptor will hang forever, 
    // because you are not allowed to trigger intercepted API calls from inside external.
    const buffer = await downloadFile(uninterceptedCtx as BotContext, backFileId);
    if (!buffer) {
      logger.debug('[Passport] Failed to download image buffer');
      return { cardNumber: '', jshshir: '', firstName: null, lastName: null };
    }

    try {
      logger.debug('[Passport] Running sharp and jsQR...');
      const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const code = jsQR(new Uint8ClampedArray(data), info.width, info.height);

      if (code && code.data) {
        logger.debug(`[Passport] QR code found: ${code.data}`);
        
        // Match JShShIR and Card Number
        const match = code.data.match(/[IPAC][A-Z<]UZB([A-Z0-9<]{9})[0-9<]([0-9<]{14})</i);
        if (match) {
          cardNumber = match[1].replace(/</g, '');
          jshshir = match[2].replace(/</g, '');
        }

        // Match Name
        const mrzIdCardMatch = code.data.match(/\\b([A-Z]+)<<([A-Z]+)<{2,}\\b/i);
        const mrzPassportMatch = code.data.match(/P<UZB([A-Z]+)<<([A-Z]+)<{2,}/i);
        if (mrzIdCardMatch) {
            lastName = mrzIdCardMatch[1];
            firstName = mrzIdCardMatch[2];
        } else if (mrzPassportMatch) {
            lastName = mrzPassportMatch[1];
            firstName = mrzPassportMatch[2];
        }

        // properly capitalize
        if (firstName) firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
        if (lastName) lastName = lastName.charAt(0).toUpperCase() + lastName.slice(1).toLowerCase();

      } else {
        logger.debug('[Passport] No QR code data found in image');
      }
    } catch (err) {
      logger.debug(`[Passport] Error in sharp/jsQR: ${err}`);
    }

    if (!cardNumber || !jshshir || !firstName || !lastName) {
      logger.debug('[Passport] Falling back to OCR service');
      const ocrResult = await OCRService.extractPassportData(buffer);
      if (ocrResult) {
        if (!cardNumber && ocrResult.cardNumber) cardNumber = ocrResult.cardNumber;
        if (!jshshir && ocrResult.jshshir) jshshir = ocrResult.jshshir;
        if (!firstName && ocrResult.firstName) firstName = ocrResult.firstName;
        if (!lastName && ocrResult.lastName) lastName = ocrResult.lastName;
      }
    }
    
    logger.debug(`[Passport] OCR processing finished. Result: ${cardNumber}, ${jshshir}, ${firstName}, ${lastName}`);
    return { cardNumber: cardNumber || '', jshshir: jshshir || '', firstName, lastName };
  });
  logger.debug('[Passport] Exited conversation.external.');

  if (processingMsgId && chatId) {
    logger.debug('[Passport] Deleting processing message...');
    await photoCtx.api.deleteMessage(chatId, processingMsgId).catch(() => {});
  }
  logger.debug('[Passport] Processing message deleted. Moving to variable assignment.');

  let finalSeries = result.cardNumber;
  let finalJshshir = result.jshshir;
  let currentCtx = photoCtx;

  // If data is missing after OCR, ask manually
  if (!finalSeries || !finalJshshir) {
    await currentCtx.reply(i18n.t(locale, 'settings_passport_missing_data'));
  }

  if (!finalSeries) {
    await currentCtx.reply(i18n.t(locale, 'settings_passport_enter_series'));
    while (true) {
      const seriesCtx = await conversation.waitFor('message:text');
      currentCtx = seriesCtx;
      const text = currentCtx.message?.text?.toUpperCase().replace(/\s+/g, '') || '';
      if (/^[A-Z]{2}\d{7}$/.test(text)) {
        finalSeries = text;
        break;
      } else {
        await currentCtx.reply(i18n.t(locale, 'settings_passport_invalid_series'));
      }
    }
  }

  if (!finalJshshir) {
    await currentCtx.reply(i18n.t(locale, 'settings_passport_enter_jshshir'));
    while (true) {
      const jshshirCtx = await conversation.waitFor('message:text');
      currentCtx = jshshirCtx;
      const text = currentCtx.message?.text?.trim() || '';
      if (/^\d{14}$/.test(text)) {
        finalJshshir = text;
        break;
      } else {
        await currentCtx.reply(i18n.t(locale, 'settings_passport_invalid_jshshir'));
      }
    }
  }

  return { series: finalSeries, jshshir: finalJshshir, firstName: result.firstName, lastName: result.lastName, backFileId };
}

