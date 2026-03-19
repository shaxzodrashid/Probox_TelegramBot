import axios from 'axios';
import db from '../database/database';
import { config } from '../config';
import { logger } from '../utils/logger';
import {
  findNearestBranch,
  parseWorkTimeRange,
} from '../utils/branch.util';

export interface Branch {
  id: string;
  name: string;
  address: string;
  support_phone: string | null;
  is_active: boolean;
  longitude: string | null;
  latitude: string | null;
  work_start_time: string | null;
  work_end_time: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateBranchInput {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  workTime: string;
  supportPhone?: string | null;
}

export class BranchService {
  static async listAll(): Promise<Branch[]> {
    return db<Branch>('branches')
      .orderBy('is_active', 'desc')
      .orderBy('name', 'asc');
  }

  static async listActive(): Promise<Branch[]> {
    return db<Branch>('branches')
      .where('is_active', true)
      .whereNotNull('latitude')
      .whereNotNull('longitude')
      .orderBy('name', 'asc');
  }

  static async getById(id: string): Promise<Branch | null> {
    const branch = await db<Branch>('branches').where('id', id).first();
    return branch || null;
  }

  static async getByName(name: string): Promise<Branch | null> {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return null;
    }

    const branch = await db<Branch>('branches')
      .whereRaw('LOWER(name) = LOWER(?)', [trimmedName])
      .first();

    return branch || null;
  }

  static async create(input: CreateBranchInput): Promise<Branch> {
    const name = input.name.trim();
    const address = input.address.trim();

    if (!name) {
      throw new Error('BRANCH_NAME_REQUIRED');
    }

    if (!address) {
      throw new Error('BRANCH_ADDRESS_REQUIRED');
    }

    if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) {
      throw new Error('BRANCH_COORDINATES_REQUIRED');
    }

    const parsedWorkTime = parseWorkTimeRange(input.workTime);
    if (!parsedWorkTime) {
      throw new Error('BRANCH_INVALID_WORK_TIME');
    }

    const existingBranch = await this.getByName(name);
    if (existingBranch) {
      throw new Error('BRANCH_NAME_EXISTS');
    }

    const [branch] = await db<Branch>('branches')
      .insert({
        name,
        address,
        support_phone: input.supportPhone?.trim() || null,
        latitude: String(input.latitude),
        longitude: String(input.longitude),
        work_start_time: parsedWorkTime.startTime,
        work_end_time: parsedWorkTime.endTime,
      })
      .returning('*');

    return branch;
  }

  static async markInactive(id: string): Promise<boolean> {
    const updated = await db('branches')
      .where({ id, is_active: true })
      .update({
        is_active: false,
        updated_at: new Date(),
      });

    return updated > 0;
  }

  static async findNearest(latitude: number, longitude: number): Promise<Branch | null> {
    const branches = await this.listActive();
    return findNearestBranch(branches, latitude, longitude);
  }

  static async reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
    try {
      const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
        params: {
          lat: latitude,
          lon: longitude,
          format: 'json',
        },
        headers: {
          'User-Agent': config.BOT_USERNAME
            ? `${config.BOT_USERNAME} branch-lookup/1.0`
            : 'ProboxTelegramBot branch-lookup/1.0',
        },
        timeout: 10000,
      });

      const address = response.data?.display_name;
      return typeof address === 'string' && address.trim().length > 0 ? address.trim() : null;
    } catch (error) {
      logger.error('Error reverse geocoding branch location:', error);
      return null;
    }
  }
}
