import { BotConversation, BotContext } from '../../types/context';
import { i18n } from '../../i18n';
import { logger } from '../../utils/logger';
import { downloadFile } from './utils.part';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { OCRService, PassportDataFields } from '../../services/ocr.service';
import { InputFile } from 'grammy';
import path from 'path';
import { buildPassportImageVariants, PassportImageVariant } from '../../utils/passport-image.util';
import { findBestPassportScan } from '../../utils/passport-scan.util';

function normalizeNamePart(value: string | null): string | null {
  if (!value) return null;
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
}> {
  const chatId = ctx.chat?.id;

  let frontFileId = '';
  let backFileId = '';
  let photoCtx: BotContext = ctx;

  if (chatId) {
    logger.debug('[Passport] Sending FRONT photo prompt...');
    const frontImg = new InputFile(path.join(__dirname, '../../uploads/front.JPG'));
    await ctx.api
      .sendPhoto(chatId, frontImg, {
        caption: i18n.t(locale, 'settings_passport_prompt_front'),
        reply_markup: { remove_keyboard: true },
      })
      .catch((err) => logger.error('[Passport] Failed to send front prompt:', err));
  }

  while (true) {
    photoCtx = await conversation.wait();
    if (photoCtx.message?.photo) {
      const photos = photoCtx.message.photo;
      frontFileId = photos[photos.length - 1].file_id;
      logger.debug(`[Passport] Front photo received, file_id: ${frontFileId}`);
      break;
    } else if (photoCtx.message?.text) {
      await photoCtx.reply(i18n.t(locale, 'settings_passport_prompt_front'));
    }
  }

  if (chatId) {
    logger.debug('[Passport] Sending BACK photo prompt...');
    const backImg = new InputFile(path.join(__dirname, '../../uploads/back.JPG'));
    await photoCtx.api
      .sendPhoto(chatId, backImg, {
        caption: i18n.t(locale, 'settings_passport_prompt_back'),
      })
      .catch((err) => logger.error('[Passport] Failed to send back prompt:', err));
  }

  while (true) {
    photoCtx = await conversation.wait();
    if (photoCtx.message?.photo) {
      const photos = photoCtx.message.photo;
      backFileId = photos[photos.length - 1].file_id;
      logger.debug(`[Passport] Back photo received, file_id: ${backFileId}`);
      break;
    } else if (photoCtx.message?.text) {
      await photoCtx.reply(i18n.t(locale, 'settings_passport_prompt_back'));
    }
  }

  let processingMsgId: number | null = null;
  try {
    if (chatId) {
      logger.debug('[Passport] Sending processing message...');
      const msg = await photoCtx.api.sendMessage(
        chatId,
        i18n.t(locale, 'settings_passport_processing'),
      );
      processingMsgId = msg.message_id;
    }
  } catch {
    logger.debug('[Passport] Error sending processing message');
    processingMsgId = null;
  }

  const result = await conversation.external(async (uninterceptedCtx) => {
    logger.debug('[Passport] Inside external: Starting OCR processing');

    const processFile = async (fileId: string) => {
      const buffer = await downloadFile(uninterceptedCtx as BotContext, fileId);
      if (!buffer) {
        return {
          cardNumber: '',
          jshshir: '',
          firstName: null as string | null,
          lastName: null as string | null,
        };
      }

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
      };
    };

    const frontData = await processFile(frontFileId);
    const backData = await processFile(backFileId);

    return {
      cardNumber: frontData.cardNumber || backData.cardNumber || '',
      jshshir: frontData.jshshir || backData.jshshir || '',
      firstName: frontData.firstName || backData.firstName,
      lastName: frontData.lastName || backData.lastName,
    };
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

  return {
    series: finalSeries,
    jshshir: finalJshshir,
    firstName: result.firstName,
    lastName: result.lastName,
    fileIds: [frontFileId, backFileId],
  };
}
