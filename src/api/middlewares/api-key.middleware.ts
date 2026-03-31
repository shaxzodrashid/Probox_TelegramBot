import type { FastifyRequest } from 'fastify';
import { config } from '../../config';
import { ApiError } from '../errors/api-error';

const getHeaderValue = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
};

export const requireApiKey = async (request: FastifyRequest): Promise<void> => {
  if (!config.API_KEY) {
    return;
  }

  const directApiKey = getHeaderValue(request.headers['x-api-key']);
  const authorizationHeader = getHeaderValue(request.headers.authorization);
  const bearerToken = authorizationHeader.startsWith('Bearer ')
    ? authorizationHeader.slice('Bearer '.length).trim()
    : '';

  const apiKey = directApiKey || bearerToken;

  if (apiKey !== config.API_KEY) {
    throw new ApiError(401, 'A valid API key is required for this endpoint.', 'UNAUTHORIZED');
  }
};
