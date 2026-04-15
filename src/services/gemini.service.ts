import axios, { AxiosError, AxiosInstance } from 'axios';
import { config } from '../config';

interface GeminiGeneratePart {
  text?: string;
  thoughtSignature?: string;
  functionCall?: {
    id?: string;
    name?: string;
    args?: Record<string, unknown>;
  };
}

interface GeminiGenerateCandidate {
  content?: {
    role?: string;
    parts?: GeminiGeneratePart[];
  };
  finishReason?: string;
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

export interface GeminiToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface GeminiTool {
  declaration: GeminiToolDeclaration;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export class GeminiService {
  private static readonly client: AxiosInstance = axios.create({
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/models',
    timeout: config.GEMINI_REQUEST_TIMEOUT_MS,
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

  static async generateJsonWithTools<T>(params: {
    model?: string;
    prompt: string;
    schemaName: string;
    tools: GeminiTool[];
    maxToolIterations?: number;
  }): Promise<T> {
    if (params.tools.length === 0) {
      return this.generateJson<T>({
        model: params.model,
        prompt: params.prompt,
        schemaName: params.schemaName,
      });
    }

    const model = params.model || config.GEMINI_TEXT_MODEL;
    const maxToolIterations = Math.max(1, params.maxToolIterations || 3);
    const toolMap = new Map(params.tools.map((tool) => [tool.declaration.name, tool]));
    const contents: Array<{
      role: string;
      parts: Array<Record<string, unknown>>;
    }> = [
      {
        role: 'user',
        parts: [{ text: params.prompt }],
      },
    ];

    for (let iteration = 0; iteration < maxToolIterations; iteration += 1) {
      const response = await this.withRetry(() =>
        this.client.post<GeminiGenerateResponse>(
          `/${model}:generateContent`,
          {
            contents,
            tools: [
              {
                functionDeclarations: params.tools.map((tool) => tool.declaration),
              },
            ],
          },
          {
            params: {
              key: this.getApiKey(),
            },
          },
        ),
      );

      const candidate = response.data.candidates?.[0];
      const candidateContent = candidate?.content;
      const parts = candidateContent?.parts || [];
      const functionCalls = parts
        .map((part) => part.functionCall)
        .filter((call): call is NonNullable<GeminiGeneratePart['functionCall']> => Boolean(call?.name));

      if (functionCalls.length === 0) {
        const text = parts
          .map((part) => part.text || '')
          .join('')
          .trim();

        if (!text) {
          const finishReason = candidate?.finishReason ? ` (finishReason=${candidate.finishReason})` : '';
          throw new Error(`Gemini returned an empty ${params.schemaName} payload${finishReason}`);
        }

        try {
          return JSON.parse(text) as T;
        } catch (error) {
          throw new Error(`Failed to parse Gemini ${params.schemaName} JSON: ${String(error)}`);
        }
      }

      if (!candidateContent) {
        throw new Error(`Gemini returned tool calls without content for ${params.schemaName}`);
      }

      contents.push({
        role: candidateContent.role || 'model',
        parts: candidateContent.parts?.map((part) => ({ ...part })) || [],
      });

      const functionResponseParts: Array<Record<string, unknown>> = [];

      for (const functionCall of functionCalls) {
        const tool = toolMap.get(functionCall.name || '');
        if (!tool) {
          throw new Error(`Gemini requested unsupported tool: ${functionCall.name || 'unknown'}`);
        }

        const rawArgs = isRecord(functionCall.args) ? functionCall.args : {};

        let toolResult: unknown;
        try {
          toolResult = await tool.execute(rawArgs);
        } catch (error) {
          toolResult = {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }

        functionResponseParts.push({
          functionResponse: {
            name: functionCall.name,
            response: toolResult,
            ...(functionCall.id ? { id: functionCall.id } : {}),
          },
        });
      }

      contents.push({
        role: 'user',
        parts: functionResponseParts,
      });
    }

    throw new Error(`Gemini ${params.schemaName} exceeded the tool iteration limit`);
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
