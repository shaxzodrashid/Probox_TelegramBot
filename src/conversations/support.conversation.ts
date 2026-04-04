import { BotConversation, BotContext } from '../types/context';
import { Keyboard } from 'grammy';
import { getMainKeyboardByLocale } from '../keyboards';
import { getAdminMenuKeyboard } from '../keyboards/admin.keyboards';
import { i18n } from '../i18n';
import { UserService } from '../services/user.service';
import { logger } from '../utils/logger';
import { getLocaleFromConversation } from '../utils/locale';
import { bot } from '../bot';
import { processSupportRequest } from '../utils/support.util';
import {
    resolveUiTextAction,
    routeUiTextAction,
    showSafeMenuFallback,
} from '../utils/ui-text-resolver';



/**
 * Support Conversation - Handles user support requests
 */
export async function supportConversation(conversation: BotConversation, ctx: BotContext) {
    const locale = await getLocaleFromConversation(conversation);
    try {
        const telegramId = ctx.from?.id;

        if (!telegramId) {
            logger.error('Support conversation: No telegram ID found');
            return;
        }

        // 1. Get user data (includes ban status)
        let user = await conversation.external(() =>
            UserService.getUserByTelegramId(telegramId)
        );

        if (!user) {
            // This should rarely happen as handler ensures creation, 
            // but fallback if it does
            user = await conversation.external(() => UserService.createUser({
                telegram_id: telegramId,
                first_name: ctx.from?.first_name,
                last_name: ctx.from?.last_name,
                language_code: locale
            }));
        }

        // 2. Check if user is banned from support
        if (user.is_support_banned) {
            const isAdmin = user.is_admin || false;

            if (isAdmin) {
                await ctx.reply(i18n.t(locale, 'admin_menu_header'), {
                    reply_markup: getAdminMenuKeyboard(locale),
                });
            } else {
                const isLoggedIn = user ? !user.is_logged_out : false;
                await ctx.reply(i18n.t(locale, 'support_banned'), {
                    reply_markup: getMainKeyboardByLocale(locale, false, isLoggedIn),
                });
            }
            return;
        }

        // 3. Show cancel keyboard and ask for message
        const cancelKeyboard = new Keyboard()
            .text(i18n.t(locale, 'support_cancel'))
            .resized()
            .oneTime();

        await ctx.reply(i18n.t(locale, 'support_ask_message'), {
            reply_markup: cancelKeyboard,
        });

        // 4. Wait for user's message (text or photo)
        while (true) {
            const messageContext = await conversation.wait();
            const message = messageContext.message;

            if (message?.text === '/start') {
                await conversation.external(async (outsideCtx) => {
                    await outsideCtx.conversation.exitAll();
                    await showSafeMenuFallback(outsideCtx as BotContext);
                });
                return;
            }

            const resolution = resolveUiTextAction(message?.text);
            if (resolution) {
                await conversation.external(async (outsideCtx) => {
                    await outsideCtx.conversation.exitAll();
                    await routeUiTextAction(outsideCtx as BotContext, resolution);
                });
                return;
            }

            // Check for text message
            if (message?.text) {
                try {
                    await conversation.external(() => processSupportRequest(
                        bot.api,
                        messageContext,
                        user,
                        message.text!,
                        message.message_id,
                        undefined,
                        locale
                    ));
                } catch (error) {
                    // processSupportRequest already logs and notifies user
                }
                return;
            }

            // Check for photo with caption
            if (message?.photo) {
                const photoFileId = message.photo[message.photo.length - 1].file_id;
                const caption = message.caption || `[${i18n.t(locale, 'admin_broadcast_enter_message')}]`;

                try {
                    await conversation.external(() => processSupportRequest(
                        bot.api,
                        messageContext,
                        user,
                        caption,
                        message.message_id,
                        photoFileId,
                        locale
                    ));
                } catch (error) {
                    // processSupportRequest already logs and notifies user
                }
                return;
            }

            // Invalid input, ask again
            await messageContext.reply(i18n.t(locale, 'support_ask_message'), {
                reply_markup: cancelKeyboard,
            });
        }
    } catch (error) {
        logger.error('Error in support conversation:', error);
        // Fallback to basic keyboard if user is not available
        await ctx.reply(i18n.t(locale, 'support_error'), {
            reply_markup: getMainKeyboardByLocale(locale, false, true),
        });
    }
}

