import { ApiError } from '../errors/api-error';
import {
  COUPON_PROGRAM_RETIRED,
  COUPON_PROGRAM_RETIRED_MESSAGE,
} from '../../services/coupon/coupon-retirement';

export const registerCoupon = async (): Promise<never> => {
  throw new ApiError(410, COUPON_PROGRAM_RETIRED_MESSAGE, COUPON_PROGRAM_RETIRED);
};
