// ============================================================
// Logger for Worker — minimal structured logger
// ============================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function log(level: LogLevel, prefix: string, msg: string, extra?: Record<string, unknown>) {
  if (LEVELS[level] < LEVELS[currentLevel]) return;
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level.toUpperCase()}] [${prefix}] ${msg}`;
  if (extra) {
    console.log(line, JSON.stringify(extra));
  } else {
    console.log(line);
  }
}

export function createLogger(tag: string) {
  return {
    debug: (msg: string, extra?: Record<string, unknown>) => log('debug', tag, msg, extra),
    info: (msg: string, extra?: Record<string, unknown>) => log('info', tag, msg, extra),
    warn: (msg: string, extra?: Record<string, unknown>) => log('warn', tag, msg, extra),
    error: (msg: string, extra?: Record<string, unknown>) => log('error', tag, msg, extra)
  };
}
