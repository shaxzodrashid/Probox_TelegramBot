import { Keyboard } from 'grammy';
import { BotConversation, BotContext } from '../../types/context';
import { i18n } from '../../i18n';
import { normalizeButtonText } from './utils.part';

export async function handleManualMethod(
  conversation: BotConversation,
  ctx: BotContext,
  locale: string
): Promise<{ series: string; jshshir: string; lastCtx: BotContext } | null> {
  const backBtn = i18n.t(locale, 'back');
  const backBtnNormalized = normalizeButtonText(backBtn);
  const backKeyboard = new Keyboard().text(backBtn).resized().oneTime();

  let currentCtx = ctx;
  await ctx.reply(i18n.t(locale, 'settings_passport_enter_series'), { 
    reply_markup: backKeyboard 
  }).catch(() => {});
  
  let currentSeries = '';
  let currentJshshir = '';

  while (true) {
    const seriesCtx = await conversation.waitFor('message:text');
    currentCtx = seriesCtx;
    const rawText = seriesCtx.message?.text || '';
    const normalizedText = normalizeButtonText(rawText);

    if (normalizedText === backBtnNormalized) {
      return null;
    }

    const series = rawText.toUpperCase().replace(/\s+/g, '');
    if (/^[A-Z]{2}\d{7}$/.test(series)) {
      currentSeries = series;
      break;
    } else {
      await ctx.reply(i18n.t(locale, 'settings_passport_invalid_series'), {
        reply_markup: backKeyboard
      });
    }
  }

  await ctx.reply(i18n.t(locale, 'settings_passport_enter_jshshir'), {
    reply_markup: backKeyboard
  });
  while (true) {
    const jshshirCtx = await conversation.waitFor('message:text');
    currentCtx = jshshirCtx;
    const rawText = jshshirCtx.message?.text || '';
    const normalizedText = normalizeButtonText(rawText);

    if (normalizedText === backBtnNormalized) {
      return null;
    }

    const jshshir = rawText.trim();
    if (/^\d{14}$/.test(jshshir)) {
      currentJshshir = jshshir;
      break;
    } else {
      await ctx.reply(i18n.t(locale, 'settings_passport_invalid_jshshir'), {
        reply_markup: backKeyboard
      });
    }
  }

  return { series: currentSeries, jshshir: currentJshshir, lastCtx: currentCtx };
}

