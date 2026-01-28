import * as Minio from 'minio';
import { config } from '../config';
import { logger } from '../utils/logger';
import { Readable } from 'stream';

/**
 * MinIO Service for handling file operations with MinIO object storage
 */
class MinioServiceClass {
  private client: Minio.Client;
  private bucket: string;

  constructor() {
    this.client = new Minio.Client({
      endPoint: config.MINIO_ENDPOINT,
      port: config.MINIO_PORT,
      useSSL: config.MINIO_USE_SSL,
      accessKey: config.MINIO_ACCESS_KEY,
      secretKey: config.MINIO_SECRET_KEY,
    });
    this.bucket = config.MINIO_BUCKET;
    
    logger.info(`[MINIO] Service initialized for bucket: ${this.bucket}`);
  }

  /**
   * Get a file from MinIO as a Buffer
   * @param objectName - Path to the file in MinIO (e.g., "5672248725/test.pdf")
   * @returns Buffer containing the file data
   */
  async getFileAsBuffer(objectName: string): Promise<Buffer> {
    try {
      logger.info(`[MINIO] getFileAsBuffer: getting object ${objectName} from bucket ${this.bucket}`);
      const dataStream = await this.client.getObject(this.bucket, objectName);
      logger.info(`[MINIO] getFileAsBuffer: obtained stream for ${objectName}`);
      const chunks: Buffer[] = [];

      return new Promise((resolve, reject) => {
        dataStream.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        dataStream.on('end', () => {
          const buffer = Buffer.concat(chunks);
          logger.info(`[MINIO] Successfully retrieved ${objectName} (${buffer.length} bytes)`);
          resolve(buffer);
        });

        dataStream.on('error', (error: Error) => {
          logger.error(`[MINIO] Stream error for ${objectName}: ${error.message}`);
          reject(error);
        });
      });
    } catch (error) {
      logger.error(`[MINIO] Error getting object ${objectName}: ${error}`);
      throw error;
    }
  }

  /**
   * Get a file from MinIO as a Readable stream
   * @param objectName - Path to the file in MinIO
   * @returns Readable stream of the file
   */
  async getFileAsStream(objectName: string): Promise<Readable> {
    try {
      logger.info(`[MINIO] getFileAsStream: getting object ${objectName} from bucket ${this.bucket}`);
      const dataStream = await this.client.getObject(this.bucket, objectName);
      logger.info(`[MINIO] getFileAsStream: obtained stream for ${objectName}`);
      return dataStream;
    } catch (error) {
      logger.error(`[MINIO] Error getting object stream ${objectName}: ${error}`);
      throw error;
    }
  }

  /**
   * Check if a file exists in MinIO
   * @param objectName - Path to the file in MinIO
   * @returns true if file exists, false otherwise
   */
  async fileExists(objectName: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, objectName);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file metadata from MinIO
   * @param objectName - Path to the file in MinIO
   * @returns File stats including size, last modified, etc.
   */
  async getFileStats(objectName: string): Promise<Minio.BucketItemStat> {
    try {
      return await this.client.statObject(this.bucket, objectName);
    } catch (error) {
      logger.error(`[MINIO] Error getting stats for ${objectName}: ${error}`);
      throw error;
    }
  }

  /**
   * Generate a presigned URL for downloading a file
   * @param objectName - Path to the file in MinIO
   * @param expirySeconds - URL expiry time in seconds (default: 1 hour)
   * @returns Presigned download URL
   */
  async getPresignedUrl(objectName: string, expirySeconds: number = 3600): Promise<string> {
    try {
      const url = await this.client.presignedGetObject(this.bucket, objectName, expirySeconds);
      logger.info(`[MINIO] Generated presigned URL for ${objectName}`);
      return url;
    } catch (error) {
      logger.error(`[MINIO] Error generating presigned URL for ${objectName}: ${error}`);
      throw error;
    }
  }
}

// Export singleton instance
export const minioService = new MinioServiceClass();
