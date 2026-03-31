import { formatDateForLocale } from '../utils/tashkent-time.util';
import { CouponService } from './coupon.service';
import { BotNotificationService } from './bot-notification.service';
import { PromotionService } from './promotion.service';
import { User, UserService } from './user.service';

export interface CouponRegistrationPayload {
  phone_number: string;
  status: 'Purchased' | 'VisitedStore';
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
  static async process(payload: CouponRegistrationPayload): Promise<CouponRegistrationResponse> {
    const flow =
      payload.status === 'Purchased'
        ? {
            sourceType: 'purchase' as const,
            templateType: 'purchase' as const,
            includeReferral: true,
          }
        : {
            sourceType: 'store_visit' as const,
            templateType: 'store_visit' as const,
            includeReferral: true,
          };

    return this.processBySource({
      payload,
      sourceType: flow.sourceType,
      templateType: flow.templateType,
      includeReferral: flow.includeReferral,
    });
  }

  private static buildName(user: User): string {
    return [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Mijoz';
  }

  private static async processBySource(params: {
    payload: CouponRegistrationPayload;
    sourceType: 'store_visit' | 'purchase';
    templateType: 'store_visit' | 'purchase';
    includeReferral: boolean;
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
    if (!user) {
      return {
        processed: false,
        reason: 'User not found for phone number.',
        coupons: [],
        delivery: [],
      };
    }

    const coupons = await CouponService.createCouponsForUser({
      userId: user.id,
      promotionId: promotion.id,
      sourceType: params.sourceType,
      phoneSnapshot: params.payload.phone_number,
    });

    const delivery: CouponRegistrationResponse['delivery'] = [];
    for (const coupon of coupons) {
      const result = await BotNotificationService.sendTemplateMessage({
        user,
        templateType: params.templateType,
        placeholders: {
          customer_name: this.buildName(user),
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

    if (params.includeReferral && params.payload.referred_by) {
      const referrer = await UserService.getUserByPhoneNumber(params.payload.referred_by);
      if (referrer) {
        const referralCoupons = await CouponService.createCouponsForUser({
          userId: referrer.id,
          promotionId: promotion.id,
          sourceType: 'referral',
          phoneSnapshot: params.payload.referred_by,
        });

        for (const coupon of referralCoupons) {
          const result = await BotNotificationService.sendTemplateMessage({
            user: referrer,
            templateType: 'referral',
            placeholders: {
              customer_name: this.buildName(user),
              coupon_code: coupon.code,
              product_name: '',
              payment_due_date: '',
              referrer_name: this.buildName(referrer),
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
    }

    return {
      processed: true,
      user: {
        telegram_id: user.telegram_id,
        phone_number: user.phone_number,
      },
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
  }
}
