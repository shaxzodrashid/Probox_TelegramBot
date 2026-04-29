import { BotConversation, BotContext } from '../types/context';
import { InlineKeyboard, Keyboard } from 'grammy';
import { getMainKeyboardByLocale } from '../keyboards';
import axios from 'axios';
import FormData from 'form-data';
import { UserService } from '../services/user.service';
import { BranchService } from '../services/branch.service';
import { minioService } from '../services/minio.service';
import { logger } from '../utils/logger';
import { config } from '../config';
import { i18n } from '../i18n';
import { getLocaleFromConversation } from '../utils/locale';
import { redisService } from '../redis/redis.service';
import {
  ApplicationPayload,
  buildApplicationPayload,
  getMissingApplicationPayloadFields,
  isApplicationRegistrationComplete,
} from '../utils/application/application-payload.util';

const CRM_FILES_FIELD = 'files';

type ApplicationFile = { buffer: Buffer; filename: string; contentType: string };

type CrmSubmissionResult =
  | { success: true; status: number; data: unknown }
  | { success: false; message: string; status?: number; data?: unknown };

function getApplicationDataKeyboard(locale: string): Keyboard {
  return new Keyboard()
    .text(i18n.t(locale, 'application_start_passport_button'))
    .row()
    .text(i18n.t(locale, 'back'))
    .resized();
}

async function replyApplicationDataRequired(ctx: BotContext, locale: string): Promise<void> {
  await ctx.reply(i18n.t(locale, 'application_profile_required'), {
    reply_markup: getApplicationDataKeyboard(locale),
  });
}

async function replyApplicationRetry(ctx: BotContext, locale: string): Promise<void> {
  const retryKeyboard = new InlineKeyboard().text(
    i18n.t(locale, 'application_continue_button'),
    'continue_to_application',
  );

  await ctx.reply(i18n.t(locale, 'application_error'), {
    reply_markup: retryKeyboard,
  });
}

function getCrmResponseFailureMessage(status: number, data: unknown): string | null {
  if (status < 200 || status >= 300) {
    return `CRM returned HTTP ${status}`;
  }

  if (!data || typeof data !== 'object') {
    return null;
  }

  const response = data as Record<string, unknown>;
  if (response.success === false) {
    return 'CRM response has success=false';
  }

  if (response.ok === false) {
    return 'CRM response has ok=false';
  }

  const responseStatus = response.status ?? response.Status;
  if (
    typeof responseStatus === 'string' &&
    /\b(error|failed|failure|rejected|denied)\b/i.test(responseStatus)
  ) {
    return `CRM response status=${responseStatus}`;
  }

  const hasErrorDetails = (value: unknown): boolean => {
    if (Array.isArray(value)) {
      return value.length > 0;
    }

    if (value && typeof value === 'object') {
      return Object.keys(value).length > 0;
    }

    return Boolean(value);
  };

  if (hasErrorDetails(response.error) || hasErrorDetails(response.errors)) {
    return 'CRM response contains error details';
  }

  return null;
}

function appendApplicationFiles(form: FormData, files: ApplicationFile[]) {
  // Multipart "arrays" are represented by repeating the same field name.
  // This keeps the payload as files: [file1, file2, file3] on the receiver side.
  for (const { buffer, filename, contentType } of files) {
    form.append(CRM_FILES_FIELD, buffer, { filename, contentType });
  }
}

function appendApplicationPayload(form: FormData, payload: ApplicationPayload): void {
  form.append('clientName', payload.clientName);
  form.append('clientPhone', payload.clientPhone);
  form.append('jshshir', payload.jshshir);
  form.append('passportId', payload.passportId);
  form.append('address', payload.address);
}

async function getApplicationImageObjects(
  conversation: BotConversation,
  telegramId: number,
): Promise<string[]> {
  const passportObjects = await conversation.external(() =>
    minioService.listObjects(`passports/${telegramId}/`),
  );
  const faceIdObjects = await conversation.external(() =>
    minioService.listObjects(`face_id/${telegramId}/`),
  );

  return [...passportObjects, ...faceIdObjects]
    .filter((obj) => /\.(jpg|jpeg|png|webp)$/i.test(obj))
    .sort()
    .slice(0, 10);
}

async function loadApplicationImageBuffers(
  conversation: BotConversation,
  imageObjects: string[],
): Promise<ApplicationFile[]> {
  const imageBuffers: ApplicationFile[] = [];

  for (const objPath of imageObjects) {
    const rawBuffer = await conversation.external(() => minioService.getFileAsBuffer(objPath));
    const buffer = Buffer.from(rawBuffer);

    const ext = objPath.split('.').pop()?.toLowerCase() || 'jpg';
    const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    const filename = objPath.split('/').pop() || 'image.jpg';

    imageBuffers.push({ buffer, filename, contentType });
  }

  return imageBuffers;
}

async function ensureApplicationAddress(
  conversation: BotConversation,
  ctx: BotContext,
  locale: string,
  telegramId: number,
): Promise<{ user: Awaited<ReturnType<typeof UserService.getLoggedInUser>>; ctx: BotContext }> {
  let currentCtx = ctx;

  await currentCtx.reply(i18n.t(locale, 'settings_passport_ask_address'), {
    reply_markup: new Keyboard()
      .requestLocation(i18n.t(locale, 'settings_passport_btn_send_location'))
      .resized()
      .oneTime(),
  });

  while (true) {
    const addressCtx = await conversation.wait();
    currentCtx = addressCtx;

    let extractedAddress: string | null = null;

    if (addressCtx.message?.location) {
      const chatId = addressCtx.chat?.id;
      let addressProcessingMsgId: number | null = null;

      try {
        const msg = await addressCtx.reply(i18n.t(locale, 'settings_passport_address_processing'));
        addressProcessingMsgId = msg.message_id;
        if (chatId) {
          await addressCtx.api.sendChatAction(chatId, 'find_location').catch(() => {});
        }
      } catch {
        addressProcessingMsgId = null;
      }

      const { latitude, longitude } = addressCtx.message.location;
      extractedAddress = await conversation.external(() =>
        BranchService.reverseGeocode(latitude, longitude),
      );

      if (addressProcessingMsgId && chatId) {
        await addressCtx.api.deleteMessage(chatId, addressProcessingMsgId).catch(() => {});
      }
    } else if (addressCtx.message?.text) {
      extractedAddress = addressCtx.message.text.trim();
    }

    if (!extractedAddress) {
      await currentCtx.reply(i18n.t(locale, 'settings_passport_address_invalid'));
      continue;
    }

    await conversation.external(() => UserService.updateUserAddress(telegramId, extractedAddress));
    await currentCtx.reply(i18n.t(locale, 'settings_passport_address_success'), {
      reply_markup: { remove_keyboard: true },
    });

    return {
      user: await conversation.external(() => UserService.getLoggedInUser(telegramId)),
      ctx: currentCtx,
    };
  }
}

export async function submitApplication(
  conversation: BotConversation,
  ctx: BotContext,
  locale: string,
  initialUser?: Awaited<ReturnType<typeof UserService.getLoggedInUser>>,
): Promise<boolean> {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    return false;
  }

  let user =
    initialUser ?? (await conversation.external(() => UserService.getLoggedInUser(telegramId)));
  if (!user) {
    return false;
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
      return false;
    }

    await currentCtx.reply(i18n.t(locale, 'application_first_name_saved'));
  }

  if (!user.address?.trim()) {
    const addressResult = await ensureApplicationAddress(
      conversation,
      currentCtx,
      locale,
      telegramId,
    );
    currentCtx = addressResult.ctx;
    user = addressResult.user;

    if (!user) {
      return false;
    }
  }

  try {
    const payload = buildApplicationPayload(user);
    const missingFields = getMissingApplicationPayloadFields(payload);
    if (missingFields.length > 0) {
      logger.warn(
        `[Application] Cannot submit incomplete payload for user ${telegramId}: missing=${missingFields.join(',')}`,
      );
      await replyApplicationDataRequired(currentCtx, locale);
      return false;
    }

    const allImageObjects = await getApplicationImageObjects(conversation, telegramId);
    if (allImageObjects.length === 0) {
      logger.warn(`[Application] Cannot submit user ${telegramId}: no passport/face files found`);
      await replyApplicationDataRequired(currentCtx, locale);
      return false;
    }

    if (allImageObjects.length > 0) {
      await currentCtx.reply(i18n.t(locale, 'settings_passport_processing'));
    }

    const imageBuffers = await loadApplicationImageBuffers(conversation, allImageObjects);

    // Build form and send to CRM inside conversation.external()
    // We wrap it in try/catch to ensure we return a plain serializable object,
    // avoiding DataCloneError when Axios throws an error with non-clonable functions.
    const result: CrmSubmissionResult = await conversation.external(async () => {
      try {
        const form = new FormData();

        appendApplicationPayload(form, payload);
        appendApplicationFiles(form, imageBuffers);

        logger.info(
          `[CRM] Request for user ${telegramId}: ${JSON.stringify({
            fields: payload,
            files: imageBuffers.map((file) => ({
              filename: file.filename,
              contentType: file.contentType,
              size: file.buffer.length,
            })),
          })}`,
        );

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

        logger.info(
          `[CRM] Response for user ${telegramId}: status=${response.status}, data=${JSON.stringify(response.data)}`,
        );

        const failureMessage = getCrmResponseFailureMessage(response.status, response.data);
        if (failureMessage) {
          return {
            success: false,
            message: failureMessage,
            status: response.status,
            data: response.data,
          };
        }

        return { success: true, status: response.status, data: response.data };
      } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
          return {
            success: false,
            message: error.message,
            status: error.response?.status,
            data: error.response?.data,
          };
        }

        return {
          success: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    });

    if (!result.success) {
      throw new Error(
        `CRM_ERROR: ${result.message}${result.status ? ` (Status: ${result.status})` : ''}${result.data ? ` - ${JSON.stringify(result.data)}` : ''}`,
      );
    }

    logger.info(
      `[CRM] Lead sent successfully for user ${telegramId}: ${JSON.stringify(result.data)}`,
    );
    await conversation.external(() => redisService.delete(`pendingAction:${telegramId}`));
    await currentCtx.reply(i18n.t(locale, 'application_success'), {
      reply_markup: getMainKeyboardByLocale(locale, user.is_admin, true),
    });
    return true;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error(`[CRM] Axios error sending lead for user ${telegramId}:`, error.message);
      if (error.response) {
        logger.error(`[CRM] Response status: ${error.response.status}, Data:`, error.response.data);
      }
    } else {
      logger.error(
        `[CRM] Error sending lead for user ${telegramId}:`,
        error instanceof Error ? error.message : error,
      );
    }

    await replyApplicationRetry(currentCtx, locale);
    return false;
  }
}

export async function applicationConversation(conversation: BotConversation, ctx: BotContext) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const locale = await getLocaleFromConversation(conversation);
  await conversation.external(() =>
    redisService.set(`pendingAction:${telegramId}`, 'application', 3600),
  );

  const user = await conversation.external(() => UserService.getLoggedInUser(telegramId));
  if (!user || !isApplicationRegistrationComplete(user)) {
    const keyboard = new InlineKeyboard().text(
      i18n.t(locale, 'registration_button'),
      'start_registration',
    );
    await ctx.reply(i18n.t(locale, 'registration_required'), {
      reply_markup: keyboard,
    });

    // Provide the registration button. The bot.ts handles the start_registration callback.
    return;
  }

  if (!user.jshshir || !user.passport_series) {
    await replyApplicationDataRequired(ctx, locale);

    // Provide the passport button. The bot.ts handles the passport button text or "back" text.
    return;
  }

  await submitApplication(conversation, ctx, locale, user);
}
