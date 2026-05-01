import { randomBytes } from 'node:crypto';
import type { Knex } from 'knex';
import db from '../../database/database';
import { isHappyHourInTashkent } from '../../utils/time/tashkent-time.util';
import { normalizeUzPhoneOrNull } from '../../utils/uz-phone.util';

export type CouponSourceType = 'store_visit' | 'purchase' | 'referral' | 'payment_on_time';
export type CouponStatus = 'active' | 'won' | 'expired';

export interface Coupon {
  id: number;
  code: string;
  promotion_id?: number | null;
  registration_event_id?: number | null;
  source_type: CouponSourceType;
  status: CouponStatus;
  issued_phone_snapshot: string;
  lead_id?: string | null;
  customer_full_name?: string | null;
  sap_doc_entry?: number | null;
  sap_installment_id?: number | null;
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

export interface CouponExportRow extends Coupon {
  user_id?: number | null;
  first_name?: string | null;
  last_name?: string | null;
  phone_number?: string | null;
  promotion_title_uz?: string | null;
  promotion_title_ru?: string | null;
  user_exists: boolean;
}

export interface CouponInstallmentPair {
  docEntry: number;
  installmentId: number;
}

export type CouponExportMode = 'all' | 'registered';

export interface RepairablePaymentOnTimeCoupon extends Coupon {
  user_id?: number | null;
}

interface CouponPromotionSchemaState {
  hasCouponsPromotionId: boolean;
  hasPromotionsTable: boolean;
}

type DbExecutor = Knex | Knex.Transaction;

export class CouponService {
  private static couponPromotionSchemaStatePromise: Promise<CouponPromotionSchemaState> | null =
    null;
  private static readonly COUPON_PREFIX = 'PRO';
  private static readonly COUPON_TOTAL_LENGTH = 10;
  private static readonly COUPON_INSERT_RETRY_LIMIT = 20;
  private static readonly COUPON_SUFFIX_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  static getCouponCountForEvent(date: Date = new Date()): number {
    return isHappyHourInTashkent(date) ? 2 : 1;
  }

  static calculateExpiry(date: Date = new Date()): Date {
    const expiresAt = new Date(date);
    expiresAt.setDate(expiresAt.getDate() + 30);
    return expiresAt;
  }

  private static generateCode(): string {
    const suffixLength = this.COUPON_TOTAL_LENGTH - this.COUPON_PREFIX.length;
    const random = randomBytes(suffixLength);
    let suffix = '';

    for (let i = 0; i < suffixLength; i += 1) {
      suffix += this.COUPON_SUFFIX_ALPHABET[random[i] % this.COUPON_SUFFIX_ALPHABET.length];
    }

    return `${this.COUPON_PREFIX}${suffix}`;
  }

  private static isUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const maybeCode = 'code' in error ? error.code : undefined;
    return maybeCode === '23505';
  }

  private static async createCouponWithRetry(
    params: {
      promotionId?: number | null;
      registrationEventId?: number | null;
      sourceType: CouponSourceType;
      phoneSnapshot: string;
      leadId?: string | null;
      customerFullName?: string | null;
      sapDocEntry?: number | null;
      sapInstallmentId?: number | null;
      expiresAt: Date;
    },
    executor: DbExecutor,
  ): Promise<Coupon> {
    for (let attempt = 0; attempt < this.COUPON_INSERT_RETRY_LIMIT; attempt += 1) {
      try {
        const [coupon] = await executor<Coupon>('coupons')
          .insert({
            code: this.generateCode(),
            promotion_id: params.promotionId || null,
            registration_event_id: params.registrationEventId || null,
            source_type: params.sourceType,
            status: 'active',
            issued_phone_snapshot: params.phoneSnapshot,
            lead_id: params.leadId || null,
            customer_full_name: params.customerFullName || null,
            sap_doc_entry: params.sapDocEntry || null,
            sap_installment_id: params.sapInstallmentId || null,
            expires_at: params.expiresAt,
            is_active: true,
          })
          .returning('*');

        return coupon;
      } catch (error) {
        if (!this.isUniqueViolation(error)) {
          throw error;
        }
      }
    }

    throw new Error('Failed to generate a unique 10-character coupon code.');
  }

  static async createCouponsForUser(
    params: {
      userId?: number | null;
      promotionId?: number | null;
      registrationEventId?: number | null;
      sourceType: CouponSourceType;
      phoneSnapshot: string;
      leadId?: string | null;
      customerFullName?: string | null;
      sapDocEntry?: number | null;
      sapInstallmentId?: number | null;
      issuedAt?: Date;
    },
    executor: DbExecutor = db,
  ): Promise<Coupon[]> {
    const issuedAt = params.issuedAt || new Date();
    const count = this.getCouponCountForEvent(issuedAt);
    const expiresAt = this.calculateExpiry(issuedAt);
    const createdCoupons: Coupon[] = [];

    for (let i = 0; i < count; i += 1) {
      const coupon = await this.createCouponWithRetry(
        {
          promotionId: params.promotionId,
          registrationEventId: params.registrationEventId,
          sourceType: params.sourceType,
          phoneSnapshot: params.phoneSnapshot,
          leadId: params.leadId,
          customerFullName: params.customerFullName,
          sapDocEntry: params.sapDocEntry,
          sapInstallmentId: params.sapInstallmentId,
          expiresAt,
        },
        executor,
      );

      if (params.userId) {
        await executor('coupon_user_mappings').insert({
          user_id: params.userId,
          coupon_id: coupon.id,
        });
      }

      createdCoupons.push(coupon);
    }

    return createdCoupons;
  }

  static async expireStaleCoupons(now: Date = new Date()): Promise<number> {
    return db<Coupon>('coupons').where('status', 'active').andWhere('expires_at', '<', now).update({
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

  static async assignPendingCouponsToUser(
    params: {
      userId: number;
      phoneNumber: string;
    },
    executor: DbExecutor = db,
  ): Promise<Coupon[]> {
    const last9 = params.phoneNumber.replace(/\D/g, '').slice(-9);
    const normalizedVariants = [last9, `998${last9}`, `+998${last9}`];

    const coupons = await executor<Coupon>('coupons as coupons')
      .leftJoin('coupon_user_mappings as mapping', 'mapping.coupon_id', 'coupons.id')
      .whereIn('coupons.issued_phone_snapshot', normalizedVariants)
      .whereNull('mapping.id')
      .select('coupons.*')
      .orderBy('coupons.created_at', 'asc');

    if (coupons.length === 0) {
      return [];
    }

    await executor('coupon_user_mappings')
      .insert(
        coupons.map((coupon) => ({
          user_id: params.userId,
          coupon_id: coupon.id,
        })),
      )
      .onConflict(['coupon_id'])
      .ignore();

    return coupons;
  }

  static async getUnmappedPaymentOnTimeCouponsByInstallments(
    params: {
      installmentPairs: CouponInstallmentPair[];
    },
    executor: DbExecutor = db,
  ): Promise<Coupon[]> {
    if (params.installmentPairs.length === 0) {
      return [];
    }

    const coupons = await executor<Coupon>('coupons as coupons')
      .leftJoin('coupon_user_mappings as mapping', 'mapping.coupon_id', 'coupons.id')
      .where('coupons.source_type', 'payment_on_time')
      .whereNull('mapping.id')
      .andWhere((query) => {
        for (const pair of params.installmentPairs) {
          query.orWhere((inner) => {
            inner
              .where('coupons.sap_doc_entry', pair.docEntry)
              .andWhere('coupons.sap_installment_id', pair.installmentId);
          });
        }
      })
      .select('coupons.*')
      .orderBy('coupons.created_at', 'asc');

    return coupons;
  }

  static async updateIssuedPhoneSnapshot(
    couponId: number,
    phoneNumber: string | null | undefined,
    executor: DbExecutor = db,
  ): Promise<boolean> {
    const normalized = normalizeUzPhoneOrNull(phoneNumber);
    if (!normalized) {
      return false;
    }

    const updatedCount = await executor<Coupon>('coupons')
      .where('id', couponId)
      .update({
        issued_phone_snapshot: normalized,
        updated_at: new Date(),
      });

    return updatedCount > 0;
  }

  static async attachCouponToUser(
    params: {
      couponId: number;
      userId: number;
      phoneNumber?: string | null;
    },
    executor: DbExecutor = db,
  ): Promise<{
    attached: boolean;
    existingUserId: number | null;
    coupon: Coupon | null;
  }> {
    await executor('coupon_user_mappings')
      .insert({
        user_id: params.userId,
        coupon_id: params.couponId,
      })
      .onConflict(['coupon_id'])
      .ignore();

    const mapping = await executor<{ user_id: number }>('coupon_user_mappings')
      .where('coupon_id', params.couponId)
      .first();
    const attached = mapping?.user_id === params.userId;

    if (attached) {
      await this.updateIssuedPhoneSnapshot(params.couponId, params.phoneNumber, executor);
    }

    const coupon = (await executor<Coupon>('coupons').where('id', params.couponId).first()) || null;

    return {
      attached,
      existingUserId: mapping?.user_id ?? null,
      coupon,
    };
  }

  static async assignPaymentOnTimeCouponsByInstallments(
    params: {
      userId: number;
      installmentPairs: CouponInstallmentPair[];
      phoneNumber?: string | null;
    },
    executor: DbExecutor = db,
  ): Promise<Coupon[]> {
    const coupons = await this.getUnmappedPaymentOnTimeCouponsByInstallments(
      {
        installmentPairs: params.installmentPairs,
      },
      executor,
    );

    const attachedCoupons: Coupon[] = [];

    for (const coupon of coupons) {
      const result = await this.attachCouponToUser(
        {
          couponId: coupon.id,
          userId: params.userId,
          phoneNumber: params.phoneNumber,
        },
        executor,
      );

      if (result.attached && result.coupon) {
        attachedCoupons.push(result.coupon);
      }
    }

    return attachedCoupons;
  }

  static async hasSuccessfulDispatch(
    couponId: number,
    dispatchTypes: string[],
  ): Promise<boolean> {
    if (dispatchTypes.length === 0) {
      return false;
    }

    const dispatch = await db('message_dispatch_logs')
      .where('coupon_id', couponId)
      .where('status', 'sent')
      .whereIn('dispatch_type', dispatchTypes)
      .first();

    return Boolean(dispatch);
  }

  static async listPaymentOnTimeCouponsForRepair(): Promise<RepairablePaymentOnTimeCoupon[]> {
    return db<RepairablePaymentOnTimeCoupon>('coupons as coupons')
      .leftJoin('coupon_user_mappings as mapping', 'mapping.coupon_id', 'coupons.id')
      .where('coupons.source_type', 'payment_on_time')
      .select('coupons.*', 'mapping.user_id')
      .orderBy('coupons.created_at', 'asc');
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

    const coupon = await query.where('coupons.code', code).first();

    return coupon || null;
  }

  static async getCouponsForExport(mode: CouponExportMode = 'all'): Promise<CouponExportRow[]> {
    const schemaState = await this.getCouponPromotionSchemaState();
    const query = db('coupons')
      .leftJoin('coupon_user_mappings as mapping', 'mapping.coupon_id', 'coupons.id')
      .leftJoin('users', 'users.id', 'mapping.user_id');

    if (schemaState.hasCouponsPromotionId && schemaState.hasPromotionsTable) {
      query.leftJoin('promotions', 'promotions.id', 'coupons.promotion_id');
    }

    query.select(
      'coupons.*',
      'mapping.user_id',
      'users.first_name',
      'users.last_name',
      db.raw('COALESCE(users.phone_number, coupons.issued_phone_snapshot) as phone_number'),
      db.raw('CASE WHEN users.id IS NOT NULL THEN TRUE ELSE FALSE END as user_exists'),
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

    query.where('coupons.status', 'active').andWhere('coupons.is_active', true);

    if (mode === 'registered') {
      query.whereNotNull('users.id');
    }

    return query.orderBy('coupons.created_at', 'desc');
  }
}
