const normalizeSupportIntentText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const HUMAN_TARGET_REGEX =
  /\b(admin\w*|operator\w*|odam\w*|inson\w*|xodim\w*|manager\w*|menedjer\w*|human|support|админ\w*|оператор\w*|менеджер\w*|сотрудник\w*)\b/i;

const HANDOFF_ACTION_REGEX =
  /\b(etib|yetkaz\w*|ayt\w*|yo['’`]?naltir\w*|jonat\w*|jo['’`]?nat\w*|ulab|ula\w*|bog['’`]?la\w*|connect\w*|forward\w*|handoff\w*|escalat\w*|переда\w*|соедин\w*|свяж\w*|направ\w*)\b/i;

const DIRECT_HUMAN_REQUEST_REGEX =
  /\b(operator|odam|inson|xodim|human|manager|menedjer|оператор|менеджер|сотрудник)\w*\s+(kerak|bilan|chaqir\w*|ulab|нуж\w*|свяж\w*)\b/i;

export const isHumanHandoffRequest = (message: string): boolean => {
  const normalized = normalizeSupportIntentText(message);

  if (!normalized) {
    return false;
  }

  if (DIRECT_HUMAN_REQUEST_REGEX.test(normalized)) {
    return true;
  }

  return HUMAN_TARGET_REGEX.test(normalized) && HANDOFF_ACTION_REGEX.test(normalized);
};
