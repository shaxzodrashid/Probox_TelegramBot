import * as Minio from 'minio';
import { config } from '../config';
import { logger } from '../utils/logger';
import { Readable } from 'stream';
import sharp from 'sharp';

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

  /**
   * Upload a file to MinIO
   * @param objectName - Path to the file in MinIO
   * @param streamOrBuffer - File data as ReadStream or Buffer
   * @param metaData - Optional metadata for the file
   * @returns Upload result
   */
  async uploadFile(objectName: string, streamOrBuffer: Buffer | Readable, metaData: Minio.ItemBucketMetadata = {}): Promise<any> {
    try {
      logger.info(`[MINIO] uploadFile: uploading object ${objectName} to bucket ${this.bucket}`);
      let result;
      if (Buffer.isBuffer(streamOrBuffer)) {
         result = await this.client.putObject(this.bucket, objectName, streamOrBuffer, streamOrBuffer.length, metaData);
      } else {
         // for streams without known length, we might need to pass size as undefined or skip it according to types
         // Using any to bypass TS complaining about overloaded signatures
         result = await (this.client.putObject as any)(this.bucket, objectName, streamOrBuffer, undefined, metaData);
      }
      logger.info(`[MINIO] Successfully uploaded ${objectName}`);
      return result;
    } catch (error) {
       logger.error(`[MINIO] Error uploading object ${objectName}: ${error}`);
       throw error;
    }
  }

  /**
   * Delete a file from MinIO
   * @param objectName - Path to the file in MinIO
   */
  async deleteFile(objectName: string): Promise<void> {
    try {
      await this.client.removeObject(this.bucket, objectName);
      logger.info(`[MINIO] Successfully deleted ${objectName} from bucket ${this.bucket}`);
    } catch (error) {
      logger.error(`[MINIO] Error deleting object ${objectName}: ${error}`);
      throw error;
    }
  }

  /**
   * List objects with a specific prefix
   * @param prefix - Prefix to search for
   * @returns Array of object names
   */
  async listObjects(prefix: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const objectsList: string[] = [];
      const stream = this.client.listObjectsV2(this.bucket, prefix, true);
      
      stream.on('data', (obj) => {
        if (obj.name) objectsList.push(obj.name);
      });
      
      stream.on('error', (err) => {
        logger.error(`[MINIO] Error listing objects with prefix ${prefix}: ${err}`);
        reject(err);
      });
      
      stream.on('end', () => {
        resolve(objectsList);
      });
    });
  }

  /**
   * Delete all files starting with a prefix
   * @param prefix - Prefix to delete
   */
  async deleteFilesByPrefix(prefix: string): Promise<void> {
    try {
      const objects = await this.listObjects(prefix);
      if (objects.length > 0) {
        await this.client.removeObjects(this.bucket, objects);
        logger.info(`[MINIO] Deleted ${objects.length} objects with prefix ${prefix}`);
      }
    } catch (error) {
      logger.error(`[MINIO] Error deleting objects by prefix ${prefix}: ${error}`);
      throw error;
    }
  }

  /**
   * Special helper for passport uploads: deletes old passports for this user and saves the new one(s).
   * Path format: passports/USER_ID/passport_DATETIME_FILENAME.jpg (or just fixed name if user prefers)
   * We will use a folder structure to "distinguish" them easily.
   * passports/USER_ID/photo.jpg
   */
  async uploadUserPassport(telegramId: number, buffers: Buffer | Buffer[], userDetails?: { first_name?: string, last_name?: string }): Promise<void> {
    const folder = `passports/${telegramId}/`;
    
    try {
      // 1. Delete existing passport files for this user
      await this.deleteFilesByPrefix(folder);
      
      const bufferArray = Array.isArray(buffers) ? buffers : [buffers];
      const namePart = userDetails ? `_${userDetails.first_name || ''}_${userDetails.last_name || ''}`.replace(/[^a-zA-Z0-9]/g, '_') : '';
      
      for (let i = 0; i < bufferArray.length; i++) {
        const buffer = bufferArray[i];
        
        // 2. Generate descriptive filename
        const filename = `${folder}passport${namePart}_${i + 1}.jpg`;

        // 3. Compress image before upload
        logger.info(`[MINIO] Compressing image ${i + 1} for user ${telegramId}...`);
        const compressedBuffer = await sharp(buffer)
          .jpeg({ quality: 50, mozjpeg: true })
          .toBuffer();
        
        logger.info(`[MINIO] Compression done: ${buffer.length} -> ${compressedBuffer.length} bytes`);
        
        // 4. Upload compressed one
        await this.uploadFile(filename, compressedBuffer);
        logger.info(`[MINIO] Handled passport update for user ${telegramId}: old deleted, new compressed and uploaded as ${filename}`);
      }
    } catch (error) {
      logger.error(`[MINIO] Failed to handle user passport update for ${telegramId}: ${error}`);
      throw error;
    }
  }

  /**
   * Special helper for face ID uploads: deletes old face IDs for this user and saves the new one.
   * Path format: face_id/USER_ID/face_id_DATETIME.jpg
   */
  async uploadFaceId(telegramId: number, buffer: Buffer): Promise<void> {
    const folder = `face_id/${telegramId}/`;
    
    try {
      // 1. Delete existing face ID files for this user
      await this.deleteFilesByPrefix(folder);
      
      // 2. Generate filename
      const filename = `${folder}face_id_${Date.now()}.jpg`;

      // 3. Compress image before upload
      logger.info(`[MINIO] Compressing face ID image for user ${telegramId}...`);
      const compressedBuffer = await sharp(buffer)
        .jpeg({ quality: 50, mozjpeg: true })
        .toBuffer();
      
      logger.info(`[MINIO] Compression done: ${buffer.length} -> ${compressedBuffer.length} bytes`);
      
      // 4. Upload compressed one
      await this.uploadFile(filename, compressedBuffer);
      logger.info(`[MINIO] Handled face ID upload for user ${telegramId}: old deleted, new compressed and uploaded as ${filename}`);
    } catch (error) {
      logger.error(`[MINIO] Failed to handle face ID upload for ${telegramId}: ${error}`);
      throw error;
    }
  }
}

// Export singleton instance
export const minioService = new MinioServiceClass();
