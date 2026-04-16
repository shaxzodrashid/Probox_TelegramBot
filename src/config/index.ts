import dotenv from 'dotenv';

dotenv.config();

const parseBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const isLoopbackHost = (host: string): boolean => {
  const normalized = host.trim().toLowerCase();
  return normalized === '127.0.0.1'
    || normalized === 'localhost'
    || normalized === '::1'
    || normalized === '[::1]';
};

export const config = {
  BOT_TOKEN: process.env.BOT_TOKEN as string,
  BOT_USERNAME: process.env.BOT_USERNAME || '',
  PASSPORT_SCANNER_GIF_ID: process.env.PASSPORT_SCANNER_GIF_ID || null,
  NODE_ENV: process.env.NODE_ENV || 'development',
  BOT_ENABLED: parseBoolean(process.env.BOT_ENABLED, true),
  API_ENABLED: parseBoolean(process.env.API_ENABLED, true),
  API_HOST: process.env.API_HOST || '127.0.0.1',
  API_PORT: parseInt(process.env.API_PORT || '3000', 10),
  API_PREFIX: process.env.API_PREFIX || '/api/v1',
  API_KEY: process.env.API_KEY || '',
  API_CORS_ORIGIN: process.env.API_CORS_ORIGIN || '',
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || '',

  // SMS Configuration
  SMS_API_URL: process.env.SMS_API_URL || '',
  SMS_ORIGINATOR: process.env.SMS_ORIGINATOR || '',
  SMS_USERNAME: process.env.SMS_USERNAME || '',
  SMS_PASSWORD: process.env.SMS_PASSWORD || '',

  // MinIO Configuration
  MINIO_ENDPOINT: process.env.MINIO_ENDPOINT || 'localhost',
  MINIO_PORT: parseInt(process.env.MINIO_PORT || '9000', 10),
  MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY || '',
  MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY || '',
  MINIO_BUCKET: process.env.MINIO_BUCKET || 'bp-files',
  MINIO_USE_SSL: process.env.MINIO_USE_SSL === 'true',

  // Admin Support Configuration
  ADMIN_GROUP_ID: process.env.ADMIN_GROUP_ID || '',

  // Rate Limits
  EXPORT_RATE_LIMIT: parseInt(process.env.EXPORT_RATE_LIMIT || '5', 10),      // Max exports per hour
  BROADCAST_BATCH_SIZE: parseInt(process.env.BROADCAST_BATCH_SIZE || '25', 10),
  BROADCAST_DELAY_MS: parseInt(process.env.BROADCAST_DELAY_MS || '1000', 10),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info', 

  // CRM Configuration
  CRM_URL: process.env.CRM_URL || '',
  CRM_LOGIN: process.env.CRM_LOGIN || '',
  CRM_PASS: process.env.CRM_PASS || '',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_REQUEST_TIMEOUT_MS: Math.max(1000, parseInt(process.env.GEMINI_REQUEST_TIMEOUT_MS || '60000', 10) || 60000),
  GEMINI_TEXT_MODEL: process.env.GEMINI_TEXT_MODEL || 'gemini-robotics-er-1.5-preview',
  GEMINI_SUPPORT_AGENT_MODEL: process.env.GEMINI_SUPPORT_AGENT_MODEL || 'gemini-robotics-er-1.5-preview',
  GEMINI_EMBEDDING_MODEL: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2-preview',
  FAQ_EMBEDDING_DIM: parseInt(process.env.FAQ_EMBEDDING_DIM || '1536', 10),
  FAQ_SIMILAR_LIMIT: parseInt(process.env.FAQ_SIMILAR_LIMIT || '5', 10),
  FAQ_SEMANTIC_AUTO_REPLY_ENABLED: parseBoolean(process.env.FAQ_SEMANTIC_AUTO_REPLY_ENABLED, true),
  FAQ_AUTO_REPLY_MAX_DISTANCE: parseFloat(process.env.FAQ_AUTO_REPLY_MAX_DISTANCE || '0.35'),
  FAQ_AUTO_REPLY_MIN_CONFIDENCE: parseFloat(process.env.FAQ_AUTO_REPLY_MIN_CONFIDENCE || '0.85'),
  PURCHASE_PDF_API_BASE_URL: process.env.PURCHASE_PDF_API_BASE_URL || 'https://work-api.probox.uz/api/basic/purchases/pdfs',
  PURCHASE_PDF_API_USER: process.env.PURCHASE_PDF_API_USER || '',
  PURCHASE_PDF_API_PASS: process.env.PURCHASE_PDF_API_PASS || '',
};

if (!config.BOT_ENABLED && !config.API_ENABLED) {
  throw new Error('At least one transport must be enabled: BOT_ENABLED or API_ENABLED');
}

if (config.BOT_ENABLED && !config.BOT_TOKEN) {
  throw new Error('BOT_TOKEN is missing in environment variables');
}

if (config.API_ENABLED && !config.API_KEY && !isLoopbackHost(config.API_HOST)) {
  throw new Error('API_KEY is required when API_HOST is not loopback.');
}

export const isLoopbackApiHost = isLoopbackHost(config.API_HOST);

