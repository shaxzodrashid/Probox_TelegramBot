import { BotConversation, BotContext } from '../../types/context';
import { i18n } from '../../i18n';

export async function handleManualMethod(
  conversation: BotConversation,
  ctx: BotContext,
  locale: string
): Promise<{ series: string; jshshir: string }> {
  // Send prompt directly (not in external - using ctx inside external causes hangs on replay)
  await ctx.reply(i18n.t(locale, 'settings_passport_enter_series'), { 
    reply_markup: { remove_keyboard: true } 
  }).catch(() => {});
  
  let currentSeries = '';
  let currentJshshir = '';

  while (true) {
    const seriesCtx = await conversation.waitFor('message:text');
    const text = seriesCtx.message?.text?.toUpperCase().replace(/\s+/g, '') || '';
    if (/^[A-Z]{2}\d{7}$/.test(text)) {
      currentSeries = text;
      break;
    } else {
      await seriesCtx.reply(i18n.t(locale, 'settings_passport_invalid_series'));
    }
  }

  await ctx.reply(i18n.t(locale, 'settings_passport_enter_jshshir'));
  while (true) {
    const jshshirCtx = await conversation.waitFor('message:text');
    const text = jshshirCtx.message?.text?.trim() || '';
    if (/^\d{14}$/.test(text)) {
      currentJshshir = text;
      break;
    } else {
      await jshshirCtx.reply(i18n.t(locale, 'settings_passport_invalid_jshshir'));
    }
  }

  return { series: currentSeries, jshshir: currentJshshir };
}

