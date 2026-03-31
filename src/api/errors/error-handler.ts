import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../../utils/logger';
import { ApiError } from './api-error';

type FastifyValidationError = Error & {
  validation?: unknown;
  validationContext?: string;
};

export const registerApiErrorHandlers = (app: FastifyInstance): void => {
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: 'Not Found',
      code: 'ROUTE_NOT_FOUND',
      message: `Route ${request.method} ${request.url} was not found`,
    });
  });

  app.setErrorHandler(
    (error: FastifyValidationError, request: FastifyRequest, reply: FastifyReply) => {
      if (error.validation) {
        reply.status(400).send({
          error: 'Bad Request',
          code: 'VALIDATION_ERROR',
          message: error.message,
          details: error.validation,
        });
        return;
      }

      if (error instanceof ApiError) {
        reply.status(error.statusCode).send({
          error: error.statusCode >= 500 ? 'Internal Server Error' : 'Request Failed',
          code: error.code,
          message: error.message,
          details: error.details,
        });
        return;
      }

      logger.error(`Unhandled API error on ${request.method} ${request.url}`, error);
      reply.status(500).send({
        error: 'Internal Server Error',
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred while processing the request.',
      });
    },
  );
};
