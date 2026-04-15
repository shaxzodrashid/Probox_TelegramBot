import { Keyboard } from 'grammy';
import { BotConversation, BotContext } from '../../types/context';
import { i18n } from '../../i18n';
import { logger } from '../../utils/logger';
import { downloadFileByPath, getTelegramFilePath, normalizeButtonText } from './utils.part';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { OCRService, PassportDataFields } from '../../services/ocr.service';
import { InputFile } from 'grammy';
import path from 'path';
import { buildPassportImageVariants, PassportImageVariant } from '../../utils/passport-image.util';
import { findBestPassportScan } from '../../utils/passport-scan.util';

function normalizeNamePart(value: string | null): string | null {
  if (!value || value.length > 20) return null;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function extractPassportDataFromQrPayload(payload: string): PassportDataFields {
  let cardNumber: string | null = null;
  let jshshir: string | null = null;
  let firstName: string | null = null;
  let lastName: string | null = null;

  const match = payload.match(/[IPAC][A-Z<]UZB([A-Z0-9<]{9})[0-9<]([0-9<]{14})</i);
  if (match) {
    cardNumber = match[1].replace(/</g, '').toUpperCase();
    jshshir = match[2].replace(/</g, '');
  }

  const mrzIdCardMatch = payload.match(/\b([A-Z]+)<<([A-Z]+)<{2,}\b/i);
  const mrzPassportMatch = payload.match(/P<UZB([A-Z]+)<<([A-Z]+)<{2,}/i);

  if (mrzIdCardMatch) {
    lastName = mrzIdCardMatch[1];
    firstName = mrzIdCardMatch[2];
  } else if (mrzPassportMatch) {
    lastName = mrzPassportMatch[1];
    firstName = mrzPassportMatch[2];
  }

  return {
    cardNumber,
    jshshir,
    firstName: normalizeNamePart(firstName),
    lastName: normalizeNamePart(lastName),
  };
}

async function scanQrVariant(variant: PassportImageVariant): Promise<PassportDataFields> {
  try {
    const { data, info } = await sharp(variant.buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const code = jsQR(new Uint8ClampedArray(data), info.width, info.height);

    if (!code?.data) {
      return { cardNumber: null, jshshir: null, firstName: null, lastName: null };
    }

    return extractPassportDataFromQrPayload(code.data);
  } catch (err) {
    logger.debug(`[Passport] QR scan error at angle=${variant.angle}: ${err}`);
    return { cardNumber: null, jshshir: null, firstName: null, lastName: null };
  }
}

export async function handlePhotoMethod(
  conversation: BotConversation,
  ctx: BotContext,
  locale: string,
): Promise<{
  series: string;
  jshshir: string;
  firstName: string | null;
  lastName: string | null;
  fileIds: string[];
  buffers: Buffer[];
  lastCtx: BotContext;
} | null> {
  const chatId = ctx.chat?.id;
  const backBtn = i18n.t(locale, 'back');
  const backBtnNormalized = normalizeButtonText(backBtn);
  const backKeyboard = new Keyboard().text(backBtn).resized().oneTime();

  let frontFileId = '';
  let backFileId = '';
  let frontFilePath: string | null = null;
  let backFilePath: string | null = null;
  let photoCtx: BotContext = ctx;

  if (chatId) {
    logger.debug('[Passport] Sending FRONT photo prompt...');
    const frontImg = new InputFile(path.join(__dirname, '../../uploads/front.JPG'));
    await ctx.api
      .sendPhoto(chatId, frontImg, {
        caption: i18n.t(locale, 'settings_passport_prompt_front'),
        reply_markup: backKeyboard,
      })
      .catch((err) => logger.error('[Passport] Failed to send front prompt:', err));
  }

  while (true) {
    photoCtx = await conversation.wait();
    if (photoCtx.message?.text) {
      if (normalizeButtonText(photoCtx.message.text) === backBtnNormalized) {
        return null;
      }
    }
    
    if (photoCtx.message?.photo) {
      const photos = photoCtx.message.photo;
      frontFileId = photos[photos.length - 1].file_id;
      logger.debug(`[Passport] Front photo received, file_id: ${frontFileId}`);
      break;
    }

    await ctx.reply(i18n.t(locale, 'settings_passport_prompt_front'), {
      reply_markup: backKeyboard,
    });
  }

  if (chatId) {
    logger.debug('[Passport] Sending BACK photo prompt...');
    const backImg = new InputFile(path.join(__dirname, '../../uploads/back.JPG'));
    await ctx.api
      .sendPhoto(chatId, backImg, {
        caption: i18n.t(locale, 'settings_passport_prompt_back'),
        reply_markup: backKeyboard,
      })
      .catch((err) => logger.error('[Passport] Failed to send back prompt:', err));
  }

  while (true) {
    photoCtx = await conversation.wait();
    if (photoCtx.message?.text) {
      if (normalizeButtonText(photoCtx.message.text) === backBtnNormalized) {
        return null;
      }
    }

    if (photoCtx.message?.photo) {
      const photos = photoCtx.message.photo;
      backFileId = photos[photos.length - 1].file_id;
      logger.debug(`[Passport] Back photo received, file_id: ${backFileId}`);
      break;
    }

    await ctx.reply(i18n.t(locale, 'settings_passport_prompt_back'), {
      reply_markup: backKeyboard,
    });
  }

  frontFilePath = await getTelegramFilePath(ctx, frontFileId);
  backFilePath = await getTelegramFilePath(ctx, backFileId);
  logger.debug(
    `[Passport] Resolved Telegram file paths. front=${frontFilePath ? 'ok' : 'missing'}, back=${backFilePath ? 'ok' : 'missing'}`,
  );

  let processingMsgId: number | null = null;
  try {
    if (chatId) {
      logger.debug('[Passport] Sending processing message...');
      const msg = await ctx.api.sendMessage(
        chatId,
        i18n.t(locale, 'settings_passport_processing'),
      );
      logger.debug('[Passport] Processing message sent successfully.');
      processingMsgId = msg.message_id;

      // Show action to user
      await ctx.api.sendChatAction(chatId, 'upload_photo').catch(() => {});
    }
  } catch (err) {
    logger.debug(`[Passport] Error sending processing message: ${err}`);
    processingMsgId = null;
  }

  logger.debug('[Passport] Pre-external check. About to call conversation.external().');
  const result = await conversation.external(async () => {
    logger.debug('[Passport] Inside external: Starting OCR processing');

    const processFile = async (filePath: string | null) => {
      if (!filePath) return null;

      const buffer = await downloadFileByPath(filePath);
      if (!buffer) return null;

      const { metadata, variants } = await buildPassportImageVariants(buffer);
      logger.debug(
        `[Passport] Prepared ${variants.length} variants format=${metadata.format || 'unknown'} size=${metadata.width || 0}x${metadata.height || 0} orientation=${metadata.orientation || 'none'}`,
      );

      const scanResult = await findBestPassportScan(variants, [
        { source: 'qr', scan: scanQrVariant },
        { source: 'ocr', scan: async (variant) => OCRService.extractPassportData(variant.buffer) },
      ]);

      logger.debug(
        `[Passport] Scan result source=${scanResult.source || 'none'} angle=${scanResult.angle ?? 'none'} attempts=${scanResult.attempts} score=${scanResult.score} credible=${scanResult.isCredible}`,
      );

      return {
        cardNumber: scanResult.cardNumber || '',
        jshshir: scanResult.jshshir || '',
        firstName: scanResult.firstName,
        lastName: scanResult.lastName,
        buffer,
      };
    };

    const frontData = await processFile(frontFilePath);
    const backData = await processFile(backFilePath);

    const buffers: Buffer[] = [];
    if (frontData?.buffer) buffers.push(frontData.buffer);
    if (backData?.buffer) buffers.push(backData.buffer);

    return {
      cardNumber: frontData?.cardNumber || backData?.cardNumber || '',
      jshshir: frontData?.jshshir || backData?.jshshir || '',
      firstName: frontData?.firstName || backData?.firstName,
      lastName: frontData?.lastName || backData?.lastName,
      buffers,
    };
  });
  logger.debug('[Passport] Exited conversation.external.');

  logger.debug('[Passport] Pre-delete processing message check.');
  if (processingMsgId && chatId) {
    logger.debug('[Passport] Deleting processing message...');
    await ctx.api.deleteMessage(chatId, processingMsgId).catch((err) => {
      logger.debug(`[Passport] Failed to delete processing message: ${err}`);
    });
  }
  
  // Proceed directly - grammY handles sequential updates automatically
  
  logger.debug('[Passport] Processing message deleted. Moving to variable assignment.');

  let finalSeries = result.cardNumber;
  let finalJshshir = result.jshshir;
  let currentCtx = photoCtx;

  if (!finalSeries || !finalJshshir) {
    await ctx.reply(i18n.t(locale, 'settings_passport_missing_data'));
  }

  if (!finalSeries) {
    await ctx.reply(i18n.t(locale, 'settings_passport_enter_series'), {
      reply_markup: backKeyboard,
    });
    while (true) {
      const seriesCtx = await conversation.wait();
      currentCtx = seriesCtx;
      if (seriesCtx.message?.text) {
        if (normalizeButtonText(seriesCtx.message.text) === backBtnNormalized) {
          return null;
        }
        const text = seriesCtx.message.text.toUpperCase().replace(/\s+/g, '') || '';
        if (/^[A-Z]{2}\d{7}$/.test(text)) {
          finalSeries = text;
          break;
        }
      }
      await ctx.reply(i18n.t(locale, 'settings_passport_invalid_series'), {
        reply_markup: backKeyboard,
      });
    }
  }

  if (!finalJshshir) {
    await ctx.reply(i18n.t(locale, 'settings_passport_enter_jshshir'), {
      reply_markup: backKeyboard,
    });
    while (true) {
      const jshshirCtx = await conversation.wait();
      currentCtx = jshshirCtx;
      if (jshshirCtx.message?.text) {
        if (normalizeButtonText(jshshirCtx.message.text) === backBtnNormalized) {
          return null;
        }
        const text = jshshirCtx.message.text.trim() || '';
        if (/^\d{14}$/.test(text)) {
          finalJshshir = text;
          break;
        }
      }
      await ctx.reply(i18n.t(locale, 'settings_passport_invalid_jshshir'), {
        reply_markup: backKeyboard,
      });
    }
  }

  return {
    series: finalSeries,
    jshshir: finalJshshir,
    firstName: result.firstName || null,
    lastName: result.lastName || null,
    fileIds: [frontFileId, backFileId],
    buffers: result.buffers,
    lastCtx: currentCtx,
  };
}
