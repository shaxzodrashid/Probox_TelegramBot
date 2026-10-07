import type { Coupon } from './coupon.service';
import type { CouponRegistrationStatus } from './coupon-registration-event.service';
import { COUPON_PROGRAM_RETIRED } from './coupon-retirement';

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
  static async process(): Promise<CouponRegistrationResponse> {
    return { processed: false, reason: COUPON_PROGRAM_RETIRED, coupons: [], delivery: [] };
  }

  static async claimPendingCouponsForUser(): Promise<{
    coupons: Coupon[];
    delivery: CouponRegistrationResponse['delivery'];
  }> {
    return { coupons: [], delivery: [] };
  }
}
