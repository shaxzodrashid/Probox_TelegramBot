import { NextFunction } from 'grammy';
import { BotContext } from '../types/context';
import { UserService } from '../services/user.service';

/**
 * Middleware to restore user session data from database if it's lost (e.g. after bot restart)
 */
export const sessionRestorerMiddleware = async (ctx: BotContext, next: NextFunction) => {
    // If language is already in session, just make sure i18n locale is set
    if (ctx.session?.__language_code && ctx.session.languageSelected) {
        const currentLocale = await ctx.i18n.getLocale();
        if (currentLocale !== ctx.session.__language_code) {
            await ctx.i18n.setLocale(ctx.session.__language_code);
        }
        return next();
    }

    // If we have a user and we haven't checked the database yet for this session
    if (ctx.from && ctx.session.languageSelected === undefined) {
        const user = await UserService.getUserByTelegramId(ctx.from.id);

        if (user && user.language_code) {
            // Restore language to session and i18n
            ctx.session.__language_code = user.language_code;
            ctx.session.languageSelected = true;

            // Update i18n for current context
            await ctx.i18n.setLocale(user.language_code);
        } else {
            // Mark that we've checked the database but no user was found/language not selected
            // This prevents repeated DB queries for the same session
            ctx.session.languageSelected = false;
        }
    }

    await next();
};
