import { minioService } from '../minio.service';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../utils/logger';
import sharp from 'sharp';

// Mock logger to avoid noise during benchmark
const originalInfo = logger.info;
logger.info = () => {};

// Mock the actual client
minioService['client'] = {
  putObject: async () => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 50));
    return {};
  },
  removeObjects: async () => {
    return {};
  },
  listObjectsV2: () => {
    const stream: any = {
      on: (event: string, cb: any) => {
        if (event === 'end') {
          process.nextTick(cb);
        }
      }
    };
    return stream;
  }
} as any;

async function createValidImageBuffer() {
  return await sharp({
    create: {
      width: 1000,
      height: 1000,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 0.5 }
    }
  }).jpeg().toBuffer();
}

async function runBenchmark() {
  const dummyBuffer = await createValidImageBuffer();
  const buffers = Array(10).fill(dummyBuffer);
  const telegramId = 123456;

  console.log('Starting benchmark with', buffers.length, 'buffers...');

  const start = Date.now();

  await minioService.uploadUserPassport(telegramId, buffers, { first_name: 'Test', last_name: 'User' });

  const end = Date.now();
  console.log(`Time taken: ${end - start}ms`);
}

runBenchmark().catch(console.error).finally(() => {
  logger.info = originalInfo;
});
