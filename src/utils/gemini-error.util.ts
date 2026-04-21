import axios from 'axios';

const redactSensitiveUrl = (value: string): string =>
  value.replace(/([?&]key=)[^&\s]+/gi, '$1[REDACTED]');

const MAX_LOG_VALUE_LENGTH = 1200;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const redactSensitiveValue = (key: string, value: unknown): unknown => {
  if (/api[_-]?key|token|authorization|password|secret|key/i.test(key)) {
    return '[REDACTED]';
  }

  if (typeof value === 'string') {
    return redactSensitiveUrl(value);
  }

  return value;
};

const stringifyForLog = (value: unknown): string => {
  let serialized: string;

  if (typeof value === 'string') {
    serialized = redactSensitiveUrl(value);
  } else {
    try {
      serialized = JSON.stringify(value, redactSensitiveValue);
    } catch {
      serialized = String(value);
    }
  }

  return serialized.length <= MAX_LOG_VALUE_LENGTH
    ? serialized
    : `${serialized.slice(0, MAX_LOG_VALUE_LENGTH - 3)}...`;
};

const parseRequestBody = (data: unknown): Record<string, unknown> | null => {
  if (isRecord(data)) {
    return data;
  }

  if (typeof data !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(data);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const summarizePartTypes = (parts: unknown): string[] => {
  if (!Array.isArray(parts)) {
    return [];
  }

  return parts.map((part) => {
    if (!isRecord(part)) {
      return typeof part;
    }

    if (isRecord(part.functionCall)) {
      return `functionCall:${String(part.functionCall.name || 'unknown')}`;
    }

    if (isRecord(part.functionResponse)) {
      return `functionResponse:${String(part.functionResponse.name || 'unknown')}`;
    }

    if (typeof part.text === 'string') {
      return 'text';
    }

    return Object.keys(part).sort().join('+') || 'unknown';
  });
};

const summarizeGeminiRequestBody = (data: unknown): string | null => {
  const body = parseRequestBody(data);
  if (!body) {
    return null;
  }

  const generationConfig = isRecord(body.generationConfig) ? body.generationConfig : null;
  const toolConfig = isRecord(body.toolConfig) ? body.toolConfig : null;
  const functionCallingConfig = isRecord(toolConfig?.functionCallingConfig)
    ? toolConfig.functionCallingConfig
    : null;
  const tools = Array.isArray(body.tools) ? body.tools : [];
  const functionNames = tools.flatMap((tool) => {
    if (!isRecord(tool) || !Array.isArray(tool.functionDeclarations)) {
      return [];
    }

    return tool.functionDeclarations
      .filter(isRecord)
      .map((declaration) => String(declaration.name || 'unknown'));
  });
  const contents = Array.isArray(body.contents) ? body.contents : [];
  const contentSummary = contents.map((content, index) => {
    if (!isRecord(content)) {
      return { index, role: 'unknown', partTypes: [] };
    }

    return {
      index,
      role: typeof content.role === 'string' ? content.role : 'unspecified',
      partTypes: summarizePartTypes(content.parts),
    };
  });
  const systemInstruction = isRecord(body.systemInstruction) ? body.systemInstruction : null;
  const systemInstructionParts = Array.isArray(systemInstruction?.parts)
    ? systemInstruction.parts.length
    : 0;

  return stringifyForLog({
    contents: {
      count: contents.length,
      summary: contentSummary,
    },
    systemInstructionParts,
    structuredOutput: Boolean(
      generationConfig?.responseMimeType || generationConfig?.responseJsonSchema,
    ),
    responseMimeType: generationConfig?.responseMimeType || null,
    responseJsonSchema: generationConfig?.responseJsonSchema ? 'present' : 'absent',
    functionCalling: {
      enabled: functionNames.length > 0,
      mode: functionCallingConfig?.mode || null,
      allowedFunctionNames: functionCallingConfig?.allowedFunctionNames || null,
      toolCount: functionNames.length,
      toolNames: functionNames,
    },
  });
};

export const formatGeminiRequestFailure = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const details: string[] = [];
    const message = error.message || 'Axios error';
    const code = error.code ? `code=${error.code}` : '';
    const status = error.response?.status ? `status=${error.response.status}` : '';
    const baseUrl = typeof error.config?.baseURL === 'string' ? error.config.baseURL : '';
    const urlPath = typeof error.config?.url === 'string' ? error.config.url : '';
    const requestUrl = urlPath ? redactSensitiveUrl(`${baseUrl}${urlPath}`) : '';

    details.push([message, code, status].filter(Boolean).join(' '));
    if (requestUrl) {
      details.push(`url=${requestUrl}`);
    }

    if (error.response?.data) {
      details.push(`response=${stringifyForLog(error.response.data)}`);
    }

    const requestSummary = summarizeGeminiRequestBody(error.config?.data);
    if (requestSummary) {
      details.push(`request=${requestSummary}`);
    }

    return details.join(' | ');
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown Gemini request failure';
};
