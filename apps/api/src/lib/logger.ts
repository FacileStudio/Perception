import type { Context, Next } from 'hono';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogData = Record<string, unknown>;

interface Logger {
  debug(msg: string, data?: LogData): void;
  info(msg: string, data?: LogData): void;
  warn(msg: string, data?: LogData): void;
  error(msg: string, data?: LogData): void;
  child(defaults: LogData): Logger;
}

function createLogger(defaults: LogData = {}): Logger {
  const emit = (level: LogLevel, msg: string, data?: LogData) => {
    const entry = { ts: new Date().toISOString(), level, msg, ...defaults, ...data };
    process.stdout.write(JSON.stringify(entry) + '\n');
  };

  return {
    debug: (msg, data?) => emit('debug', msg, data),
    info: (msg, data?) => emit('info', msg, data),
    warn: (msg, data?) => emit('warn', msg, data),
    error: (msg, data?) => emit('error', msg, data),
    child: (extra) => createLogger({ ...defaults, ...extra }),
  };
}

export const log = createLogger();

export function structuredLogger() {
  return async (c: Context, next: Next) => {
    const start = Date.now();
    await next();
    log.info('request', {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration_ms: Date.now() - start,
    });
  };
}
