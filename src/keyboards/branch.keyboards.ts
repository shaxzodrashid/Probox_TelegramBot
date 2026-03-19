import { InlineKeyboard, Keyboard } from 'grammy';
import { i18n } from '../i18n';
import { Branch } from '../services/branch.service';

export const ADMIN_BRANCH_DETAIL_CALLBACK_PREFIX = 'ab:';
export const ADMIN_BRANCH_DEACTIVATE_CONFIRM_CALLBACK_PREFIX = 'abdc:';
export const ADMIN_BRANCH_DEACTIVATE_CALLBACK_PREFIX = 'abd:';

export const getBranchesKeyboard = (locale: string, branchNames: string[]) => {
  const keyboard = new Keyboard();

  if (branchNames.length > 0) {
    keyboard.text(i18n.t(locale, 'branches_nearest')).success().row();

    branchNames.forEach((branchName) => {
      keyboard.text(branchName).row();
    });
  }

  keyboard.text(i18n.t(locale, 'back'));

  return keyboard.resized();
};

export const getBranchLocationRequestKeyboard = (locale: string) =>
  new Keyboard()
    .requestLocation(i18n.t(locale, 'branches_share_location'))
    .success()
    .row()
    .text(i18n.t(locale, 'back'))
    .resized()
    .oneTime();

export const getAdminBranchPhoneKeyboard = (locale: string) =>
  new InlineKeyboard()
    .text(i18n.t(locale, 'admin_branch_skip_phone'), 'admin_branch_skip_phone');

export const getAdminBranchesKeyboard = (branches: Branch[], locale: string) => {
  const keyboard = new InlineKeyboard();

  branches.forEach((branch) => {
    const icon = branch.is_active ? '🟢' : '⚫';
    keyboard.text(`${icon} ${branch.name}`, `${ADMIN_BRANCH_DETAIL_CALLBACK_PREFIX}${branch.id}`).row();
  });

  keyboard.text(i18n.t(locale, 'admin_branch_add'), 'admin_branch_add').row();
  keyboard.text(i18n.t(locale, 'back'), 'admin_back_to_menu');

  return keyboard;
};

export const getAdminBranchDetailKeyboard = (
  branchId: string,
  isActive: boolean,
  locale: string,
) => {
  const keyboard = new InlineKeyboard();

  if (isActive) {
    keyboard
      .text(i18n.t(locale, 'admin_branch_deactivate'), `${ADMIN_BRANCH_DEACTIVATE_CONFIRM_CALLBACK_PREFIX}${branchId}`)
      .row();
  }

  keyboard.text(i18n.t(locale, 'admin_branch_back_to_list'), 'admin_branches_back');

  return keyboard;
};

export const getAdminBranchDeactivateConfirmKeyboard = (branchId: string, locale: string) =>
  new InlineKeyboard()
    .text(i18n.t(locale, 'admin_confirm_yes'), `${ADMIN_BRANCH_DEACTIVATE_CALLBACK_PREFIX}${branchId}`)
    .text(i18n.t(locale, 'admin_confirm_no'), `${ADMIN_BRANCH_DETAIL_CALLBACK_PREFIX}${branchId}`);
