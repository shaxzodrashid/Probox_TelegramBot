import type { FastifyReply, FastifyRequest } from 'fastify';
import { CouponRegistrationPayload, CouponRegistrationService } from '../../services/coupon-registration.service';
import { ApiError } from '../errors/api-error';

const STRICT_UZ_PHONE_REGEX = /^\+998\d{9}$/;

const validatePayload = (payload: CouponRegistrationPayload): void => {
  if (!STRICT_UZ_PHONE_REGEX.test(payload.phone_number)) {
    throw new ApiError(
      400,
      'phone_number must match +998XXXXXXXXX format.',
      'INVALID_PHONE_NUMBER',
    );
  }

  if (payload.referred_by && !STRICT_UZ_PHONE_REGEX.test(payload.referred_by)) {
    throw new ApiError(
      400,
      'referred_by must match +998XXXXXXXXX format.',
      'INVALID_REFERRED_BY',
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
  const result = await CouponRegistrationService.process(request.body);
  reply.send(result);
};
