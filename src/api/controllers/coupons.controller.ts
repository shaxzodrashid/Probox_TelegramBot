import type { FastifyReply, FastifyRequest } from 'fastify';
import { CouponRegistrationPayload, CouponRegistrationService } from '../../services/coupon/coupon-registration.service';
import { ApiError } from '../errors/api-error';
import { normalizeUzPhone } from '../../utils/uz-phone.util';

const UZ_PHONE_REGEX = /^(\+?998)?\d{9}$/;

export const validatePayload = (payload: CouponRegistrationPayload): void => {
  if (!UZ_PHONE_REGEX.test(payload.phone_number)) {
    throw new ApiError(
      400,
      'phone_number must be a valid Uzbekistan phone number.',
      'INVALID_PHONE_NUMBER',
    );
  }

  if (payload.referred_by && !UZ_PHONE_REGEX.test(payload.referred_by)) {
    throw new ApiError(
      400,
      'referred_by must be a valid Uzbekistan phone number.',
      'INVALID_REFERRED_BY',
    );
  }


  if (!payload.lead_id?.trim()) {
    throw new ApiError(
      400,
      'lead_id is required.',
      'MISSING_LEAD_ID',
    );
  }

  if (!['Purchased', 'VisitedStore'].includes(payload.status)) {
    throw new ApiError(
      400,
      'status must be one of: Purchased, VisitedStore.',
      'INVALID_STATUS',
    );
  }

  if (payload.status === 'Purchased' && !payload.product_name?.trim()) {
    throw new ApiError(
      400,
      'product_name is required when status is Purchased.',
      'MISSING_PRODUCT_NAME',
    );
  }
};

export const registerCoupon = async (
  request: FastifyRequest<{ Body: CouponRegistrationPayload }>,
  reply: FastifyReply,
): Promise<void> => {
  validatePayload(request.body);

  // Normalize phone numbers to 9 digits
  request.body.phone_number = normalizeUzPhone(request.body.phone_number).last9;
  if (request.body.referred_by) {
    request.body.referred_by = normalizeUzPhone(request.body.referred_by).last9;
  }

  const result = await CouponRegistrationService.process(request.body);
  reply.send(result);
};
