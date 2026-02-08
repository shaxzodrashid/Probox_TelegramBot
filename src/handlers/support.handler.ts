import { BotContext } from '../types/context';
import { getMainKeyboard } from '../keyboards';
import { UserService } from '../services/user.service';
import { getAdminMenuKeyboard } from '../keyboards/admin.keyboards';
import { i18n } from '../i18n';
import { checkRegistrationOrPrompt } from '../utils/registration.check';

/**
 * Handler for the support menu button
 * Starts the support conversation
 */
export async function supportHandler(ctx: BotContext): Promise<void> {
    // Check if user is registered, if not, prompt to register
    const user = await checkRegistrationOrPrompt(ctx);
    if (!user) return;

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
