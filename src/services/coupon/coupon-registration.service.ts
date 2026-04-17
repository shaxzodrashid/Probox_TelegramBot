import { randomUUID } from 'crypto';
import type { Knex } from 'knex';
import db from '../../database/database';
import { redisService } from '../../redis/redis.service';
import { formatDateForLocale } from '../../utils/time/tashkent-time.util';
import { Coupon, CouponService } from './coupon.service';
import { BotNotificationService } from '../bot-notification.service';
import {
  CouponRegistrationEvent,
  CouponRegistrationEventService,
  CouponRegistrationStatus,
} from './coupon-registration-event.service';
import { PromotionService } from './promotion.service';
import { Referral, ReferralService } from './referral.service';
import { User, UserService } from '../user.service';

export interface CouponRegistrationPayload {
  phone_number: string;
  full_name: string;
  lead_id: string;
  status: CouponRegistrationStatus;
  product_name?: string;
  referred_by?: string;
}

export interface CouponRegistrationResponse {
  processed: boolean;
  reason?: string;
  user?: {
    telegram_id: number;
    phone_number?: string;
  };
  promotion?: {
    id: number;
    slug: string;
  };
  coupons: Array<{
    id: number;
    code: string;
    source_type: string;
    expires_at: Date;
  }>;
  delivery: Array<{
    user_telegram_id: number;
    delivered: boolean;
    dispatch_type: string;
    error?: string;
  }>;
}

export class CouponRegistrationService {
  private static readonly EVENT_LOCK_PREFIX = 'lock:coupon-registration-event:';
  private static readonly EVENT_LOCK_TTL_SECONDS = 15;

  static runInTransaction<T>(callback: (trx: Knex.Transaction) => Promise<T>): Promise<T> {
    return db.transaction(callback);
  }

  static async process(payload: CouponRegistrationPayload): Promise<CouponRegistrationResponse> {
    const flow =
      payload.status === 'Purchased'
        ? {
            sourceType: 'purchase' as const,
            templateType: 'purchase' as const,
            shouldRewardReferrals: true,
          }
        : {
            sourceType: 'store_visit' as const,
            templateType: 'store_visit' as const,
            shouldRewardReferrals: false,
          };

    return this.processBySource({
      payload,
      sourceType: flow.sourceType,
      templateType: flow.templateType,
      shouldRewardReferrals: flow.shouldRewardReferrals,
    });
  }

  static async claimPendingCouponsForUser(user: User): Promise<{
    coupons: Coupon[];
    delivery: CouponRegistrationResponse['delivery'];
  }> {
    if (!user.phone_number) {
      return { coupons: [], delivery: [] };
    }

    const { assignedCoupons, assignedEvents } = await this.runInTransaction(async (trx) => {
      const assignedEvents = await CouponRegistrationEventService.assignPendingEventsToUser(
        user.phone_number!,
        user.id,
        trx,
      );

      for (const event of assignedEvents) {
        if (!event.referred_phone_number) {
          continue;
        }

        await ReferralService.createOrIgnore(
          {
            referrerUserId: user.id,
            createdFromEventId: event.id,
            referrerPhoneSnapshot: user.phone_number,
            referrerFullNameSnapshot: event.customer_full_name || this.buildName(user),
            referredPhoneNumber: event.referred_phone_number,
          },
          trx,
        );
      }

      const assignedCoupons = await CouponService.assignPendingCouponsToUser(
        {
          userId: user.id,
          phoneNumber: user.phone_number!,
        },
        trx,
      );

      return {
        assignedCoupons,
        assignedEvents,
      };
    });

    const eventsById = new Map(assignedEvents.map((event) => [event.id, event]));
    const delivery: CouponRegistrationResponse['delivery'] = [];

    for (const coupon of assignedCoupons) {
      const templateType =
        coupon.source_type === 'purchase'
          ? 'purchase'
          : coupon.source_type === 'store_visit'
            ? 'store_visit'
            : null;
      if (!templateType) {
        continue;
      }

      const event = coupon.registration_event_id
        ? eventsById.get(coupon.registration_event_id)
        : undefined;
      const result = await BotNotificationService.sendTemplateMessage({
        user,
        templateType,
        placeholders: {
          customer_name: event?.customer_full_name || 'Mijoz',
          coupon_code: coupon.code,
          payment_due_date: formatDateForLocale(coupon.expires_at, user.language_code || 'uz'),
          product_name: event?.product_name || '',
          referrer_name: '',
          prize_name: '',
        },
        couponId: coupon.id,
        dispatchType: coupon.source_type,
      });

      delivery.push({
        user_telegram_id: user.telegram_id,
        delivered: result.delivered,
        dispatch_type: coupon.source_type,
        error: result.error,
      });
    }

    return {
      coupons: assignedCoupons,
      delivery,
    };
  }

  private static buildName(user: User): string {
    return [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Mijoz';
  }

  private static buildCustomerName(
    payload: CouponRegistrationPayload,
    fallbackUser?: User,
  ): string {
    const normalized = (payload.full_name || '').trim();
    return normalized || 'Mijoz';
  }

  private static getEventLockKey(payload: CouponRegistrationPayload): string {
    return `${this.EVENT_LOCK_PREFIX}${payload.phone_number}:${payload.lead_id}:${payload.status}`;
  }

  private static async acquireEventLock(key: string, token: string): Promise<boolean> {
    const result = await redisService
      .getClient()
      .set(key, token, 'EX', this.EVENT_LOCK_TTL_SECONDS, 'NX');
    return result === 'OK';
  }

  private static async releaseEventLock(key: string, token: string): Promise<void> {
    const currentToken = await redisService.get<string>(key);
    if (currentToken === token) {
      await redisService.delete(key);
    }
  }

  private static async wait(ms: number): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private static isUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const maybeCode = 'code' in error ? error.code : undefined;
    return maybeCode === '23505';
  }

  private static async waitForExistingEvent(
    payload: CouponRegistrationPayload,
  ): Promise<CouponRegistrationEvent | null> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const existingEvent = await CouponRegistrationEventService.getByIdentity(
        payload.phone_number,
        payload.lead_id,
        payload.status,
      );
      if (existingEvent) {
        return existingEvent;
      }

      await this.wait(250);
    }

    return null;
  }

  private static buildDuplicateResponse(params: {
    promotion: NonNullable<Awaited<ReturnType<typeof PromotionService.getCurrentPromotion>>>;
    user: User | null;
  }): CouponRegistrationResponse {
    return {
      processed: true,
      reason: 'duplicate_event_skipped',
      user: params.user
        ? {
            telegram_id: params.user.telegram_id,
            phone_number: params.user.phone_number ?? undefined,
          }
        : undefined,
      promotion: {
        id: params.promotion.id,
        slug: params.promotion.slug,
      },
      coupons: [],
      delivery: [],
    };
  }

  private static async processBySource(params: {
    payload: CouponRegistrationPayload;
    sourceType: 'store_visit' | 'purchase';
    templateType: 'store_visit' | 'purchase';
    shouldRewardReferrals: boolean;
  }): Promise<CouponRegistrationResponse> {
    const promotion = await PromotionService.getCurrentPromotion();
    if (!promotion) {
      return {
        processed: false,
        reason: 'No active promotion found.',
        coupons: [],
        delivery: [],
      };
    }

    const user = await UserService.getUserByPhoneNumber(params.payload.phone_number);
    const customerName = this.buildCustomerName(params.payload, user || undefined);
    const eventLockKey = this.getEventLockKey(params.payload);
    const eventLockToken = randomUUID();
    const lockAcquired = await this.acquireEventLock(eventLockKey, eventLockToken);

    if (!lockAcquired) {
      const existingEvent = await this.waitForExistingEvent(params.payload);
      if (existingEvent) {
        return this.buildDuplicateResponse({ promotion, user });
      }
    }

    if (!lockAcquired) {
      return {
        processed: false,
        reason: 'Duplicate request is already being processed.',
        coupons: [],
        delivery: [],
      };
    }

    try {
      const existingEvent = await CouponRegistrationEventService.getByIdentity(
        params.payload.phone_number,
        params.payload.lead_id,
        params.payload.status,
      );

      if (existingEvent) {
        return this.buildDuplicateResponse({ promotion, user });
      }

      const processingResult = await this.runInTransaction(async (trx) => {
        const event = await CouponRegistrationEventService.create(
          {
            user_id: user?.id || null,
            promotion_id: promotion.id,
            phone_number: params.payload.phone_number,
            lead_id: params.payload.lead_id,
            customer_full_name: customerName,
            status: params.payload.status,
            product_name: params.payload.product_name || null,
            referred_phone_number: params.payload.referred_by || null,
          },
          trx,
        );

        const customerCoupons = await CouponService.createCouponsForUser(
          {
            userId: user?.id || null,
            promotionId: promotion.id,
            registrationEventId: event.id,
            sourceType: params.sourceType,
            phoneSnapshot: params.payload.phone_number,
            leadId: params.payload.lead_id,
            customerFullName: customerName,
          },
          trx,
        );

        if (params.payload.referred_by && user) {
          await ReferralService.createOrIgnore(
            {
              referrerUserId: user.id,
              createdFromEventId: event.id,
              referrerPhoneSnapshot: params.payload.phone_number,
              referrerFullNameSnapshot: customerName,
              referredPhoneNumber: params.payload.referred_by,
            },
            trx,
          );
        }

        const rewardedReferrals: Array<{
          referral: Referral;
          coupons: Awaited<ReturnType<typeof CouponService.createCouponsForUser>>;
        }> = [];

        if (params.shouldRewardReferrals) {
          const referrals = await ReferralService.listByReferredPhoneNumber(
            params.payload.phone_number,
            trx,
          );

          for (const referral of referrals) {
            const alreadyRewarded = await ReferralService.hasRewardForEvent(
              referral.id,
              event.id,
              trx,
            );
            if (alreadyRewarded) {
              continue;
            }

            const referralCoupons = await CouponService.createCouponsForUser(
              {
                userId: referral.referrer_user_id,
                promotionId: promotion.id,
                registrationEventId: event.id,
                sourceType: 'referral',
                phoneSnapshot: params.payload.phone_number,
                leadId: params.payload.lead_id,
                customerFullName: customerName,
              },
              trx,
            );

            await ReferralService.recordReward(
              {
                referralId: referral.id,
                registrationEventId: event.id,
                rewardedCouponCount: referralCoupons.length,
              },
              trx,
            );

            rewardedReferrals.push({
              referral,
              coupons: referralCoupons,
            });
          }
        }

        return {
          event,
          customerCoupons,
          rewardedReferrals,
        };
      });

      const coupons = [...processingResult.customerCoupons];
      const delivery: CouponRegistrationResponse['delivery'] = [];

      if (user) {
        for (const coupon of processingResult.customerCoupons) {
          const result = await BotNotificationService.sendTemplateMessage({
            user,
            templateType: params.templateType,
            placeholders: {
              customer_name: customerName,
              coupon_code: coupon.code,
              payment_due_date: formatDateForLocale(coupon.expires_at, user.language_code || 'uz'),
              product_name: params.payload.product_name || '',
              referrer_name: '',
              prize_name: '',
            },
            couponId: coupon.id,
            dispatchType: params.sourceType,
          });

          delivery.push({
            user_telegram_id: user.telegram_id,
            delivered: result.delivered,
            dispatch_type: params.sourceType,
            error: result.error,
          });
        }
      }

      const referrerIds = Array.from(
        new Set(
          processingResult.rewardedReferrals.map(({ referral }) => referral.referrer_user_id),
        ),
      );
      const referrers = await UserService.getUsersByIds(referrerIds);
      const referrersById = new Map(referrers.map((referrer) => [referrer.id, referrer]));

      for (const rewardedReferral of processingResult.rewardedReferrals) {
        const referrer = referrersById.get(rewardedReferral.referral.referrer_user_id);
        if (!referrer) {
          continue;
        }

        for (const coupon of rewardedReferral.coupons) {
          const result = await BotNotificationService.sendTemplateMessage({
            user: referrer,
            templateType: 'referral',
            placeholders: {
              customer_name: customerName,
              coupon_code: coupon.code,
              product_name: '',
              payment_due_date: '',
              referrer_name:
                rewardedReferral.referral.referrer_full_name_snapshot || this.buildName(referrer),
              prize_name: '',
            },
            couponId: coupon.id,
            dispatchType: 'referral',
          });

          delivery.push({
            user_telegram_id: referrer.telegram_id,
            delivered: result.delivered,
            dispatch_type: 'referral',
            error: result.error,
          });
          coupons.push(coupon);
        }
      }

      return {
        processed: true,
        reason: user ? undefined : 'pending_user_assignment',
        user: user
          ? {
              telegram_id: user.telegram_id,
              phone_number: user.phone_number ?? undefined,
            }
          : undefined,
        promotion: {
          id: promotion.id,
          slug: promotion.slug,
        },
        coupons: coupons.map((coupon) => ({
          id: coupon.id,
          code: coupon.code,
          source_type: coupon.source_type,
          expires_at: coupon.expires_at,
        })),
        delivery,
      };
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        return this.buildDuplicateResponse({ promotion, user });
      }

      throw error;
    } finally {
      await this.releaseEventLock(eventLockKey, eventLockToken);
    }
  }
}
