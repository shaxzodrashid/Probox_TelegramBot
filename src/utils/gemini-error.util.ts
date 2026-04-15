import axios from 'axios';

const redactSensitiveUrl = (value: string): string =>
  value.replace(/([?&]key=)[^&\s]+/gi, '$1[REDACTED]');

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
