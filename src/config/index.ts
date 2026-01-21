import dotenv from 'dotenv';

dotenv.config();

export const config = {
  BOT_TOKEN: process.env.BOT_TOKEN as string,
  NODE_ENV: process.env.NODE_ENV || 'development',
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || '',
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
};

if (!config.BOT_TOKEN) {
  throw new Error('BOT_TOKEN is missing in environment variables');
}

