export type LogLevel = "silent" | "error" | "warn" | "info" | "debug";
export interface Logger {
    level: LogLevel;
    error: (message: string, meta?: unknown) => void;
    warn: (message: string, meta?: unknown) => void;
    info: (message: string, meta?: unknown) => void;
    debug: (message: string, meta?: unknown) => void;
}
export declare function createLogger(level?: LogLevel): Logger;
