import path from 'path';
import db from '../../database/database';
import { minioService } from '../minio.service';

export interface Promotion {
  id: number;
  slug: string;
  title_uz: string;
  title_ru: string;
  about_uz: string;
  about_ru: string;
  cover_image_object_key?: string | null;
  cover_image_mime_type?: string | null;
  cover_image_file_name?: string | null;
  is_active: boolean;
  assign_coupons: boolean;
  starts_at?: Date | null;
  ends_at?: Date | null;
  deleted_at?: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface PromotionPrize {
  id: number;
  promotion_id: number;
  title: string;
  description?: string | null;
  image_object_key?: string | null;
  image_mime_type?: string | null;
  image_file_name?: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PromotionListResult {
  data: Promotion[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PromotionPrizeListItem extends PromotionPrize {
  promotion_title_uz?: string | null;
  promotion_title_ru?: string | null;
  promotion_slug?: string | null;
}

export interface PromotionPrizeListResult {
  data: PromotionPrizeListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreatePrizeInput {
  promotion_id: number;
  title: string;
  description?: string | null;
  is_active: boolean;
}

export interface UpdatePrizeInput {
  promotion_id?: number;
  title?: string;
  description?: string | null;
  is_active?: boolean;
}

export interface CreatePromotionInput {
  slug: string;
  title_uz: string;
  title_ru: string;
  about_uz: string;
  about_ru: string;
  is_active: boolean;
  assign_coupons: boolean;
  starts_at?: Date | null;
  ends_at?: Date | null;
}

export interface UpdatePromotionInput {
  slug?: string;
  title_uz?: string;
  title_ru?: string;
  about_uz?: string;
  about_ru?: string;
  is_active?: boolean;
  assign_coupons?: boolean;
  starts_at?: Date | null;
  ends_at?: Date | null;
}

export interface PromotionImageInput {
  buffer: Buffer;
  fileName?: string | null;
  mimeType?: string | null;
}

export class PromotionService {
  private static baseQuery() {
    return db<Promotion>('promotions').whereNull('deleted_at');
  }

  private static prizeBaseQuery() {
    return db('promotion_prizes as pp')
      .leftJoin('promotions as p', 'p.id', 'pp.promotion_id')
      .whereNull('p.deleted_at');
  }

  private static normalizePromotionInput<T extends CreatePromotionInput | UpdatePromotionInput>(input: T): T {
    const normalized = { ...input };

    if (typeof normalized.slug === 'string') {
      normalized.slug = normalized.slug.trim().toLowerCase();
    }

    if (typeof normalized.title_uz === 'string') {
      normalized.title_uz = normalized.title_uz.trim();
    }

    if (typeof normalized.title_ru === 'string') {
      normalized.title_ru = normalized.title_ru.trim();
    }

    if (typeof normalized.about_uz === 'string') {
      normalized.about_uz = normalized.about_uz.trim();
    }

    if (typeof normalized.about_ru === 'string') {
      normalized.about_ru = normalized.about_ru.trim();
    }

    return normalized as T;
  }

  private static assertDateRange(startsAt?: Date | null, endsAt?: Date | null): void {
    if (startsAt && endsAt && startsAt > endsAt) {
      throw new Error('PROMOTION_INVALID_DATE_RANGE');
    }
  }

  private static buildImageObjectKey(promotionId: number, fileName?: string | null): string {
    const extension = (fileName ? path.extname(fileName) : '') || '.jpg';
    return `promotions/${promotionId}/cover/cover-${Date.now()}${extension}`;
  }

  private static buildPrizeImageObjectKey(prizeId: number, fileName?: string | null): string {
    const extension = (fileName ? path.extname(fileName) : '') || '.jpg';
    return `promotion-prizes/${prizeId}/image/image-${Date.now()}${extension}`;
  }

  private static normalizePrizeInput<T extends CreatePrizeInput | UpdatePrizeInput>(input: T): T {
    const normalized = { ...input };

    if (typeof normalized.title === 'string') {
      normalized.title = normalized.title.trim();
    }

    if (typeof normalized.description === 'string') {
      normalized.description = normalized.description.trim();
    }

    return normalized as T;
  }

  static async getActivePromotions(now: Date = new Date()): Promise<Promotion[]> {
    return this.baseQuery()
      .where('is_active', true)
      .andWhere((query) => {
        query.whereNull('starts_at').orWhere('starts_at', '<=', now);
      })
      .andWhere((query) => {
        query.whereNull('ends_at').orWhere('ends_at', '>=', now);
      })
      .orderBy([{ column: 'starts_at', order: 'asc' }, { column: 'created_at', order: 'desc' }]);
  }

  static async getPromotionById(id: number): Promise<Promotion | null> {
    const promotion = await this.baseQuery().where('id', id).first();
    return promotion || null;
  }

  static async getPromotionForAdmin(id: number): Promise<Promotion | null> {
    const promotion = await this.baseQuery().where('id', id).first();
    return promotion || null;
  }

  static async getPromotionBySlug(slug: string): Promise<Promotion | null> {
    const promotion = await this.baseQuery().where('slug', slug).first();
    return promotion || null;
  }

  static async getCurrentPromotion(now: Date = new Date()): Promise<Promotion | null> {
    const couponAssigned = await this.baseQuery()
      .where('assign_coupons', true)
      .where('is_active', true)
      .andWhere((query) => {
        query.whereNull('starts_at').orWhere('starts_at', '<=', now);
      })
      .andWhere((query) => {
        query.whereNull('ends_at').orWhere('ends_at', '>=', now);
      })
      .first();

    if (couponAssigned) {
      return couponAssigned;
    }

    const [promotion] = await this.getActivePromotions(now);
    return promotion || null;
  }

  static async listPromotions(): Promise<Promotion[]> {
    return this.baseQuery()
      .orderBy([{ column: 'is_active', order: 'desc' }, { column: 'created_at', order: 'desc' }]);
  }

  static async listPromotionsPage(page: number = 1, limit: number = 6): Promise<PromotionListResult> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, limit);
    const countRows = await this.baseQuery().clone().count('id as count') as Array<{ count: string | number }>;
    const total = Number(countRows[0]?.count || 0);
    const totalPages = Math.max(1, Math.ceil(total / safeLimit));
    const currentPage = Math.min(safePage, totalPages);
    const offset = (currentPage - 1) * safeLimit;

    const data = await this.baseQuery()
      .clone()
      .orderBy([{ column: 'is_active', order: 'desc' }, { column: 'created_at', order: 'desc' }])
      .limit(safeLimit)
      .offset(offset);

    return {
      data,
      total,
      page: currentPage,
      limit: safeLimit,
      totalPages,
    };
  }

  static async createPromotion(input: CreatePromotionInput): Promise<Promotion> {
    const normalized = this.normalizePromotionInput(input);
    this.assertDateRange(normalized.starts_at, normalized.ends_at);

    return db.transaction(async (trx) => {
      if (normalized.assign_coupons) {
        await trx<Promotion>('promotions')
          .whereNull('deleted_at')
          .update({
            assign_coupons: false,
            updated_at: new Date(),
          });
      }

      const [promotion] = await trx<Promotion>('promotions')
        .insert({
          ...normalized,
          updated_at: new Date(),
        })
        .returning('*');

      return promotion;
    });
  }

  static async updatePromotion(id: number, input: UpdatePromotionInput): Promise<Promotion | null> {
    const promotion = await this.getPromotionForAdmin(id);
    if (!promotion) {
      return null;
    }

    const normalized = this.normalizePromotionInput(input);
    this.assertDateRange(
      normalized.starts_at === undefined ? promotion.starts_at : normalized.starts_at,
      normalized.ends_at === undefined ? promotion.ends_at : normalized.ends_at,
    );

    return db.transaction(async (trx) => {
      if (normalized.assign_coupons === true) {
        await trx<Promotion>('promotions')
          .whereNot('id', id)
          .whereNull('deleted_at')
          .update({
            assign_coupons: false,
            updated_at: new Date(),
          });
      }

      const [updated] = await trx<Promotion>('promotions')
        .where({ id })
        .whereNull('deleted_at')
        .update({
          ...normalized,
          updated_at: new Date(),
        })
        .returning('*');

      return updated || null;
    });
  }

  static async setPromotionActiveState(id: number, isActive: boolean): Promise<Promotion | null> {
    const [updated] = await db<Promotion>('promotions')
      .where({ id })
      .whereNull('deleted_at')
      .update({
        is_active: isActive,
        updated_at: new Date(),
      })
      .returning('*');

    return updated || null;
  }

  static async setPromotionAssignCouponsState(id: number, assignCoupons: boolean): Promise<Promotion | null> {
    return db.transaction(async (trx) => {
      if (assignCoupons) {
        await trx<Promotion>('promotions')
          .whereNot('id', id)
          .whereNull('deleted_at')
          .update({
            assign_coupons: false,
            updated_at: new Date(),
          });
      }

      const [updated] = await trx<Promotion>('promotions')
        .where({ id })
        .whereNull('deleted_at')
        .update({
          assign_coupons: assignCoupons,
          updated_at: new Date(),
        })
        .returning('*');

      return updated || null;
    });
  }

  static async archivePromotion(id: number): Promise<boolean> {
    const updated = await db<Promotion>('promotions')
      .where({ id })
      .whereNull('deleted_at')
      .update({
        is_active: false,
        deleted_at: new Date(),
        updated_at: new Date(),
      });

    return updated > 0;
  }

  static async replacePromotionImage(id: number, input: PromotionImageInput): Promise<Promotion | null> {
    const promotion = await this.getPromotionForAdmin(id);
    if (!promotion) {
      return null;
    }

    const objectKey = this.buildImageObjectKey(id, input.fileName);
    await minioService.uploadFile(objectKey, input.buffer, {
      'Content-Type': input.mimeType || 'image/jpeg',
    });

    if (promotion.cover_image_object_key) {
      await minioService.deleteFile(promotion.cover_image_object_key).catch(() => undefined);
    }

    const [updated] = await db<Promotion>('promotions')
      .where({ id })
      .update({
        cover_image_object_key: objectKey,
        cover_image_mime_type: input.mimeType || 'image/jpeg',
        cover_image_file_name: input.fileName || path.basename(objectKey),
        updated_at: new Date(),
      })
      .returning('*');

    return updated || null;
  }

  static async removePromotionImage(id: number): Promise<Promotion | null> {
    const promotion = await this.getPromotionForAdmin(id);
    if (!promotion) {
      return null;
    }

    if (promotion.cover_image_object_key) {
      await minioService.deleteFile(promotion.cover_image_object_key).catch(() => undefined);
    }

    const [updated] = await db<Promotion>('promotions')
      .where({ id })
      .update({
        cover_image_object_key: null,
        cover_image_mime_type: null,
        cover_image_file_name: null,
        updated_at: new Date(),
      })
      .returning('*');

    return updated || null;
  }

  static async replacePrizeImage(id: number, input: PromotionImageInput): Promise<PromotionPrize | null> {
    const prize = await db<PromotionPrize>('promotion_prizes').where({ id }).first();
    if (!prize) {
      return null;
    }

    const objectKey = this.buildPrizeImageObjectKey(id, input.fileName);
    await minioService.uploadFile(objectKey, input.buffer, {
      'Content-Type': input.mimeType || 'image/jpeg',
    });

    if (prize.image_object_key) {
      await minioService.deleteFile(prize.image_object_key).catch(() => undefined);
    }

    const [updated] = await db<PromotionPrize>('promotion_prizes')
      .where({ id })
      .update({
        image_object_key: objectKey,
        image_mime_type: input.mimeType || 'image/jpeg',
        image_file_name: input.fileName || path.basename(objectKey),
        updated_at: new Date(),
      })
      .returning('*');

    return updated || null;
  }

  static async removePrizeImage(id: number): Promise<PromotionPrize | null> {
    const prize = await db<PromotionPrize>('promotion_prizes').where({ id }).first();
    if (!prize) {
      return null;
    }

    if (prize.image_object_key) {
      await minioService.deleteFile(prize.image_object_key).catch(() => undefined);
    }

    const [updated] = await db<PromotionPrize>('promotion_prizes')
      .where({ id })
      .update({
        image_object_key: null,
        image_mime_type: null,
        image_file_name: null,
        updated_at: new Date(),
      })
      .returning('*');

    return updated || null;
  }

  static async listPrizes(promotionId?: number): Promise<PromotionPrize[]> {
    const query = db<PromotionPrize>('promotion_prizes');
    if (promotionId) {
      query.where('promotion_id', promotionId);
    }
    return query.orderBy('created_at', 'desc');
  }

  static async listPrizesPage(page: number = 1, limit: number = 6): Promise<PromotionPrizeListResult> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, limit);
    const countRows = await db('promotion_prizes as pp')
      .join('promotions as p', 'p.id', 'pp.promotion_id')
      .whereNull('p.deleted_at')
      .count('pp.id as count') as Array<{ count: string | number }>;
    const total = Number(countRows[0]?.count || 0);
    const totalPages = Math.max(1, Math.ceil(total / safeLimit));
    const currentPage = Math.min(safePage, totalPages);
    const offset = (currentPage - 1) * safeLimit;

    const data = await this.prizeBaseQuery()
      .clone()
      .select(
        'pp.*',
        'p.title_uz as promotion_title_uz',
        'p.title_ru as promotion_title_ru',
        'p.slug as promotion_slug',
      )
      .orderBy([{ column: 'pp.is_active', order: 'desc' }, { column: 'pp.created_at', order: 'desc' }])
      .limit(safeLimit)
      .offset(offset);

    return {
      data,
      total,
      page: currentPage,
      limit: safeLimit,
      totalPages,
    };
  }

  static async getPrizeById(id: number): Promise<PromotionPrizeListItem | null> {
    const prize = await this.prizeBaseQuery()
      .clone()
      .select(
        'pp.*',
        'p.title_uz as promotion_title_uz',
        'p.title_ru as promotion_title_ru',
        'p.slug as promotion_slug',
      )
      .where('pp.id', id)
      .first();

    return prize || null;
  }

  static async createPrize(input: CreatePrizeInput): Promise<PromotionPrize> {
    const normalized = this.normalizePrizeInput(input);

    const [prize] = await db<PromotionPrize>('promotion_prizes')
      .insert({
        ...normalized,
        updated_at: new Date(),
      })
      .returning('*');

    return prize;
  }

  static async updatePrize(id: number, input: UpdatePrizeInput): Promise<PromotionPrize | null> {
    const prize = await db<PromotionPrize>('promotion_prizes').where({ id }).first();
    if (!prize) {
      return null;
    }

    const normalized = this.normalizePrizeInput(input);

    const [updated] = await db<PromotionPrize>('promotion_prizes')
      .where({ id })
      .update({
        ...normalized,
        updated_at: new Date(),
      })
      .returning('*');

    return updated || null;
  }

  static async setPrizeActiveState(id: number, isActive: boolean): Promise<PromotionPrize | null> {
    const [updated] = await db<PromotionPrize>('promotion_prizes')
      .where({ id })
      .update({
        is_active: isActive,
        updated_at: new Date(),
      })
      .returning('*');

    return updated || null;
  }

  static async deletePrize(id: number): Promise<boolean> {
    const deleted = await db<PromotionPrize>('promotion_prizes')
      .where({ id })
      .del();

    return deleted > 0;
  }

  static async listActivePrizesForPromotion(promotionId: number): Promise<PromotionPrize[]> {
    return db<PromotionPrize>('promotion_prizes')
      .where({ promotion_id: promotionId, is_active: true })
      .orderBy([{ column: 'created_at', order: 'asc' }, { column: 'id', order: 'asc' }]);
  }

  static async getActivePrizeForPromotion(promotionId: number): Promise<PromotionPrize | null> {
    const prize = await db<PromotionPrize>('promotion_prizes')
      .where({ promotion_id: promotionId, is_active: true })
      .orderBy('created_at', 'asc')
      .first();
    return prize || null;
  }
}
