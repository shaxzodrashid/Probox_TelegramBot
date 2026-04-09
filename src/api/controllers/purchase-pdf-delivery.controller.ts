import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../config';
import {
  PurchasePdfDeliveryError,
  PurchasePdfDeliveryPayload,
  PurchasePdfDeliveryService,
} from '../../services/purchase-pdf-delivery.service';
import { ApiError } from '../errors/api-error';

type RawPurchasePdfDeliveryBody = Record<string, unknown>;

const getFirstString = (...values: unknown[]): string => {
  for (const value of values) {
    if (value === undefined || value === null) {
      continue;
    }

    const normalized = String(value).trim();
    if (normalized) {
      return normalized;
    }
  }

  return '';
};

const normalizeJshshir = (...values: unknown[]): string => {
  const normalized = getFirstString(...values);
  return normalized.replace(/\D/g, '');
};

const normalizePayload = (body: RawPurchasePdfDeliveryBody): PurchasePdfDeliveryPayload => {
  const jshshir = normalizeJshshir(body.jshshir, body.JSHSHR, body.JSSHR);
  const cardCode = getFirstString(body.cardCode, body.CardCode);
  const pdfUrl = getFirstString(body.pdfUrl, body['pdf-url'], body.url);
  const fileName = getFirstString(body.fileName, body.filename);
  const docEntry = getFirstString(body.docEntry, body.DocEntry);

  return {
    jshshir: jshshir || undefined,
    cardCode: cardCode || undefined,
    pdfUrl,
    fileName: fileName || undefined,
    docEntry: docEntry || undefined,
  };
};

export const validatePurchasePdfDeliveryPayload = (payload: PurchasePdfDeliveryPayload): void => {
  if (!payload.jshshir && !payload.cardCode) {
    throw new ApiError(
      400,
      'Either jshshir or cardCode must be provided.',
      'MISSING_PURCHASE_PDF_IDENTIFIERS',
    );
  }

  if (payload.jshshir && !/^\d{14}$/.test(payload.jshshir)) {
    throw new ApiError(
      400,
      'jshshir must contain exactly 14 digits.',
      'INVALID_JSHSHIR',
    );
  }

  if (!payload.pdfUrl) {
    throw new ApiError(
      400,
      'pdfUrl is required.',
      'MISSING_PDF_URL',
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(payload.pdfUrl);
  } catch {
    throw new ApiError(
      400,
      'pdfUrl must be a valid absolute URL.',
      'INVALID_PDF_URL',
    );
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new ApiError(
      400,
      'pdfUrl must use http or https.',
      'INVALID_PDF_URL_PROTOCOL',
    );
  }
};

export const deliverPurchasePdf = async (
  request: FastifyRequest<{ Body: RawPurchasePdfDeliveryBody }>,
  reply: FastifyReply,
): Promise<void> => {
  const payload = normalizePayload(request.body ?? {});
  validatePurchasePdfDeliveryPayload(payload);

  try {
    const result = await PurchasePdfDeliveryService.process(payload);

    if (!result.adminGroupDelivered) {
      throw new ApiError(
        config.ADMIN_GROUP_ID ? 502 : 500,
        result.errors.adminGroup || 'Failed to send the PDF to the admin group.',
        config.ADMIN_GROUP_ID ? 'ADMIN_GROUP_SEND_FAILED' : 'ADMIN_GROUP_NOT_CONFIGURED',
        result,
      );
    }

    reply.send(result);
  } catch (error) {
    if (error instanceof PurchasePdfDeliveryError) {
      throw new ApiError(error.statusCode, error.message, error.code, error.details);
    }

    throw error;
  }
};
