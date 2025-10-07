export type LogLevel = "silent" | "error" | "warn" | "info" | "debug";

const levelOrder: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

export interface Logger {
  level: LogLevel;
  error: (message: string, meta?: unknown) => void;
  warn: (message: string, meta?: unknown) => void;
  info: (message: string, meta?: unknown) => void;
  debug: (message: string, meta?: unknown) => void;
}

function shouldLog(current: LogLevel, target: LogLevel): boolean {
  return levelOrder[current] >= levelOrder[target];
}

function emit(level: LogLevel, message: string, meta?: unknown) {
  const payload = meta === undefined ? message : `${message} ${JSON.stringify(meta)}`;
  process.stderr.write(`[${level}] ${payload}\n`);
}

export function createLogger(level: LogLevel = "info"): Logger {
  return {
    level,
    error(message, meta) {
      if (shouldLog(level, "error")) emit("error", message, meta);
    },
    warn(message, meta) {
      if (shouldLog(level, "warn")) emit("warn", message, meta);
    },
    info(message, meta) {
      if (shouldLog(level, "info")) emit("info", message, meta);
    },
    debug(message, meta) {
      if (shouldLog(level, "debug")) emit("debug", message, meta);
    },
  };
}
