import type { User } from '../../services/user.service';
import { normalizeUzPhoneOrNull } from '../uz-phone.util';

export interface ApplicationPayload {
  clientName: string;
  clientPhone: string;
  jshshir: string;
  passportId: string;
  address: string;
}

export type ApplicationPayloadField = keyof ApplicationPayload;

type ApplicationUser = Pick<
  User,
  'first_name' | 'last_name' | 'phone_number' | 'jshshir' | 'passport_series' | 'address'
>;

export const normalizePassportId = (passportSeries?: string | null): string => {
  return (passportSeries || '').toUpperCase().replace(/\s+/g, '');
};

export const getApplicationClientName = (user: ApplicationUser): string => {
  return [user.first_name, user.last_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
};

export const buildApplicationPayload = (user: ApplicationUser): ApplicationPayload => {
  return {
    clientName: getApplicationClientName(user),
    clientPhone: normalizeUzPhoneOrNull(user.phone_number) || '',
    jshshir: user.jshshir?.trim() || '',
    passportId: normalizePassportId(user.passport_series),
    address: user.address?.trim() || '',
  };
};

export const getMissingApplicationPayloadFields = (
  payload: ApplicationPayload,
): ApplicationPayloadField[] => {
  const missing: ApplicationPayloadField[] = [];

  if (!payload.clientName) {
    missing.push('clientName');
  }

  if (!/^\+998\d{9}$/.test(payload.clientPhone)) {
    missing.push('clientPhone');
  }

  if (!/^\d{14}$/.test(payload.jshshir)) {
    missing.push('jshshir');
  }

  if (!/^[A-Z]{2}\d{7}$/.test(payload.passportId)) {
    missing.push('passportId');
  }

  if (!payload.address) {
    missing.push('address');
  }

  return missing;
};

export const isApplicationRegistrationComplete = (user: ApplicationUser): boolean => {
  return /^\+998\d{9}$/.test(buildApplicationPayload(user).clientPhone);
};
