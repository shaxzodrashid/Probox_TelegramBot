import * as hanaClient from '@sap/hana-client';
import { HanaParameterType } from '@sap/hana-client';
import { logger } from '../utils/logger';

export class SapTimeoutError extends Error {
  public readonly location: string;

  constructor(ms: number, location = 'sap.hana.executeOnce') {
    super(`⏱ SAP query timeout after ${ms} ms`);
    this.name = 'SapTimeoutError';
    this.location = location;
  }
}

function normalizeError(err: unknown, fallbackLocation?: string): Error {
  if (err instanceof Error) return err;

  const error = new Error(String(err));
  if (fallbackLocation) {
    (error as Error & { location?: string }).location = fallbackLocation;
  }
  return error;
}

function withTimeout<T>(promise: Promise<T>, ms: number, location: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SapTimeoutError(ms, location)), ms);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err: unknown) => {
        clearTimeout(timer);
        reject(normalizeError(err, location));
      });
  });
}

export class HanaService {
  private readonly logger = logger;

  private readonly connectionParams = {
    serverNode: process.env.SERVER_NODE,
    uid: process.env.UID,
    pwd: process.env.PASSWORD,
    connectTimeout: 10_000,
    communicationTimeout: 10_000,
  };

  async executeOnce<T = Record<string, unknown>>(
    query: string,
    params: HanaParameterType[] = [],
    options?: { timeoutMs?: number; location?: string },
  ): Promise<T[]> {
    const timeoutMs = options?.timeoutMs ?? 10_000;
    const location = options?.location ?? 'sap.hana.executeOnce';

    const conn: hanaClient.Connection = hanaClient.createConnection();

    const execPromise = new Promise<T[]>((resolve, reject) => {
      conn.connect(this.connectionParams, (connectErr) => {
        if (connectErr) {
          const error = normalizeError(connectErr, `${location}.connect`);
          this.logger.error('❌ SAP connection error', error.message);
          return reject(error);
        }

        conn.exec(query, params, (execErr, rows) => {
          conn.disconnect();

          if (execErr) {
            const error = normalizeError(execErr, `${location}.exec`);
            this.logger.error('❌ SAP exec error', error.message);
            return reject(error);
          }

          resolve((rows ?? []) as T[]);
        });
      });
    });

    return withTimeout(execPromise, timeoutMs, location);
  }
}
