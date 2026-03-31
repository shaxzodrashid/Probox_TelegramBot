import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import db from '../../database/database';
import { redisService } from '../../redis/redis.service';
import { validatePayload } from './coupons.controller';

after(async () => {
  await redisService.disconnect().catch(() => undefined);
  await db.destroy().catch(() => undefined);
});

test('validatePayload rejects invalid referred_by phone format', () => {
  assert.throws(
    () =>
      validatePayload({
        phone_number: '+998901234567',
        full_name: 'Ali Valiyev',
        lead_id: 'lead-1',
        status: 'VisitedStore',
        referred_by: '909012345',
      }),
    /referred_by must match \+998XXXXXXXXX format/,
  );
});

test('validatePayload requires full_name', () => {
  assert.throws(
    () =>
      validatePayload({
        phone_number: '+998901234567',
        full_name: '   ',
        lead_id: 'lead-1',
        status: 'VisitedStore',
      }),
    /full_name is required/,
  );
});

test('validatePayload requires lead_id', () => {
  assert.throws(
    () =>
      validatePayload({
        phone_number: '+998901234567',
        full_name: 'Ali Valiyev',
        lead_id: ' ',
        status: 'VisitedStore',
      }),
    /lead_id is required/,
  );
});

test('validatePayload requires product_name for Purchased', () => {
  assert.throws(
    () =>
      validatePayload({
        phone_number: '+998901234567',
        full_name: 'Ali Valiyev',
        lead_id: 'lead-1',
        status: 'Purchased',
      }),
    /product_name is required when status is Purchased/,
  );
});
