import type { Knex } from 'knex';
import db from '../database/database';
import { isHappyHourInTashkent } from '../utils/tashkent-time.util';

export type CouponSourceType = 'store_visit' | 'purchase' | 'referral' | 'payment_on_time';
export type CouponStatus = 'active' | 'won' | 'expired';

export interface Coupon {
  id: number;
  code: string;
  promotion_id?: number | null;
  source_type: CouponSourceType;
  status: CouponStatus;
  issued_phone_snapshot: string;
  expires_at: Date;
  won_at?: Date | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ActiveCouponRow extends Coupon {
  user_id: number;
  first_name?: string | null;
  last_name?: string | null;
  phone_number?: string | null;
  promotion_title_uz?: string | null;
  promotion_title_ru?: string | null;
}

interface CouponPromotionSchemaState {
  hasCouponsPromotionId: boolean;
  hasPromotionsTable: boolean;
}

export class CouponService {
  private static couponPromotionSchemaStatePromise: Promise<CouponPromotionSchemaState> | null = null;
  private static readonly COUPON_PREFIX = 'PRO';
  private static readonly COUPON_TOTAL_LENGTH = 7;
  private static readonly COUPON_SUFFIX_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  static getCouponCountForEvent(date: Date = new Date()): number {
    return isHappyHourInTashkent(date) ? 2 : 1;
  }

  static calculateExpiry(date: Date = new Date()): Date {
    const expiresAt = new Date(date);
    expiresAt.setDate(expiresAt.getDate() + 30);
    return expiresAt;
  }

  static async generateUniqueCode(): Promise<string> {
    for (let i = 0; i < 20; i += 1) {
      const suffixLength = this.COUPON_TOTAL_LENGTH - this.COUPON_PREFIX.length;
      let suffix = '';

      for (let j = 0; j < suffixLength; j += 1) {
        const randomIndex = Math.floor(Math.random() * this.COUPON_SUFFIX_ALPHABET.length);
        suffix += this.COUPON_SUFFIX_ALPHABET[randomIndex];
      }

      const code = `${this.COUPON_PREFIX}${suffix}`;
      const existing = await db<Coupon>('coupons').where('code', code).first();
      if (!existing) {
        return code;
      }
    }

    throw new Error('Failed to generate a unique 7-character coupon code.');
  }

  static async createCouponsForUser(params: {
    userId: number;
    promotionId?: number | null;
    sourceType: CouponSourceType;
    phoneSnapshot: string;
    issuedAt?: Date;
  }): Promise<Coupon[]> {
    const issuedAt = params.issuedAt || new Date();
    const count = this.getCouponCountForEvent(issuedAt);
    const expiresAt = this.calculateExpiry(issuedAt);
    const createdCoupons: Coupon[] = [];

    for (let i = 0; i < count; i += 1) {
      const code = await this.generateUniqueCode();

      const [coupon] = await db<Coupon>('coupons')
        .insert({
          code,
          promotion_id: params.promotionId || null,
          source_type: params.sourceType,
          status: 'active',
          issued_phone_snapshot: params.phoneSnapshot,
          expires_at: expiresAt,
          is_active: true,
        })
        .returning('*');

      await db('coupon_user_mappings').insert({
        user_id: params.userId,
        coupon_id: coupon.id,
      });

      createdCoupons.push(coupon);
    }

    return createdCoupons;
  }

  static async expireStaleCoupons(now: Date = new Date()): Promise<number> {
    return db<Coupon>('coupons')
      .where('status', 'active')
      .andWhere('expires_at', '<', now)
      .update({
        status: 'expired',
        is_active: false,
        updated_at: now,
      });
  }

  static async markCouponAsWinner(code: string): Promise<Coupon | null> {
    const updated = await db<Coupon>('coupons')
      .where({ code })
      .andWhere('status', 'active')
      .update({
        status: 'won',
        is_active: false,
        won_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');

    return updated[0] || null;
  }

  private static async getCouponPromotionSchemaState(): Promise<CouponPromotionSchemaState> {
    if (!this.couponPromotionSchemaStatePromise) {
      this.couponPromotionSchemaStatePromise = (async () => {
        const [promotionIdColumn, promotionsTable] = await Promise.all([
          db.schema.hasColumn('coupons', 'promotion_id'),
          db.schema.hasTable('promotions'),
        ]);

        return {
          hasCouponsPromotionId: promotionIdColumn,
          hasPromotionsTable: promotionsTable,
        };
      })().catch((error) => {
        this.couponPromotionSchemaStatePromise = null;
        throw error;
      });
    }

    return this.couponPromotionSchemaStatePromise;
  }

  private static buildActiveCouponBaseQuery(
    schemaState: CouponPromotionSchemaState,
  ): Knex.QueryBuilder<ActiveCouponRow, ActiveCouponRow[]> {
    const query = db('coupon_user_mappings as mapping')
      .join('users', 'users.id', 'mapping.user_id')
      .join('coupons', 'coupons.id', 'mapping.coupon_id');

    if (schemaState.hasCouponsPromotionId && schemaState.hasPromotionsTable) {
      query.leftJoin('promotions', 'promotions.id', 'coupons.promotion_id');
    }

    query.select(
      'coupons.*',
      'mapping.user_id',
      'users.first_name',
      'users.last_name',
      'users.phone_number',
    );

    if (schemaState.hasCouponsPromotionId && schemaState.hasPromotionsTable) {
      query.select(
        'promotions.title_uz as promotion_title_uz',
        'promotions.title_ru as promotion_title_ru',
      );
    } else {
      query.select(
        db.raw('NULL::text as promotion_title_uz'),
        db.raw('NULL::text as promotion_title_ru'),
      );
    }

    return query;
  }

  static async getActiveCouponsByTelegramId(telegramId: number): Promise<ActiveCouponRow[]> {
    const schemaState = await this.getCouponPromotionSchemaState();
    const query = this.buildActiveCouponBaseQuery(schemaState);

    return query
      .where('users.telegram_id', telegramId)
      .andWhere('coupons.status', 'active')
      .orderBy('coupons.created_at', 'desc');
  }

  static async findCouponByCode(code: string): Promise<ActiveCouponRow | null> {
    const schemaState = await this.getCouponPromotionSchemaState();
    const query = this.buildActiveCouponBaseQuery(schemaState);

    const coupon = await query
      .where('coupons.code', code)
      .first();

    return coupon || null;
  }

  static async getActiveCouponsForExport(): Promise<ActiveCouponRow[]> {
    const schemaState = await this.getCouponPromotionSchemaState();
    const query = this.buildActiveCouponBaseQuery(schemaState);

    return query
      .where('coupons.status', 'active')
      .orderBy('coupons.created_at', 'desc');
  }
}
