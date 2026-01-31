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
    await ctx.conversation.enter('supportConversation');
}

/**
 * Handler for back from support to main menu
 */
export async function backFromSupportHandler(ctx: BotContext): Promise<void> {
    const user = await UserService.getUserByTelegramId(ctx.from!.id);
    if (user?.is_admin) {
        const locale = (await ctx.i18n.getLocale()) || 'uz';
        await ctx.reply(i18n.t(locale, 'admin-menu-header'), {
            reply_markup: getAdminMenuKeyboard(locale),
        });
        return;
    }

    await ctx.reply(ctx.t('welcome-message'), {
        reply_markup: getMainKeyboard(ctx),
    });
}
