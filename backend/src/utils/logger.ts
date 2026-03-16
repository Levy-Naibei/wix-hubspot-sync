import { createLogger, format, transports } from 'winston';
import { config } from '../configs/index.js';

const REDACTED = '[REDACTED]';

// Strip sensitive keys from log metadata
function sanitize(obj: unknown): unknown {
  if (typeof obj !== 'object' || obj === null) return obj;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    if (
      lower.includes('token') ||
      lower.includes('secret') ||
      lower.includes('password') ||
      lower.includes('key') ||
      lower.includes('email') ||
      lower.includes('phone')
    ) {
      result[key] = REDACTED;
    } else {
      result[key] = sanitize(value);
    }
  }
  return result;
}

// Vercel's filesystem is read-only except for /tmp.
// Gracefully fall back to Console-only if file transports fail.
function buildFileTransports(): transports.FileTransportInstance[] {
  try {
    const logDir = '/tmp/logs';
    return [
      new transports.File({ filename: `${logDir}/error.log`, level: 'error' }),
      new transports.File({ filename: `${logDir}/combined.log` }),
    ];
  } catch {
    return [];
  }
}

export const logger = createLogger({
  level: config.isProd ? 'info' : 'debug',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.printf(({ level, message, timestamp, ...meta }) => {
      const safeMeta = sanitize(meta);
      const metaStr = Object.keys(safeMeta as object).length
        ? ' ' + JSON.stringify(safeMeta)
        : '';
      return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
    }),
  ),
  transports: [
    new transports.Console(),
    ...(config.isProd ? buildFileTransports() : []),
  ],
});