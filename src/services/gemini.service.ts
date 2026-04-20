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

export type GeminiFunctionCallingMode = 'AUTO' | 'VALIDATED' | 'ANY' | 'NONE';

export interface GeminiFunctionCallingConfig {
  mode?: GeminiFunctionCallingMode;
  allowedFunctionNames?: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sortRecordKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => sortRecordKeys(entry));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .reduce<Record<string, unknown>>((accumulator, key) => {
      accumulator[key] = sortRecordKeys(value[key]);
      return accumulator;
    }, {});
};

const buildToolCallFingerprint = (name: string, args: Record<string, unknown>): string =>
  `${name}:${JSON.stringify(sortRecordKeys(args))}`;

const dedupeStrings = (values: string[]): string[] => {
  const seen = new Set<string>();
  const uniqueValues: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    uniqueValues.push(normalized);
  }

  return uniqueValues;
};

const NON_STANDARD_JSON_KEYWORDS: Record<string, string> = {
  true: 'true',
  false: 'false',
  null: 'null',
  none: 'null',
  undefined: 'null',
};

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

  private static extractJsonValues(text: string): string[] {
    const candidates: string[] = [];

    for (let startIndex = 0; startIndex < text.length; startIndex += 1) {
      const startChar = text[startIndex];
      if (startChar !== '{' && startChar !== '[') {
        continue;
      }

      const stack = [startChar];
      let activeQuote: '"' | "'" | null = null;
      let isEscaped = false;

      for (let cursor = startIndex + 1; cursor < text.length; cursor += 1) {
        const currentChar = text[cursor];

        if (activeQuote) {
          if (isEscaped) {
            isEscaped = false;
            continue;
          }

          if (currentChar === '\\') {
            isEscaped = true;
            continue;
          }

          if (currentChar === activeQuote) {
            if (activeQuote === "'" && !this.shouldCloseSingleQuotedString(text, cursor)) {
              continue;
            }

            activeQuote = null;
          }

          continue;
        }

        if (currentChar === '"' || currentChar === "'") {
          activeQuote = currentChar;
          continue;
        }

        if (currentChar === '{' || currentChar === '[') {
          stack.push(currentChar);
          continue;
        }

        if (currentChar !== '}' && currentChar !== ']') {
          continue;
        }

        const expectedStartChar = currentChar === '}' ? '{' : '[';
        if (stack[stack.length - 1] !== expectedStartChar) {
          break;
        }

        stack.pop();
        if (stack.length === 0) {
          candidates.push(text.slice(startIndex, cursor + 1).trim());
          break;
        }
      }
    }

    return dedupeStrings(candidates);
  }

  private static buildJsonCandidates(text: string): string[] {
    const normalized = text.replace(/^\uFEFF/, '').trim();
    const candidates = [normalized];
    const fullFenceMatch = normalized.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

    if (fullFenceMatch?.[1]) {
      candidates.push(fullFenceMatch[1]);
    }

    for (const fenceMatch of normalized.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)) {
      if (fenceMatch[1]) {
        candidates.push(fenceMatch[1]);
      }
    }

    candidates.push(...this.extractJsonValues(normalized));

    return dedupeStrings(candidates);
  }

  private static normalizeQuoteCharacters(text: string): string {
    return text
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"');
  }

  private static isWhitespaceCharacter(char: string | undefined): boolean {
    return Boolean(char && /\s/.test(char));
  }

  private static shouldCloseSingleQuotedString(text: string, quoteIndex: number): boolean {
    let cursor = quoteIndex + 1;
    while (cursor < text.length && this.isWhitespaceCharacter(text[cursor])) {
      cursor += 1;
    }

    const nextChar = text[cursor];
    return (
      !nextChar || nextChar === ',' || nextChar === '}' || nextChar === ']' || nextChar === ':'
    );
  }

  private static normalizeJsonLikeText(text: string): string | null {
    const normalized = this.normalizeQuoteCharacters(text).replace(/\r\n?/g, '\n');
    let result = '';
    let activeQuote: '"' | "'" | null = null;
    let isEscaped = false;

    for (let index = 0; index < normalized.length; index += 1) {
      const currentChar = normalized[index] as string;
      const nextChar = normalized[index + 1];

      if (activeQuote) {
        if (isEscaped) {
          result += currentChar;
          isEscaped = false;
          continue;
        }

        if (currentChar === '\\') {
          result += currentChar;
          isEscaped = true;
          continue;
        }

        if (currentChar === '\n') {
          result += '\\n';
          continue;
        }

        if (currentChar === activeQuote) {
          if (activeQuote === "'" && !this.shouldCloseSingleQuotedString(normalized, index)) {
            result += currentChar;
            continue;
          }

          result += '"';
          activeQuote = null;
          continue;
        }

        if (activeQuote === "'" && currentChar === '"') {
          result += '\\"';
          continue;
        }

        result += currentChar;
        continue;
      }

      if (currentChar === '/' && nextChar === '/') {
        while (index < normalized.length && normalized[index] !== '\n') {
          index += 1;
        }

        if (normalized[index] === '\n') {
          result += '\n';
        }
        continue;
      }

      if (currentChar === '/' && nextChar === '*') {
        index += 2;
        while (
          index < normalized.length &&
          !(normalized[index] === '*' && normalized[index + 1] === '/')
        ) {
          index += 1;
        }
        index += 1;
        continue;
      }

      if (currentChar === '"' || currentChar === "'") {
        activeQuote = currentChar;
        result += '"';
        continue;
      }

      result += currentChar;
    }

    if (activeQuote || isEscaped) {
      return null;
    }

    return result.trim();
  }

  private static quoteUnquotedJsonKeys(text: string): string {
    let result = '';
    let inString = false;
    let isEscaped = false;

    for (let index = 0; index < text.length; index += 1) {
      const currentChar = text[index] as string;

      if (inString) {
        result += currentChar;

        if (isEscaped) {
          isEscaped = false;
          continue;
        }

        if (currentChar === '\\') {
          isEscaped = true;
          continue;
        }

        if (currentChar === '"') {
          inString = false;
        }

        continue;
      }

      if (currentChar === '"') {
        inString = true;
        result += currentChar;
        continue;
      }

      if (currentChar !== '{' && currentChar !== ',') {
        result += currentChar;
        continue;
      }

      result += currentChar;

      let cursor = index + 1;
      while (cursor < text.length && this.isWhitespaceCharacter(text[cursor])) {
        result += text[cursor];
        cursor += 1;
      }

      if (text[cursor] === '"') {
        index = cursor - 1;
        continue;
      }

      const keyMatch = text.slice(cursor).match(/^([A-Za-z_$][A-Za-z0-9_$-]*)(\s*:)/);
      if (!keyMatch) {
        index = cursor - 1;
        continue;
      }

      result += `"${keyMatch[1]}"${keyMatch[2]}`;
      index = cursor + keyMatch[0].length - 1;
    }

    return result;
  }

  private static normalizeNonStandardJsonKeywords(text: string): string {
    let result = '';
    let inString = false;
    let isEscaped = false;

    for (let index = 0; index < text.length; index += 1) {
      const currentChar = text[index] as string;

      if (inString) {
        result += currentChar;

        if (isEscaped) {
          isEscaped = false;
          continue;
        }

        if (currentChar === '\\') {
          isEscaped = true;
          continue;
        }

        if (currentChar === '"') {
          inString = false;
        }

        continue;
      }

      if (currentChar === '"') {
        inString = true;
        result += currentChar;
        continue;
      }

      if (!/[A-Za-z]/.test(currentChar)) {
        result += currentChar;
        continue;
      }

      let cursor = index + 1;
      while (cursor < text.length && /[A-Za-z]/.test(text[cursor] as string)) {
        cursor += 1;
      }

      const token = text.slice(index, cursor);
      const replacement = NON_STANDARD_JSON_KEYWORDS[token.toLowerCase()];
      result += replacement || token;
      index = cursor - 1;
    }

    return result;
  }

  private static removeTrailingJsonCommas(text: string): string {
    let result = '';
    let inString = false;
    let isEscaped = false;

    for (let index = 0; index < text.length; index += 1) {
      const currentChar = text[index] as string;

      if (inString) {
        result += currentChar;

        if (isEscaped) {
          isEscaped = false;
          continue;
        }

        if (currentChar === '\\') {
          isEscaped = true;
          continue;
        }

        if (currentChar === '"') {
          inString = false;
        }

        continue;
      }

      if (currentChar === '"') {
        inString = true;
        result += currentChar;
        continue;
      }

      if (currentChar !== ',') {
        result += currentChar;
        continue;
      }

      let cursor = index + 1;
      while (cursor < text.length && this.isWhitespaceCharacter(text[cursor])) {
        cursor += 1;
      }

      const nextChar = text[cursor];
      if (nextChar === '}' || nextChar === ']') {
        continue;
      }

      result += currentChar;
    }

    return result;
  }

  private static repairJsonCandidate(text: string): string | null {
    const normalized = this.normalizeJsonLikeText(text);
    if (!normalized) {
      return null;
    }

    const repaired = this.removeTrailingJsonCommas(
      this.normalizeNonStandardJsonKeywords(this.quoteUnquotedJsonKeys(normalized)),
    ).trim();

    return repaired || null;
  }

  private static parseJsonPayload<T>(text: string, schemaName: string): T {
    let lastError: unknown = null;

    for (const candidate of this.buildJsonCandidates(text)) {
      try {
        return JSON.parse(candidate) as T;
      } catch (error) {
        lastError = error;
      }

      const repairedCandidate = this.repairJsonCandidate(candidate);
      if (!repairedCandidate || repairedCandidate === candidate) {
        continue;
      }

      try {
        return JSON.parse(repairedCandidate) as T;
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(`Failed to parse Gemini ${schemaName} JSON: ${String(lastError)}`);
  }

  private static buildSystemInstruction(
    value: string | string[] | undefined,
  ): { parts: Array<{ text: string }> } | undefined {
    if (!value) {
      return undefined;
    }

    const parts = (Array.isArray(value) ? value : [value])
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => ({ text }));

    return parts.length > 0 ? { parts } : undefined;
  }

  static async generateJson<T>(params: {
    model?: string;
    prompt: string;
    schemaName: string;
    systemInstruction?: string | string[];
    responseSchema?: Record<string, unknown>;
  }): Promise<T> {
    const model = params.model || config.GEMINI_TEXT_MODEL;
    const systemInstruction = this.buildSystemInstruction(params.systemInstruction);
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
            ...(params.responseSchema ? { responseJsonSchema: params.responseSchema } : {}),
          },
          ...(systemInstruction ? { systemInstruction } : {}),
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

    return this.parseJsonPayload<T>(text, params.schemaName);
  }

  private static async finalizeToolConversation<T>(params: {
    model: string;
    schemaName: string;
    contents: Array<{
      role: string;
      parts: Array<Record<string, unknown>>;
    }>;
    responseSchema?: Record<string, unknown>;
    systemInstruction?: string | string[];
    reason: string;
  }): Promise<T> {
    const systemInstruction = this.buildSystemInstruction(params.systemInstruction);
    const generationConfig = params.responseSchema
      ? {
          responseMimeType: 'application/json',
          responseJsonSchema: params.responseSchema,
        }
      : undefined;

    const response = await this.withRetry(() =>
      this.client.post<GeminiGenerateResponse>(
        `/${params.model}:generateContent`,
        {
          contents: [
            ...params.contents,
            {
              role: 'user',
              parts: [
                {
                  text: `Return the final ${params.schemaName} JSON now using only the grounded context already in this conversation. Do not call any more tools. Reason: ${params.reason}`,
                },
              ],
            },
          ],
          ...(generationConfig ? { generationConfig } : {}),
          ...(systemInstruction ? { systemInstruction } : {}),
        },
        {
          params: {
            key: this.getApiKey(),
          },
        },
      ),
    );

    const candidate = response.data.candidates?.[0];
    const text = candidate?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim();

    if (!text) {
      const finishReason = candidate?.finishReason
        ? ` (finishReason=${candidate.finishReason})`
        : '';
      throw new Error(
        `Gemini returned an empty ${params.schemaName} payload during finalization${finishReason}`,
      );
    }

    return this.parseJsonPayload<T>(text, params.schemaName);
  }

  static async generateJsonWithTools<T>(params: {
    model?: string;
    prompt: string;
    schemaName: string;
    tools: GeminiTool[];
    maxToolIterations?: number;
    systemInstruction?: string | string[];
    responseSchema?: Record<string, unknown>;
    functionCallingConfig?: GeminiFunctionCallingConfig;
  }): Promise<T> {
    if (params.tools.length === 0) {
      return this.generateJson<T>({
        model: params.model,
        prompt: params.prompt,
        schemaName: params.schemaName,
        systemInstruction: params.systemInstruction,
        responseSchema: params.responseSchema,
      });
    }

    const model = params.model || config.GEMINI_TEXT_MODEL;
    const maxToolIterations = Math.max(1, params.maxToolIterations || 3);
    const toolMap = new Map(params.tools.map((tool) => [tool.declaration.name, tool]));
    const toolResultCache = new Map<string, unknown>();
    const systemInstruction = this.buildSystemInstruction(params.systemInstruction);
    const functionCallingConfig = params.functionCallingConfig;
    const generationConfig = params.responseSchema
      ? {
          responseMimeType: 'application/json',
          responseJsonSchema: params.responseSchema,
        }
      : undefined;
    // Structured outputs shape Gemini's final response payload.
    // Function calling config independently controls whether Gemini should call our tools first.
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
            ...(systemInstruction ? { systemInstruction } : {}),
            ...(generationConfig ? { generationConfig } : {}),
            ...(functionCallingConfig
              ? {
                  toolConfig: {
                    functionCallingConfig,
                  },
                }
              : {}),
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
        .filter((call): call is NonNullable<GeminiGeneratePart['functionCall']> =>
          Boolean(call?.name),
        );

      if (functionCalls.length === 0) {
        const text = parts
          .map((part) => part.text || '')
          .join('')
          .trim();

        if (!text) {
          const finishReason = candidate?.finishReason
            ? ` (finishReason=${candidate.finishReason})`
            : '';
          throw new Error(`Gemini returned an empty ${params.schemaName} payload${finishReason}`);
        }

        return this.parseJsonPayload<T>(text, params.schemaName);
      }

      if (!candidateContent) {
        throw new Error(`Gemini returned tool calls without content for ${params.schemaName}`);
      }

      contents.push({
        role: candidateContent.role || 'model',
        parts: candidateContent.parts?.map((part) => ({ ...part })) || [],
      });

      const functionResponseParts: Array<Record<string, unknown>> = [];
      const duplicateToolCallNames: string[] = [];
      let executedFreshToolCall = false;

      for (const functionCall of functionCalls) {
        const tool = toolMap.get(functionCall.name || '');
        if (!tool) {
          throw new Error(`Gemini requested unsupported tool: ${functionCall.name || 'unknown'}`);
        }

        const rawArgs = isRecord(functionCall.args) ? functionCall.args : {};
        const fingerprint = buildToolCallFingerprint(functionCall.name || '', rawArgs);

        let toolResult: unknown;
        if (toolResultCache.has(fingerprint)) {
          toolResult = toolResultCache.get(fingerprint);
          duplicateToolCallNames.push(functionCall.name || 'unknown');
        } else {
          try {
            toolResult = await tool.execute(rawArgs);
          } catch (error) {
            toolResult = {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            };
          }

          toolResultCache.set(fingerprint, toolResult);
          executedFreshToolCall = true;
        }

        functionResponseParts.push({
          functionResponse: {
            name: functionCall.name,
            response: toolResult,
            ...(functionCall.id ? { id: functionCall.id } : {}),
          },
        });
      }

      if (duplicateToolCallNames.length > 0) {
        const uniqueDuplicateToolCallNames = dedupeStrings(duplicateToolCallNames);
        const guidance =
          uniqueDuplicateToolCallNames.length === 1
            ? `Duplicate call to ${uniqueDuplicateToolCallNames[0]} was not re-executed because the same grounded result was already returned earlier in this conversation.`
            : `Duplicate calls to ${uniqueDuplicateToolCallNames.join(', ')} were not re-executed because the same grounded results were already returned earlier in this conversation.`;

        functionResponseParts.push({
          text: `${guidance} Use the existing grounded tool results and finish the JSON reply unless you truly need a different tool call.`,
        });
      }

      if (!executedFreshToolCall && duplicateToolCallNames.length === functionCalls.length) {
        functionResponseParts.push({
          text: 'No new tool executions were performed in this turn because every requested tool call duplicated an earlier one.',
        });
      }

      contents.push({
        role: 'user',
        parts: functionResponseParts,
      });

      if (!executedFreshToolCall) {
        return this.finalizeToolConversation<T>({
          model,
          schemaName: params.schemaName,
          contents,
          responseSchema: params.responseSchema,
          systemInstruction: params.systemInstruction,
          reason:
            'The model only requested duplicate tool calls, so it must answer from the existing grounded results.',
        });
      }
    }

    return this.finalizeToolConversation<T>({
      model,
      schemaName: params.schemaName,
      contents,
      responseSchema: params.responseSchema,
      systemInstruction: params.systemInstruction,
      reason:
        'The tool iteration budget is exhausted, so the final answer must be composed from the grounded tool results already collected.',
    });
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
