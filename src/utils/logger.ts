import { config } from '../config';
import util from 'util';
import fs from 'fs';
import path from 'path';

const isDevelopment = config.NODE_ENV === 'development';
const logLevel = config.LOG_LEVEL; // 'info', 'debug', 'extra-high'

// ── File logging setup ────────────────────────────────────────────────────────
const LOGS_DIR = path.resolve(process.cwd(), 'logs');

if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

/**
 * Log file path fixed at process-start time so that all writes within
 * a single session go to the same file, and every new run (even on the
 * same day) gets its own file.  Format: YYYY-MM-DD_HH-MM.log
 */
const SESSION_LOG_FILE = (() => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = now.toISOString().slice(0, 10);           // "YYYY-MM-DD"
  const hour = pad(now.getHours());
  const minute = pad(now.getMinutes());
  return path.join(LOGS_DIR, `${date}_${hour}-${minute}.log`);
})();

/** Strip ANSI escape codes so log files stay clean and human-readable */
const stripAnsi = (str: string): string =>
  str.replace(/\u001B\[[0-9;]*m/g, '');

/** Append a single line to the session log file (non-blocking) */
const writeToFile = (line: string): void => {
  const cleanLine = stripAnsi(line);
  fs.appendFile(SESSION_LOG_FILE, cleanLine + '\n', 'utf8', (err) => {
    if (err) {
      // Avoid infinite recursion – write directly to stderr
      process.stderr.write(`[LOGGER] Failed to write to log file: ${err.message}\n`);
    }
  });
};

// ── Argument formatter ────────────────────────────────────────────────────────
const formatArgs = (args: unknown[]): string[] => {
  return args.map(arg => {
    if (typeof arg === 'object' && arg !== null) {
      return util.inspect(arg, { depth: null, colors: true, showHidden: false });
    }
    return String(arg);
  });
};

/** Build the full log line (prefix + message + extra args) */
const buildLine = (level: string, message: string, args: unknown[]): string => {
  const timestamp = new Date().toISOString();
  const extras = formatArgs(args);
  const parts = [`[${level}] ${timestamp} - ${message}`, ...extras];
  return parts.join(' ');
};

// ── Logger ────────────────────────────────────────────────────────────────────
export const logger = {
  debug: (message: string, ...args: unknown[]) => {
    if (isDevelopment || logLevel === 'debug' || logLevel === 'extra-high') {
      const line = buildLine('DEBUG', message, args);
      console.log(line);
      writeToFile(line);
    }
  },

  info: (message: string, ...args: unknown[]) => {
    const line = buildLine('INFO', message, args);
    console.log(line);
    writeToFile(line);
  },

  error: (message: string, ...args: unknown[]) => {
    const line = buildLine('ERROR', message, args);
    console.error(line);
    writeToFile(line);
  },

  warn: (message: string, ...args: unknown[]) => {
    const line = buildLine('WARN', message, args);
    console.warn(line);
    writeToFile(line);
  },

  table: (data: unknown, properties?: string[]) => {
    if (isDevelopment || logLevel === 'extra-high') {
      console.table(data, properties);
      // Serialize table data to the log file as JSON
      const timestamp = new Date().toISOString();
      const line = `[TABLE] ${timestamp} - ${JSON.stringify(data, null, 2)}`;
      writeToFile(line);
    }
  },
};

