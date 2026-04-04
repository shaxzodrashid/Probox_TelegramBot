import type { Knex } from 'knex';
import db from '../database/database';

export interface Referral {
  id: number;
  referrer_user_id: number;
  created_from_event_id?: number | null;
  referrer_phone_snapshot?: string | null;
  referrer_full_name_snapshot?: string | null;
  referred_phone_number: string;
  created_at: Date;
  updated_at: Date;
}

export interface ReferralRewardLog {
  id: number;
  referral_id: number;
  registration_event_id: number;
  rewarded_coupon_count: number;
  created_at: Date;
  updated_at: Date;
}

type DbExecutor = Knex | Knex.Transaction;

export class ReferralService {
  static async createOrIgnore(
    params: {
      referrerUserId: number;
      createdFromEventId?: number | null;
      referrerPhoneSnapshot?: string | null;
      referrerFullNameSnapshot?: string | null;
      referredPhoneNumber: string;
    },
    executor: DbExecutor = db,
  ): Promise<Referral | null> {
    const last9 = params.referredPhoneNumber.replace(/\D/g, '').slice(-9);
    const normalizedReferredPhone = `+998${last9}`;
    
    if (params.referrerPhoneSnapshot) {
      const referrerLast9 = params.referrerPhoneSnapshot.replace(/\D/g, '').slice(-9);
      if (referrerLast9 === last9) {
        return null;
      }
    }
    
    const [referral] = await executor<Referral>('referrals')
      .insert({
        referrer_user_id: params.referrerUserId,
        created_from_event_id: params.createdFromEventId || null,
        referrer_phone_snapshot: params.referrerPhoneSnapshot || null,
        referrer_full_name_snapshot: params.referrerFullNameSnapshot || null,
        referred_phone_number: normalizedReferredPhone,
      })
      .onConflict(['referrer_user_id', 'referred_phone_number'])
      .ignore()
      .returning('*');

    if (referral) {
      return referral;
    }

    const existing = await executor<Referral>('referrals')
      .where({
        referrer_user_id: params.referrerUserId,
        referred_phone_number: normalizedReferredPhone,
      })
      .first();

    return existing || null;
  }

  static async listByReferredPhoneNumber(
    referredPhoneNumber: string,
    executor: DbExecutor = db,
  ): Promise<Referral[]> {
    const last9 = referredPhoneNumber.replace(/\D/g, '').slice(-9);
    const normalized = `+998${last9}`;
    
    return executor<Referral>('referrals')
      .where('referred_phone_number', normalized)
      .orderBy('created_at', 'asc');
  }

  static async hasRewardForEvent(
    referralId: number,
    registrationEventId: number,
    executor: DbExecutor = db,
  ): Promise<boolean> {
    const existing = await executor<ReferralRewardLog>('referral_reward_logs')
      .where({
        referral_id: referralId,
        registration_event_id: registrationEventId,
      })
      .first();

    return Boolean(existing);
  }

  static async recordReward(
    params: {
      referralId: number;
      registrationEventId: number;
      rewardedCouponCount: number;
    },
    executor: DbExecutor = db,
  ): Promise<ReferralRewardLog | null> {
    const [log] = await executor<ReferralRewardLog>('referral_reward_logs')
      .insert({
        referral_id: params.referralId,
        registration_event_id: params.registrationEventId,
        rewarded_coupon_count: params.rewardedCouponCount,
      })
      .onConflict(['referral_id', 'registration_event_id'])
      .ignore()
      .returning('*');

    if (log) {
      return log;
    }

    const existing = await executor<ReferralRewardLog>('referral_reward_logs')
      .where({
        referral_id: params.referralId,
        registration_event_id: params.registrationEventId,
      })
      .first();

    return existing || null;
  }
}
