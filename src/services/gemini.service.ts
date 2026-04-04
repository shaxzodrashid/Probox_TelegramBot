import axios, { AxiosError, AxiosInstance } from 'axios';
import { config } from '../config';

interface GeminiGeneratePart {
  text?: string;
}

interface GeminiGenerateCandidate {
  content?: {
    parts?: GeminiGeneratePart[];
  };
}

interface GeminiGenerateResponse {
  candidates?: GeminiGenerateCandidate[];
}

interface GeminiEmbedValues {
  values?: number[];
}

interface GeminiEmbedResponse {
  embedding?: GeminiEmbedValues;
}

const TRANSIENT_GEMINI_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const TRANSIENT_GEMINI_ERROR_CODES = new Set([
  'ECONNABORTED',
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
  'EAI_AGAIN',
]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class GeminiService {
  private static readonly client: AxiosInstance = axios.create({
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/models',
    timeout: 30000,
  });
  private static readonly maxRetries = 2;

  private static getApiKey(): string {
    if (!config.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    return config.GEMINI_API_KEY;
  }

  private static isRetryableError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) {
      return false;
    }

    const axiosError = error as AxiosError;
    const status = axiosError.response?.status;
    if (status && TRANSIENT_GEMINI_STATUS_CODES.has(status)) {
      return true;
    }

    const code = axiosError.code?.toUpperCase();
    return code ? TRANSIENT_GEMINI_ERROR_CODES.has(code) : false;
  }

  private static async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let attempt = 0;

    while (true) {
      try {
        return await operation();
      } catch (error) {
        if (attempt >= this.maxRetries || !this.isRetryableError(error)) {
          throw error;
        }

        attempt += 1;
        await sleep(500 * attempt);
      }
    }
  }

  static async generateJson<T>(params: {
    model?: string;
    prompt: string;
    schemaName: string;
  }): Promise<T> {
    const model = params.model || config.GEMINI_TEXT_MODEL;
    const response = await this.withRetry(() =>
      this.client.post<GeminiGenerateResponse>(
        `/${model}:generateContent`,
        {
          contents: [
            {
              parts: [{ text: params.prompt }],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
          },
        },
        {
          params: {
            key: this.getApiKey(),
          },
        },
      ),
    );

    const text = response.data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim();

    if (!text) {
      throw new Error(`Gemini returned an empty ${params.schemaName} payload`);
    }

    try {
      return JSON.parse(text) as T;
    } catch (error) {
      throw new Error(`Failed to parse Gemini ${params.schemaName} JSON: ${String(error)}`);
    }
  }

  static async embedText(params: {
    text: string;
    taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';
    outputDimensionality?: number;
  }): Promise<number[]> {
    const model = config.GEMINI_EMBEDDING_MODEL;
    const response = await this.withRetry(() =>
      this.client.post<GeminiEmbedResponse>(
        `/${model}:embedContent`,
        {
          model: `models/${model}`,
          content: {
            parts: [{ text: params.text }],
          },
          taskType: params.taskType,
          outputDimensionality: params.outputDimensionality || config.FAQ_EMBEDDING_DIM,
        },
        {
          params: {
            key: this.getApiKey(),
          },
        },
      ),
    );

    const values = response.data.embedding?.values;
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error('Gemini returned an empty embedding');
    }

    return values;
  }
}
