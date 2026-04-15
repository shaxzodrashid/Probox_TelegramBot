import { Keyboard } from 'grammy';
import { BotConversation, BotContext } from '../types/context';
import { i18n } from '../i18n';
import { getMainKeyboardByLocale } from '../keyboards';
import { UserService } from '../services/user.service';
import { BranchService } from '../services/branch.service';
import { minioService } from '../services/minio.service';
import { logger } from '../utils/logger';
import { normalizeButtonText, downloadFileByPath, getTelegramFilePath } from './passport_parts/utils.part';
import { handlePhotoMethod } from './passport_parts/photo.part';
import { handleManualMethod } from './passport_parts/manual.part';
import { runConfirmationLoop } from './passport_parts/confirmation.part';
import { submitApplication } from './application.conversation';
import { redisService } from '../redis/redis.service';
import { detectFace } from '../utils/face-detection.util';
import { isMessageToDeleteNotFoundError } from '../utils/telegram-errors';

export async function addPassportDataConversation(conversation: BotConversation, ctx: BotContext) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const locale = (ctx.session as any)?.__language_code || 'uz';
  logger.debug(`[Passport] Conversation started. Locale: ${locale}, User: ${telegramId}`);

  try {
    const user = await UserService.getUserByTelegramId(telegramId);
    const isAdmin = user?.is_admin || false;
    const pendingAction = await conversation.external(() => redisService.get<string>(`pendingAction:${telegramId}`));
    const shouldResumeApplication = pendingAction === 'application';

    let currentSeries = '';
    let currentJshshir = '';
    let method = '';
    let fileIds: string[] = [];
    let passportBuffers: Buffer[] = [];
    let extractedFirstName: string | null = null;
    let extractedLastName: string | null = null;
    let currentCtx: BotContext = ctx;

    const photoBtn = i18n.t(locale, 'settings_passport_method_photo');
    const manualBtn = i18n.t(locale, 'settings_passport_method_manual');
    const photoBtnNormalized = normalizeButtonText(photoBtn);
    const manualBtnNormalized = normalizeButtonText(manualBtn);

    const methodKeyboard = new Keyboard().text(photoBtn).text(manualBtn).resized().oneTime();

    while (true) {
      logger.debug('[Passport] Sending method selection keyboard');
      await ctx.reply(i18n.t(locale, 'settings_add_passport_method'), {
        reply_markup: methodKeyboard,
      });

      while (true) {
        logger.debug('[Passport] Waiting for method selection...');
        const methodCtx = await conversation.wait();
        currentCtx = methodCtx;

        if (!methodCtx.message?.text) {
          logger.debug('[Passport] Non-text message received during method selection, prompting user');
          await ctx.reply(i18n.t(locale, 'settings_add_passport_method'), {
            reply_markup: methodKeyboard,
          });
          continue;
        }

        const text = normalizeButtonText(methodCtx.message.text);
        logger.debug(`[Passport] Method selection received - raw: "${methodCtx.message.text}", normalized: "${text}"`);

        if (text === photoBtnNormalized) {
          method = 'method_photo';
          break;
        }

        if (text === manualBtnNormalized) {
          method = 'method_manual';
          break;
        }

        await ctx.reply(i18n.t(locale, 'settings_add_passport_method'), {
          reply_markup: methodKeyboard,
        });
      }

      if (method === 'method_photo') {
        const result = await handlePhotoMethod(conversation, currentCtx, locale);
        if (!result) {
          method = '';
          continue;
        }
        currentSeries = result.series;
        currentJshshir = result.jshshir;
        extractedFirstName = result.firstName;
        extractedLastName = result.lastName;
        fileIds = result.fileIds;
        passportBuffers = result.buffers || [];
        currentCtx = result.lastCtx;
        break;
      } else {
        const result = await handleManualMethod(conversation, currentCtx, locale);
        if (!result) {
          method = '';
          continue;
        }
        currentSeries = result.series;
        currentJshshir = result.jshshir;
        currentCtx = result.lastCtx;
        break;
      }
    }

    const confirmedData = await runConfirmationLoop(conversation, currentCtx, locale, {
      series: currentSeries,
      jshshir: currentJshshir,
    });

    currentSeries = confirmedData.series;
    currentJshshir = confirmedData.jshshir;
    currentCtx = confirmedData.lastCtx;
    logger.debug(`[Passport] Confirmation done. series=${currentSeries}, jshshir=${currentJshshir}`);

    let savingMsgId: number | null = null;
    try {
      const msg = await currentCtx.reply(i18n.t(locale, 'settings_passport_saving'));
      savingMsgId = msg.message_id;
      await ctx.api.sendChatAction(currentCtx.chat!.id, 'typing').catch(() => {});
    } catch (e) {
      logger.debug(`[Passport] Error sending saving message: ${e}`);
    }

    await conversation.external(async () => {
      await UserService.updateUserPassportData(telegramId, currentJshshir, currentSeries);

      if (passportBuffers.length > 0) {
        logger.debug(`[Passport] Uploading ${passportBuffers.length} passport images to MinIO for user ${telegramId}`);
        await minioService.uploadUserPassport(telegramId, passportBuffers);
      }

      if (extractedFirstName || extractedLastName) {
        const currentUser = await UserService.getUserByTelegramId(telegramId);
        if (currentUser) {
          const first = currentUser.first_name || extractedFirstName || null;
          const last = currentUser.last_name || extractedLastName || null;

          if ((!currentUser.first_name && extractedFirstName) || (!currentUser.last_name && extractedLastName)) {
            logger.debug(`[Passport] Updating newly extracted names: ${first} ${last}`);
            await UserService.updateUserName(telegramId, first, last);
          }
        }
      }
    });

    if (savingMsgId) {
      await currentCtx.api.deleteMessage(currentCtx.chat!.id, savingMsgId).catch(() => {});
    }

    // --- Face ID STEP ---
    logger.debug(`[Passport] Starting Face ID step for user ${telegramId}`);
    
    await currentCtx.reply(i18n.t(locale, 'settings_passport_ask_face_id'), {
      reply_markup: { remove_keyboard: true },
    });

    while (true) {
      const faceCtx = await conversation.wait();
      currentCtx = faceCtx;

      if (faceCtx.message?.photo) {
        const fileId = faceCtx.message.photo[faceCtx.message.photo.length - 1].file_id;
        
        const feedbackMsg = await faceCtx.reply(i18n.t(locale, 'settings_passport_face_id_processing'));

        const filePath = await getTelegramFilePath(faceCtx, fileId);
        if (!filePath) {
          await faceCtx.reply(i18n.t(locale, 'admin_error_generic'));
          continue;
        }

        const buffer = await downloadFileByPath(filePath);
        if (!buffer) {
          await faceCtx.reply(i18n.t(locale, 'admin_error_generic'));
          continue;
        }

        await ctx.api.sendChatAction(faceCtx.chat!.id, 'typing').catch(() => {});
        const hasFace = await conversation.external(() => detectFace(buffer));
        
        if (hasFace) {
          try {
            await conversation.external(() => minioService.uploadFaceId(telegramId, buffer));
          } catch (err) {
            logger.error(`[Passport] Face ID storage failed for user ${telegramId}:`, err);
            await faceCtx.api
              .editMessageText(
                faceCtx.chat!.id,
                feedbackMsg.message_id,
                i18n.t(locale, 'settings_passport_face_id_storage_error'),
              )
              .catch((editErr) => {
                if (!isMessageToDeleteNotFoundError(editErr)) throw editErr;
              });
            continue;
          }
          await faceCtx.api
            .editMessageText(
              faceCtx.chat!.id,
              feedbackMsg.message_id,
              i18n.t(locale, 'settings_passport_face_id_success')
            )
            .catch((err) => {
              if (!isMessageToDeleteNotFoundError(err)) throw err;
            });
          
          // Continue to next step
          break;
        } else {
          await faceCtx.api
            .editMessageText(
              faceCtx.chat!.id,
              feedbackMsg.message_id,
              i18n.t(locale, 'settings_passport_face_id_error'),
            )
            .catch((err) => {
              if (!isMessageToDeleteNotFoundError(err)) throw err;
            });
          continue;
        }
      } else {
        await currentCtx.reply(i18n.t(locale, 'settings_passport_ask_face_id'));
      }
    }
    // --- End Face ID STEP ---

    // --- Address STEP ---
    logger.debug(`[Passport] Starting Address step for user ${telegramId}`);
    
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
        let addressProcessingMsgId: number | null = null;
        try {
          const msg = await addressCtx.reply(i18n.t(locale, 'settings_passport_address_processing'));
          addressProcessingMsgId = msg.message_id;
          await ctx.api.sendChatAction(addressCtx.chat!.id, 'find_location').catch(() => {});
        } catch (e) {}

        const { latitude, longitude } = addressCtx.message.location;
        extractedAddress = await conversation.external(() => 
          BranchService.reverseGeocode(latitude, longitude)
        );

        if (addressProcessingMsgId) {
          await addressCtx.api.deleteMessage(addressCtx.chat!.id, addressProcessingMsgId).catch(() => {});
        }
      } else if (addressCtx.message?.text) {
        extractedAddress = addressCtx.message.text.trim();
      }

      if (!extractedAddress || extractedAddress.length === 0) {
        await currentCtx.reply(i18n.t(locale, 'settings_passport_address_invalid'));
        continue;
      }

      await conversation.external(() => UserService.updateUserAddress(telegramId, extractedAddress as string));
      await currentCtx.reply(i18n.t(locale, 'settings_passport_address_success'));
      break;
    }

    if (shouldResumeApplication) {
      await ctx.reply(i18n.t(locale, 'settings_passport_success'), {
        reply_markup: { remove_keyboard: true },
      });
      try {
        await submitApplication(conversation, currentCtx, locale);
      } catch (err) {
        logger.error('[Passport] Failed to submit application after passport save:', err);
        await currentCtx.reply(i18n.t(locale, 'application_error')).catch(() => {});
      } finally {
        await conversation.external(() => redisService.delete(`pendingAction:${telegramId}`));
      }
      return;
    }

    await ctx.reply(i18n.t(locale, 'settings_passport_success'), {
      reply_markup: getMainKeyboardByLocale(locale, isAdmin, true),
    });
  } catch (err) {
    logger.error('[Passport] UNHANDLED ERROR in conversation:', err);
    await ctx.reply(`❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.`).catch(() => {});
  }
}
