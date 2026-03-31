import type { Knex } from 'knex';
import db from '../database/database';

export type CouponRegistrationStatus = 'Purchased' | 'VisitedStore';

export interface CouponRegistrationEvent {
  id: number;
  user_id: number;
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
    const event = await executor<CouponRegistrationEvent>('coupon_registration_events')
      .where({
        phone_number: phoneNumber,
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
    const [event] = await executor<CouponRegistrationEvent>('coupon_registration_events')
      .insert({
        ...data,
        processed_at: new Date(),
      })
      .returning('*');

    return event;
  }
}
