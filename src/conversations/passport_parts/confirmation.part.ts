import { Keyboard } from 'grammy';
import { BotConversation, BotContext } from '../../types/context';
import { i18n } from '../../i18n';
import { normalizeButtonText } from './utils.part';

export async function runConfirmationLoop(
  conversation: BotConversation,
  ctx: BotContext,
  locale: string,
  initialData: { series: string; jshshir: string }
): Promise<{ series: string; jshshir: string }> {
  let { series, jshshir } = initialData;
  let confirmed = false;
  let currentCtx = ctx;

  while (!confirmed) {
    const confirmText = i18n.t(locale, 'settings_passport_confirm_data', {
      series: series,
      jshshir: jshshir
    });
    
    const editSeriesBtn = i18n.t(locale, 'settings_passport_edit_series');
    const editJshshirBtn = i18n.t(locale, 'settings_passport_edit_jshshir');
    const confirmBtn = i18n.t(locale, 'settings_passport_confirm_btn');
    
    const confirmKeyboard = new Keyboard()
      .text(editSeriesBtn).row()
      .text(editJshshirBtn).row()
      .text(confirmBtn)
      .resized().oneTime();

    await currentCtx.reply(confirmText, { 
      parse_mode: 'Markdown', 
      reply_markup: confirmKeyboard 
    }).catch(() => currentCtx.reply(confirmText.replace(/[*_`]/g, ''), { reply_markup: confirmKeyboard }));

    let action = '';
    while (true) {
      const actionCtx = await conversation.wait();
      currentCtx = actionCtx;

      if (!currentCtx.message?.text) {
        await currentCtx.reply(i18n.t(locale, 'settings_passport_use_buttons'));
        continue;
      }

      const text = normalizeButtonText(currentCtx.message.text);

      if (text === normalizeButtonText(editSeriesBtn) || text.includes('seriya')) {
        action = 'edit_series';
        break;
      } else if (text === normalizeButtonText(editJshshirBtn) || text.includes('jshshir')) {
        action = 'edit_jshshir';
        break;
      } else if (text === normalizeButtonText(confirmBtn) || text.includes('tasdiqlash')) {
        action = 'confirm_data';
        break;
      } else {
        await currentCtx.reply(i18n.t(locale, 'settings_passport_use_buttons'));
      }
    }

    if (action === 'edit_series') {
      await currentCtx.reply(i18n.t(locale, 'settings_passport_enter_series'));
      while (true) {
        const seriesCtx = await conversation.waitFor('message:text');
        currentCtx = seriesCtx;
        const text = currentCtx.message?.text?.toUpperCase().replace(/\s+/g, '') || '';
        if (/^[A-Z]{2}\d{7}$/.test(text)) {
          series = text;
          break;
        } else {
          await currentCtx.reply(i18n.t(locale, 'settings_passport_invalid_series'));
        }
      }
    } else if (action === 'edit_jshshir') {
      await currentCtx.reply(i18n.t(locale, 'settings_passport_enter_jshshir'));
      while (true) {
        const jshshirCtx = await conversation.waitFor('message:text');
        currentCtx = jshshirCtx; // Update currentCtx with the latest context
        const text = currentCtx.message?.text?.trim() || '';
        if (/^\d{14}$/.test(text)) {
          jshshir = text;
          break;
        } else {
          await currentCtx.reply(i18n.t(locale, 'settings_passport_invalid_jshshir'));
        }
      }
    } else if (action === 'confirm_data') {
      confirmed = true;
    }
  }

  return { series, jshshir };
}

