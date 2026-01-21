import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';

class RedisService {
  private redis: Redis;

  constructor() {
    this.redis = new Redis({
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.redis.on('connect', () => {
      logger.info('Successfully connected to Redis');
    });

    this.redis.on('error', (err) => {
      logger.error('Redis connection error:', err);
    });
  }


  async set(key: string, value: unknown, expireTime?: number): Promise<'OK'> {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    if (expireTime) {
      return this.redis.set(key, stringValue, 'EX', expireTime);
    }
    return this.redis.set(key, stringValue);
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    if (!value) return null;

    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  async delete(key: string): Promise<number> {
    return this.redis.del(key);
  }

  async exists(key: string): Promise<number> {
    return this.redis.exists(key);
  }

  async setHash(key: string, field: string, value: unknown): Promise<number> {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    return this.redis.hset(key, field, stringValue);
  }

  async getHash<T>(key: string, field: string): Promise<T | null> {
    const value = await this.redis.hget(key, field);
    if (!value) return null;

    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  async getAllHash(key: string): Promise<Record<string, unknown>> {
    const data = await this.redis.hgetall(key);
    const parsedData: Record<string, unknown> = {};

    for (const [field, value] of Object.entries(data)) {
      try {
        parsedData[field] = JSON.parse(value);
      } catch {
        parsedData[field] = value;
      }
    }

    return parsedData;
  }


  async deleteHash(key: string, field: string): Promise<number> {
    return this.redis.hdel(key, field);
  }

  async increment(key: string): Promise<number> {
    return this.redis.incr(key);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.redis.expire(key, seconds);
  }

  getClient(): Redis {
    return this.redis;
  }
}

export const redisService = new RedisService();
