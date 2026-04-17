import { i18n } from '../../i18n';
import { BotContext } from '../../types/context';
import { UserService } from '../../services/user.service';
import { getMainKeyboardByLocale } from '../../keyboards';
import { getAdminMenuKeyboard } from '../../keyboards/admin.keyboards';
import {
  contractsHandler,
  backFromContractsToMenuHandler,
} from '../../handlers/contracts.handler';
import {
  paymentsHandler,
  backFromPaymentsToMenuHandler,
} from '../../handlers/payments.handler';
import { branchesHandler } from '../../handlers/branches.handler';
import {
  settingsHandler,
  changeNameHandler,
  changePhoneHandler,
  changeLanguageHandler,
  addPassportHandler,
} from '../../handlers/settings.handler';
import { supportHandler } from '../../handlers/support.handler';
import {
  adminMenuHandler,
  adminUsersHandler,
  adminBranchesHandler,
  adminBroadcastHandler,
  adminStatsHandler,
  adminExportHandler,
  adminBackToMainMenuHandler,
  adminCampaignPromotionsHandler,
  adminCampaignPrizesHandler,
  adminCampaignTemplatesHandler,
  adminCampaignCouponSearchHandler,
  adminCampaignCouponExportHandler,
  adminFaqSectionHandler,
} from '../../handlers/admin.handler';
import {
  promotionsHandler,
  couponsHandler,
} from '../../handlers/campaign.handler';
import { applicationHandler } from '../../handlers/application.handler';

const SUPPORTED_LOCALES = ['uz', 'ru'] as const;

export type UiTextScope = 'global' | 'context';

export type UiActionId =
  | 'show_main_menu'
  | 'back'
  | 'menu_contracts'
  | 'menu_payments'
  | 'menu_branches'
  | 'menu_settings'
  | 'menu_support'
  | 'menu_application'
  | 'menu_promotions'
  | 'menu_coupons'
  | 'application_start_passport_button'
  | 'settings_change_name'
  | 'settings_change_phone'
  | 'settings_change_language'
  | 'settings_add_passport'
  | 'admin_menu'
  | 'admin_users'
  | 'admin_branches'
  | 'admin_broadcast'
  | 'admin_stats'
  | 'admin_campaign_promotions'
  | 'admin_campaign_prizes'
  | 'admin_campaign_templates'
  | 'admin_campaign_coupon_search'
  | 'admin_campaign_coupon_export'
  | 'admin_faqs'
  | 'admin_export'
  | 'back_to_user_menu'
  | 'cancel_to_menu'
  | 'resend_otp'
  | 'share_phone'
  | 'branches_nearest'
  | 'branches_share_location'
  | 'passport_method_photo'
  | 'passport_method_manual'
  | 'passport_edit_series'
  | 'passport_edit_jshshir'
  | 'passport_confirm';

export interface UiTextResolution {
  action: UiActionId;
  scope: UiTextScope;
  legacyAlias?: boolean;
}

interface UiTextRegistryEntry {
  action: UiActionId;
  scope: UiTextScope;
  key: string;
}

interface UiTextAliasEntry {
  action: UiActionId;
  scope: UiTextScope;
  text: string;
  legacyAlias?: boolean;
}

const TRANSLATION_ENTRIES: UiTextRegistryEntry[] = [
  { action: 'menu_contracts', scope: 'global', key: 'menu_contracts' },
  { action: 'menu_payments', scope: 'global', key: 'menu_payments' },
  { action: 'menu_branches', scope: 'global', key: 'menu_branches' },
  { action: 'menu_settings', scope: 'global', key: 'menu_settings' },
  { action: 'menu_support', scope: 'global', key: 'menu_support' },
  { action: 'menu_application', scope: 'global', key: 'menu_application' },
  { action: 'menu_promotions', scope: 'global', key: 'menu_promotions' },
  { action: 'menu_coupons', scope: 'global', key: 'menu_coupons' },
  {
    action: 'application_start_passport_button',
    scope: 'global',
    key: 'application_start_passport_button',
  },
  { action: 'settings_change_name', scope: 'global', key: 'settings_change_name' },
  { action: 'settings_change_phone', scope: 'global', key: 'settings_change_phone' },
  {
    action: 'settings_change_language',
    scope: 'global',
    key: 'settings_change_language',
  },
  { action: 'settings_add_passport', scope: 'global', key: 'settings_add_passport' },
  { action: 'admin_menu', scope: 'global', key: 'admin_menu' },
  { action: 'admin_users', scope: 'global', key: 'admin_users' },
  { action: 'admin_branches', scope: 'global', key: 'admin_branches' },
  { action: 'admin_broadcast', scope: 'global', key: 'admin_broadcast' },
  { action: 'admin_stats', scope: 'global', key: 'admin_stats' },
  {
    action: 'admin_campaign_promotions',
    scope: 'global',
    key: 'admin_campaign_promotions',
  },
  {
    action: 'admin_campaign_prizes',
    scope: 'global',
    key: 'admin_campaign_prizes',
  },
  {
    action: 'admin_campaign_templates',
    scope: 'global',
    key: 'admin_campaign_templates',
  },
  {
    action: 'admin_campaign_coupon_search',
    scope: 'global',
    key: 'admin_campaign_coupon_search',
  },
  {
    action: 'admin_campaign_coupon_export',
    scope: 'global',
    key: 'admin_campaign_coupon_export',
  },
  { action: 'admin_faqs', scope: 'global', key: 'admin_faqs' },
  { action: 'admin_export', scope: 'global', key: 'admin_export' },
  { action: 'back_to_user_menu', scope: 'global', key: 'back_to_user_menu' },
  { action: 'back', scope: 'global', key: 'back' },
  { action: 'show_main_menu', scope: 'global', key: 'payments_main_menu' },
  { action: 'show_main_menu', scope: 'global', key: 'contracts_back_to_menu' },
  { action: 'cancel_to_menu', scope: 'context', key: 'support_cancel' },
  { action: 'cancel_to_menu', scope: 'context', key: 'admin_cancel' },
  { action: 'cancel_to_menu', scope: 'context', key: 'admin_reply_cancel' },
  { action: 'resend_otp', scope: 'context', key: 'resend_otp_button' },
  { action: 'share_phone', scope: 'context', key: 'share_phone_button' },
  { action: 'branches_nearest', scope: 'context', key: 'branches_nearest' },
  {
    action: 'branches_share_location',
    scope: 'context',
    key: 'branches_share_location',
  },
  {
    action: 'passport_method_photo',
    scope: 'context',
    key: 'settings_passport_method_photo',
  },
  {
    action: 'passport_method_manual',
    scope: 'context',
    key: 'settings_passport_method_manual',
  },
  {
    action: 'passport_edit_series',
    scope: 'context',
    key: 'settings_passport_edit_series',
  },
  {
    action: 'passport_edit_jshshir',
    scope: 'context',
    key: 'settings_passport_edit_jshshir',
  },
  {
    action: 'passport_confirm',
    scope: 'context',
    key: 'settings_passport_confirm_btn',
  },
];

const LEGACY_ALIASES: UiTextAliasEntry[] = [
  { action: 'show_main_menu', scope: 'global', text: '📲 Главное меню', legacyAlias: true },
  { action: 'show_main_menu', scope: 'global', text: 'Главное меню', legacyAlias: true },
  { action: 'show_main_menu', scope: 'global', text: '📲 Bosh menyu', legacyAlias: true },
  { action: 'show_main_menu', scope: 'global', text: 'Bosh menyu', legacyAlias: true },
];

export function normalizeUiText(text: string): string {
  return text.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

function buildUiTextRegistry(): Map<string, UiTextResolution> {
  const registry = new Map<string, UiTextResolution>();

  for (const entry of TRANSLATION_ENTRIES) {
    for (const locale of SUPPORTED_LOCALES) {
      const translated = i18n.t(locale, entry.key);
      const normalized = normalizeUiText(translated);
      if (!normalized || registry.has(normalized)) continue;
      registry.set(normalized, { action: entry.action, scope: entry.scope });
    }
  }

  for (const alias of LEGACY_ALIASES) {
    const normalized = normalizeUiText(alias.text);
    if (!normalized || registry.has(normalized)) continue;
    registry.set(normalized, {
      action: alias.action,
      scope: alias.scope,
      legacyAlias: alias.legacyAlias,
    });
  }

  return registry;
}

const UI_TEXT_REGISTRY = buildUiTextRegistry();

export function resolveUiTextAction(text?: string | null): UiTextResolution | null {
  if (!text) return null;
  const normalized = normalizeUiText(text);
  const resolution = UI_TEXT_REGISTRY.get(normalized);
  return resolution ? { ...resolution } : null;
}

export async function showSafeMenuFallback(ctx: BotContext): Promise<void> {
  const locale = (await ctx.i18n.getLocale()) || ctx.session?.__language_code || 'uz';
  const telegramId = ctx.from?.id;
  const user = telegramId ? await UserService.getUserByTelegramId(telegramId) : null;
  const isLoggedIn = Boolean(user && !user.is_logged_out);

  if (user?.is_admin && isLoggedIn) {
    await ctx.reply(i18n.t(locale, 'admin_menu_header'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
    return;
  }

  await ctx.reply(i18n.t(locale, 'welcome_message'), {
    reply_markup: getMainKeyboardByLocale(locale, false, isLoggedIn),
  });
}

export async function routeUiTextAction(
  ctx: BotContext,
  resolution: UiTextResolution,
): Promise<void> {
  switch (resolution.action) {
    case 'show_main_menu':
      await showSafeMenuFallback(ctx);
      return;
    case 'back':
      if (ctx.session.payments?.length) {
        await backFromPaymentsToMenuHandler(ctx);
      } else {
        await backFromContractsToMenuHandler(ctx);
      }
      return;
    case 'menu_contracts':
      await contractsHandler(ctx);
      return;
    case 'menu_payments':
      await paymentsHandler(ctx);
      return;
    case 'menu_branches':
      await branchesHandler(ctx);
      return;
    case 'menu_settings':
      await settingsHandler(ctx);
      return;
    case 'menu_support':
      await supportHandler(ctx);
      return;
    case 'menu_application':
      await applicationHandler(ctx);
      return;
    case 'menu_promotions':
      await promotionsHandler(ctx);
      return;
    case 'menu_coupons':
      await couponsHandler(ctx);
      return;
    case 'application_start_passport_button':
    case 'settings_add_passport':
      await addPassportHandler(ctx);
      return;
    case 'settings_change_name':
      await changeNameHandler(ctx);
      return;
    case 'settings_change_phone':
      await changePhoneHandler(ctx);
      return;
    case 'settings_change_language':
      await changeLanguageHandler(ctx);
      return;
    case 'admin_menu':
      await adminMenuHandler(ctx);
      return;
    case 'admin_users':
      await adminUsersHandler(ctx);
      return;
    case 'admin_branches':
      await adminBranchesHandler(ctx);
      return;
    case 'admin_broadcast':
      await adminBroadcastHandler(ctx);
      return;
    case 'admin_stats':
      await adminStatsHandler(ctx);
      return;
    case 'admin_campaign_promotions':
      await adminCampaignPromotionsHandler(ctx);
      return;
    case 'admin_campaign_prizes':
      await adminCampaignPrizesHandler(ctx);
      return;
    case 'admin_campaign_templates':
      await adminCampaignTemplatesHandler(ctx);
      return;
    case 'admin_campaign_coupon_search':
      await adminCampaignCouponSearchHandler(ctx);
      return;
    case 'admin_campaign_coupon_export':
      await adminCampaignCouponExportHandler(ctx);
      return;
    case 'admin_faqs':
      await adminFaqSectionHandler(ctx);
      return;
    case 'admin_export':
      await adminExportHandler(ctx);
      return;
    case 'back_to_user_menu':
      await adminBackToMainMenuHandler(ctx);
      return;
    case 'cancel_to_menu':
    case 'resend_otp':
    case 'share_phone':
    case 'branches_nearest':
    case 'branches_share_location':
    case 'passport_method_photo':
    case 'passport_method_manual':
    case 'passport_edit_series':
    case 'passport_edit_jshshir':
    case 'passport_confirm':
      await showSafeMenuFallback(ctx);
      return;
    default: {
      const exhaustiveCheck: never = resolution.action;
      return exhaustiveCheck;
    }
  }
}
