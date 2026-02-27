import { InlineKeyboard } from 'grammy';
import { BotContext } from '../types/context';
import { UserService, User } from '../services/user.service';
import { i18n } from '../i18n';

/**
 * Checks if the user is registered. If not, sends a one-time message
 * prompting the user to register with an inline keyboard button.
 * 
 * @param ctx - The bot context
 * @param requirePhone - Whether to require a phone number for the user to be considered registered (default: true)
 * @returns The user data if registered, or null if not registered (message was sent)
 */
export async function checkRegistrationOrPrompt(ctx: BotContext, requirePhone: boolean = true): Promise<User | null> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return null;

  const user = await UserService.getLoggedInUser(telegramId);
  
  if (user) {
    if (requirePhone && !user.phone_number) {
      const locale = (await ctx.i18n.getLocale()) || 'uz';
      
      const message = i18n.t(locale, 'registration_incomplete');
      const buttonText = i18n.t(locale, 'registration_incomplete_button');

      const keyboard = new InlineKeyboard()
        .text(buttonText, 'open_settings');

      await ctx.reply(message, {
        reply_markup: keyboard,
      });

      return null;
    }
    return user;
  }

  // User is not registered - send prompt message using i18n
  const locale = (await ctx.i18n.getLocale()) || 'uz';
  
  const message = i18n.t(locale, 'registration_required');
  const buttonText = i18n.t(locale, 'registration_button');

  const keyboard = new InlineKeyboard()
    .text(buttonText, 'start_registration');

  await ctx.reply(message, {
    reply_markup: keyboard,
  });

  return null;
}
