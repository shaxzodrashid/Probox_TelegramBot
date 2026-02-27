import { BotContext } from '../types/context';
import { getMainKeyboard } from '../keyboards';
import { UserService } from '../services/user.service';
import { getAdminMenuKeyboard } from '../keyboards/admin.keyboards';
import { i18n } from '../i18n';

/**
 * Handler for the support menu button
 * Starts the support conversation
 */
export async function supportHandler(ctx: BotContext): Promise<void> {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    // Ensure user exists in database (so support tickets can be created with valid reference)
    let user = await UserService.getUserByTelegramId(telegramId);
    if (!user) {
        const locale = (await ctx.i18n.getLocale()) || 'uz';
        user = await UserService.createUser({
            telegram_id: telegramId,
            first_name: ctx.from?.first_name,
            last_name: ctx.from?.last_name,
            language_code: locale,
        });
    }

    await ctx.conversation.enter('supportConversation');
}

/**
 * Handler for back from support to main menu
 */
export async function backFromSupportHandler(ctx: BotContext): Promise<void> {
    const user = await UserService.getUserByTelegramId(ctx.from!.id);
    if (user?.is_admin) {
        const locale = (await ctx.i18n.getLocale()) || 'uz';
        await ctx.reply(i18n.t(locale, 'admin_menu_header'), {
            reply_markup: getAdminMenuKeyboard(locale),
        });
        return;
    }

    const isLoggedIn = user ? !user.is_logged_out : false;
    await ctx.reply(ctx.t('welcome_message'), {
        reply_markup: getMainKeyboard(ctx, false, isLoggedIn),
    });
}
