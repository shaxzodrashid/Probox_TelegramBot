import dotenv from 'dotenv';

dotenv.config();

export const config = {
  BOT_TOKEN: process.env.BOT_TOKEN as string,
  NODE_ENV: process.env.NODE_ENV || 'development',
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
};

if (!config.BOT_TOKEN) {
  throw new Error('BOT_TOKEN is missing in environment variables');
}

