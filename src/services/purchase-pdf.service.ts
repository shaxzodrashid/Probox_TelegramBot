import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

type PurchasePdfResponse = {
  status?: boolean;
  docEntry?: number | string;
  fileName?: string;
  url?: string;
  [key: string]: unknown;
};

export class PurchasePdfService {
  private static buildEndpoint(docEntry: string): string {
    return `${config.PURCHASE_PDF_API_BASE_URL.replace(/\/+$/, '')}/${encodeURIComponent(docEntry)}`;
  }

  static isConfigured(): boolean {
    return Boolean(config.PURCHASE_PDF_API_USER && config.PURCHASE_PDF_API_PASS);
  }

  static async getPurchasePdfUrl(docEntry: string): Promise<string | null> {
    if (!this.isConfigured()) {
      logger.warn('[PURCHASE_PDF] API credentials are not configured');
      return null;
    }

    try {
      const response = await axios.get<PurchasePdfResponse>(this.buildEndpoint(docEntry), {
        auth: {
          username: config.PURCHASE_PDF_API_USER,
          password: config.PURCHASE_PDF_API_PASS,
        },
        timeout: 30000,
      });

      const url = typeof response.data?.url === 'string' ? response.data.url.trim() : '';
      if (!url) {
        logger.warn(`[PURCHASE_PDF] Empty URL returned for DocEntry ${docEntry}`);
        return null;
      }

      return url;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error(
          `[PURCHASE_PDF] Failed to fetch URL for DocEntry ${docEntry}: ${error.message}`,
          error.response?.data,
        );
        return null;
      }

      logger.error(`[PURCHASE_PDF] Unexpected error for DocEntry ${docEntry}: ${error}`);
      return null;
    }
  }
}
