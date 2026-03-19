import { i18n } from '../i18n';
import { formatUzPhone } from './uz-phone.util';

export interface BranchLike {
  id?: string;
  name: string;
  address?: string | null;
  support_phone?: string | null;
  is_active?: boolean;
  latitude?: string | number | null;
  longitude?: string | number | null;
  work_start_time?: string | null;
  work_end_time?: string | null;
}

export interface ParsedWorkTimeRange {
  startTime: string;
  endTime: string;
}

const WORK_TIME_RANGE_REGEX = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/;

export const normalizeBranchName = (name: string): string =>
  name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');

export const parseWorkTimeRange = (value: string): ParsedWorkTimeRange | null => {
  const normalized = value.trim();
  const match = normalized.match(WORK_TIME_RANGE_REGEX);

  if (!match) {
    return null;
  }

  return {
    startTime: `${match[1]}:${match[2]}`,
    endTime: `${match[3]}:${match[4]}`,
  };
};

export const formatWorkTimeRange = (branch: Pick<BranchLike, 'work_start_time' | 'work_end_time'>): string =>
  `${branch.work_start_time || '--:--'}-${branch.work_end_time || '--:--'}`;

export const findBranchByNameCaseInsensitive = <T extends BranchLike>(
  branches: T[],
  name: string,
): T | undefined => {
  const normalized = normalizeBranchName(name);
  return branches.find((branch) => normalizeBranchName(branch.name) === normalized);
};

const toCoordinate = (value: string | number | null | undefined): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const calculateDistanceKm = (
  startLatitude: number,
  startLongitude: number,
  endLatitude: number,
  endLongitude: number,
): number => {
  const earthRadiusKm = 6371;
  const toRadians = (value: number) => (value * Math.PI) / 180;

  const deltaLat = toRadians(endLatitude - startLatitude);
  const deltaLon = toRadians(endLongitude - startLongitude);
  const lat1 = toRadians(startLatitude);
  const lat2 = toRadians(endLatitude);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2) * Math.cos(lat1) * Math.cos(lat2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

export const findNearestBranch = <T extends BranchLike>(
  branches: T[],
  latitude: number,
  longitude: number,
): T | null => {
  let nearest: T | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const branch of branches) {
    if (branch.is_active === false) {
      continue;
    }

    const branchLatitude = toCoordinate(branch.latitude);
    const branchLongitude = toCoordinate(branch.longitude);

    if (branchLatitude === null || branchLongitude === null) {
      continue;
    }

    const distance = calculateDistanceKm(latitude, longitude, branchLatitude, branchLongitude);
    if (distance < nearestDistance) {
      nearest = branch;
      nearestDistance = distance;
    }
  }

  return nearest;
};

export const formatBranchDetails = (
  branch: BranchLike,
  locale: string,
  options?: {
    includeStatus?: boolean;
    distanceKm?: number;
  },
): string => {
  const lines = [
    `${i18n.t(locale, 'branch_name_label')}: ${branch.name}`,
    `${i18n.t(locale, 'branch_address_label')}: ${branch.address || '—'}`,
    `${i18n.t(locale, 'branch_work_time_label')}: ${formatWorkTimeRange(branch)}`,
  ];

  if (branch.support_phone) {
    lines.push(`${i18n.t(locale, 'branch_phone_label')}: ${formatUzPhone(branch.support_phone)}`);
  }

  if (options?.includeStatus) {
    const statusKey = branch.is_active ? 'admin_branch_status_active' : 'admin_branch_status_inactive';
    lines.push(`${i18n.t(locale, 'admin_branch_status_label')}: ${i18n.t(locale, statusKey)}`);
  }

  if (options?.distanceKm !== undefined) {
    lines.push(
      `${i18n.t(locale, 'branches_distance_label')}: ${options.distanceKm.toFixed(2)} ${i18n.t(locale, 'branches_distance_unit')}`,
    );
  }

  return lines.join('\n');
};
