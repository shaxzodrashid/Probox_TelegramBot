import { BotConversation, BotContext } from '../types/context';
import { getBranchLocationRequestKeyboard, getBranchesKeyboard } from '../keyboards/branch.keyboards';
import { getMainKeyboardByLocale } from '../keyboards';
import { i18n } from '../i18n';
import { BranchService } from '../services/branch.service';
import { UserService } from '../services/user.service';
import { calculateDistanceKm, findBranchByNameCaseInsensitive, formatBranchDetails } from '../utils/branch.util';
import { getLocaleFromConversation } from '../utils/locale';

const showMainMenu = async (conversation: BotConversation, ctx: BotContext, locale: string) => {
  const telegramId = ctx.from?.id;
  const user = telegramId
    ? await conversation.external(() => UserService.getUserByTelegramId(telegramId))
    : null;

  await ctx.reply(i18n.t(locale, 'welcome_message'), {
    reply_markup: getMainKeyboardByLocale(locale, Boolean(user?.is_admin), Boolean(user && !user.is_logged_out)),
  });
};

const showBranchesMenu = async (conversation: BotConversation, ctx: BotContext, locale: string) => {
  const branches = await conversation.external(() => BranchService.listActive());
  const messageKey = branches.length > 0 ? 'branches_select_prompt' : 'branches_no_active';

  await ctx.reply(i18n.t(locale, messageKey), {
    reply_markup: getBranchesKeyboard(locale, branches.map((branch) => branch.name)),
  });

  return branches;
};

const sendBranch = async (
  ctx: BotContext,
  locale: string,
  branch: Awaited<ReturnType<typeof BranchService.listActive>>[number],
  distanceKm?: number,
) => {
  await ctx.reply(formatBranchDetails(branch, locale, { distanceKm }));

  const latitude = Number.parseFloat(branch.latitude || '');
  const longitude = Number.parseFloat(branch.longitude || '');

  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    await ctx.replyWithLocation(latitude, longitude);
  }
};

export async function branchesConversation(conversation: BotConversation, ctx: BotContext) {
  const locale = await getLocaleFromConversation(conversation);

  await showBranchesMenu(conversation, ctx, locale);

  while (true) {
    const currentCtx = await conversation.wait();
    const messageText = currentCtx.message?.text?.trim();

    if (messageText === '/start' || messageText === i18n.t(locale, 'back')) {
      await showMainMenu(conversation, currentCtx, locale);
      return;
    }

    const activeBranches = await conversation.external(() => BranchService.listActive());

    if (messageText === i18n.t(locale, 'branches_nearest')) {
      await currentCtx.reply(i18n.t(locale, 'branches_send_location_prompt'), {
        reply_markup: getBranchLocationRequestKeyboard(locale),
      });

      while (true) {
        const locationCtx = await conversation.wait();
        const locationText = locationCtx.message?.text?.trim();

        if (locationText === '/start') {
          await showMainMenu(conversation, locationCtx, locale);
          return;
        }

        if (locationText === i18n.t(locale, 'back')) {
          await showBranchesMenu(conversation, locationCtx, locale);
          break;
        }

        if (!locationCtx.message?.location) {
          await locationCtx.reply(i18n.t(locale, 'branches_location_required'), {
            reply_markup: getBranchLocationRequestKeyboard(locale),
          });
          continue;
        }

        const { latitude, longitude } = locationCtx.message.location;
        const nearestBranch = await conversation.external(() => BranchService.findNearest(latitude, longitude));

        if (!nearestBranch) {
          await locationCtx.reply(i18n.t(locale, 'branches_nearest_not_found'));
          await showBranchesMenu(conversation, locationCtx, locale);
          break;
        }

        const branchLatitude = Number.parseFloat(nearestBranch.latitude || '');
        const branchLongitude = Number.parseFloat(nearestBranch.longitude || '');
        const distanceKm =
          Number.isFinite(branchLatitude) && Number.isFinite(branchLongitude)
            ? calculateDistanceKm(latitude, longitude, branchLatitude, branchLongitude)
            : undefined;

        await sendBranch(locationCtx, locale, nearestBranch, distanceKm);
        await showBranchesMenu(conversation, locationCtx, locale);
        break;
      }

      continue;
    }

    if (messageText) {
      const branch = findBranchByNameCaseInsensitive(activeBranches, messageText);

      if (branch) {
        await sendBranch(currentCtx, locale, branch);
        await showBranchesMenu(conversation, currentCtx, locale);
        continue;
      }
    }

    await currentCtx.reply(i18n.t(locale, 'branches_invalid_selection'), {
      reply_markup: getBranchesKeyboard(locale, activeBranches.map((branch) => branch.name)),
    });
  }
}
