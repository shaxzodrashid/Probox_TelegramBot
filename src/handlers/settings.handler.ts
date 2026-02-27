import { BotContext } from '../types/context';
import { getSettingsKeyboard, getSettingsLanguageKeyboard } from '../keyboards';
import { formatUzPhone } from '../utils/uz-phone.util';
import { checkRegistrationOrPrompt } from '../utils/registration.check';
import { i18n } from '../i18n';

export async function settingsHandler(ctx: BotContext) {
  // Check if user is registered, if not, prompt to register
  const user = await checkRegistrationOrPrompt(ctx, false);
  if (!user) return;

  const locale = ctx.session?.__language_code || 'uz';
  const isAdmin = user.is_admin || false;

  const keyboard = getSettingsKeyboard(ctx, isAdmin);

  const message = ctx.t('settings_header', {
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    phone: formatUzPhone(user.phone_number),
    language: locale === 'uz' ? i18n.t('uz', 'uz_button') : i18n.t('ru', 'ru_button'),
    passport_series: user.passport_series || '—',
    jshshir: user.jshshir || '—'
  });

  if (ctx.callbackQuery) {
    // If it was triggered by a callback, we might want to delete the message or reply with a new one
    // because InlineKeyboardMarkup and ReplyKeyboardMarkup don't mix well in editMessageText
    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
  } else {
    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
  }
}

export async function changeNameHandler(ctx: BotContext) {
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
  }
  await ctx.conversation.enter('changeNameConversation');
}

export async function changePhoneHandler(ctx: BotContext) {
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
  }
  await ctx.conversation.enter('changePhoneConversation');
}

export async function changeLanguageHandler(ctx: BotContext) {
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
  }

  const keyboard = getSettingsLanguageKeyboard(ctx);

  await ctx.reply(ctx.t('settings_select_language'), {
    reply_markup: keyboard
  });
}

export async function addPassportHandler(ctx: BotContext) {
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
  }
  // Exit ALL active conversations before entering a fresh one.
  // This prevents stale/frozen conversation state in Redis (e.g. from a
  // previous crash mid-conversation) from silently swallowing incoming
  // messages during replay.
  await ctx.conversation.exitAll();
  await ctx.conversation.enter('addPassportDataConversation');
}
