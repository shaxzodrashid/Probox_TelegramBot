/* eslint-disable no-console */
import axios from 'axios';
import dotenv from 'dotenv';
import { formatGeminiRequestFailure } from '../utils/gemini-error.util';

dotenv.config();

const DEFAULT_TIMEOUT_MS = 10000;
const GEMINI_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const printUsage = (): void => {
  console.log('Usage: npm run check:gemini');
  console.log('');
  console.log('Checks Gemini API access with a lightweight models.list request.');
  console.log('Reads GEMINI_API_KEY from the environment or .env file.');
  console.log('');
  console.log('Optional environment variables:');
  console.log(`  GEMINI_REQUEST_TIMEOUT_MS   Request timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS})`);
};

const getTimeoutMs = (): number => {
  const raw = process.env.GEMINI_REQUEST_TIMEOUT_MS;
  const parsed = raw ? parseInt(raw, 10) : DEFAULT_TIMEOUT_MS;

  if (!Number.isFinite(parsed) || parsed < 1000) {
    return DEFAULT_TIMEOUT_MS;
  }

  return parsed;
};

const maskApiKey = (apiKey: string): string => {
  if (apiKey.length <= 8) {
    return '[REDACTED]';
  }

  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
};

const extractErrorMessage = (data: unknown): string | null => {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return null;
  }

  const error = (data as { error?: { message?: unknown; status?: unknown } }).error;
  if (!error) {
    return null;
  }

  const message = typeof error.message === 'string' ? error.message : null;
  const status = typeof error.status === 'string' ? error.status : null;

  if (message && status) {
    return `${status}: ${message}`;
  }

  return message || status;
};

const describeStatus = (status: number): string => {
  if (status === 200) {
    return 'Gemini API key is valid and the project can reach the API.';
  }

  if (status === 401 || status === 403) {
    return 'Gemini API key is invalid, blocked, restricted, or does not have access to this API.';
  }

  if (status === 429) {
    return 'Gemini API key is accepted, but the project is currently rate-limited or quota-exhausted.';
  }

  if (status >= 500) {
    return 'Gemini API is currently unavailable or returned a server-side error.';
  }

  return 'Gemini API returned an unexpected response.';
};

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not configured.');
    process.exitCode = 1;
    return;
  }

  const timeoutMs = getTimeoutMs();

  console.log(`Checking Gemini API access via models.list using key ${maskApiKey(apiKey)}...`);
  console.log('This probe does not send prompt or embedding content, but it may still count toward request-based rate limits.');

  try {
    const response = await axios.get<{
      models?: Array<{ name?: string }>;
    }>(GEMINI_MODELS_URL, {
      headers: {
        'x-goog-api-key': apiKey,
      },
      params: {
        pageSize: 1,
      },
      timeout: timeoutMs,
      validateStatus: () => true,
    });

    const summary = describeStatus(response.status);
    const details = extractErrorMessage(response.data);

    if (response.status === 200) {
      const firstModel = response.data.models?.[0]?.name || 'unknown';
      console.log(summary);
      console.log(`HTTP ${response.status}. First visible model: ${firstModel}`);
      return;
    }

    console.error(summary);
    console.error(`HTTP ${response.status}${details ? `: ${details}` : ''}`);
    process.exitCode = 1;
  } catch (error) {
    console.error(`Failed to reach Gemini API: ${formatGeminiRequestFailure(error)}`);
    process.exitCode = 1;
  }
}

void main();
