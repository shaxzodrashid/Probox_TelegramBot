import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { logger } from '../utils/logger';

dotenv.config({ path: path.join(process.cwd(), '.env') });

type PurchasePdfResponse = {
  status?: boolean;
  docEntry?: number | string;
  fileName?: string;
  url?: string;
  [key: string]: unknown;
};

const DEFAULT_BASE_URL = 'https://work-api.probox.uz/api/basic/purchases/pdfs';

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is missing in .env`);
  }

  return value;
}

function buildEndpoint(baseUrl: string, docEntry: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(docEntry)}`;
}

async function main() {
  const docEntry = process.argv[2] || process.env.PURCHASE_PDF_TEST_DOC_ENTRY;
  const shouldCheckReturnedUrl = process.argv.includes('--check-url');

  if (!docEntry) {
    logger.error('Usage: npm run test:purchase-pdf -- <docEntry> [--check-url]');
    logger.error('Or set PURCHASE_PDF_TEST_DOC_ENTRY in your .env file.');
    process.exit(1);
  }

  const username = getRequiredEnv('PURCHASE_PDF_API_USER');
  const password = getRequiredEnv('PURCHASE_PDF_API_PASS');
  const baseUrl = (process.env.PURCHASE_PDF_API_BASE_URL || DEFAULT_BASE_URL).trim();
  const endpoint = buildEndpoint(baseUrl, docEntry);

  logger.info(`Requesting purchase PDF metadata for DocEntry: ${docEntry}`);
  logger.info(`GET ${endpoint}`);

  try {
    const response = await axios.get<PurchasePdfResponse>(endpoint, {
      auth: {
        username,
        password,
      },
      timeout: 30000,
    });

    logger.info(`Status: ${response.status} ${response.statusText}`);
    logger.info('Response body:');
    logger.info(JSON.stringify(response.data, null, 2));

    if (shouldCheckReturnedUrl && response.data?.url) {
      logger.info('Checking returned file URL...');

      const fileResponse = await axios.get(response.data.url, {
        responseType: 'stream',
        timeout: 30000,
      });

      logger.info(`File URL status: ${fileResponse.status} ${fileResponse.statusText}`);
      logger.info(`Content-Type: ${fileResponse.headers['content-type'] || 'unknown'}`);
      logger.info(`Content-Length: ${fileResponse.headers['content-length'] || 'unknown'}`);

      fileResponse.data.destroy();
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error(`Request failed: ${error.message}`);

      if (error.response) {
        logger.error(`HTTP ${error.response.status} ${error.response.statusText}`);
        logger.error(JSON.stringify(error.response.data, null, 2));
      }

      process.exit(1);
    }

    logger.error('Unexpected error:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
