import type { Knex } from 'knex';
import db from '../database/database';

export type CouponRegistrationStatus = 'Purchased' | 'VisitedStore';

export interface CouponRegistrationEvent {
  id: number;
  user_id?: number | null;
  promotion_id?: number | null;
  phone_number: string;
  lead_id: string;
  customer_full_name: string;
  status: CouponRegistrationStatus;
  product_name?: string | null;
  referred_phone_number?: string | null;
  processed_at: Date;
  created_at: Date;
  updated_at: Date;
}

type DbExecutor = Knex | Knex.Transaction;

export class CouponRegistrationEventService {
  static async getByIdentity(
    phoneNumber: string,
    leadId: string,
    status: CouponRegistrationStatus,
    executor: DbExecutor = db,
  ): Promise<CouponRegistrationEvent | null> {
    const last9 = phoneNumber.replace(/\D/g, '').slice(-9);
    const normalized = `+998${last9}`;

    const event = await executor<CouponRegistrationEvent>('coupon_registration_events')
      .where({
        phone_number: normalized,
        lead_id: leadId,
        status,
      })
      .first();

    return event || null;
  }

  static async create(
    data: Omit<CouponRegistrationEvent, 'id' | 'processed_at' | 'created_at' | 'updated_at'>,
    executor: DbExecutor = db,
  ): Promise<CouponRegistrationEvent> {
    const last9 = data.phone_number.replace(/\D/g, '').slice(-9);
    const normalizedPhone = `+998${last9}`;

    let normalizedReferredPhone = data.referred_phone_number;
    if (normalizedReferredPhone) {
      const referredLast9 = normalizedReferredPhone.replace(/\D/g, '').slice(-9);
      normalizedReferredPhone = `+998${referredLast9}`;
    }

    const [event] = await executor<CouponRegistrationEvent>('coupon_registration_events')
      .insert({
        ...data,
        phone_number: normalizedPhone,
        referred_phone_number: normalizedReferredPhone,
        processed_at: new Date(),
      })
      .returning('*');

    return event;
  }

  static async assignPendingEventsToUser(
    phoneNumber: string,
    userId: number,
    executor: DbExecutor = db,
  ): Promise<CouponRegistrationEvent[]> {
    const last9 = phoneNumber.replace(/\D/g, '').slice(-9);
    const normalized = `+998${last9}`;

    return executor<CouponRegistrationEvent>('coupon_registration_events')
      .where({
        phone_number: normalized,
      })
      .whereNull('user_id')
      .update({
        user_id: userId,
        updated_at: new Date(),
      })
      .returning('*');
  }
}
