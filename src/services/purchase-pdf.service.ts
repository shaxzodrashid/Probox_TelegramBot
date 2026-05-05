import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

type PurchasePdfResponse = {
  status?: boolean;
  docNum?: number | string;
  fileName?: string;
  url?: string;
  [key: string]: unknown;
};

export class PurchasePdfService {
  private static buildEndpoint(docNum: string): string {
    return `${config.PURCHASE_PDF_API_BASE_URL.replace(/\/+$/, '')}/${encodeURIComponent(docNum)}`;
  }

  static isConfigured(): boolean {
    return Boolean(config.PURCHASE_PDF_API_USER && config.PURCHASE_PDF_API_PASS);
  }

  static async getPurchasePdfUrl(docNum: string): Promise<string | null> {
    if (!this.isConfigured()) {
      logger.warn('[PURCHASE_PDF] API credentials are not configured');
      return null;
    }

    try {
      const response = await axios.get<PurchasePdfResponse>(this.buildEndpoint(docNum), {
        auth: {
          username: config.PURCHASE_PDF_API_USER,
          password: config.PURCHASE_PDF_API_PASS,
        },
        timeout: 30000,
      });

      const url = typeof response.data?.url === 'string' ? response.data.url.trim() : '';
      if (!url) {
        logger.warn(`[PURCHASE_PDF] Empty URL returned for DocNum ${docNum}`);
        return null;
      }

      return url;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error(
          `[PURCHASE_PDF] Failed to fetch URL for DocNum ${docNum}: ${error.message}`,
          error.response?.data,
        );
        return null;
      }

      logger.error(`[PURCHASE_PDF] Unexpected error for DocNum ${docNum}: ${error}`);
      return null;
    }
  }
}
