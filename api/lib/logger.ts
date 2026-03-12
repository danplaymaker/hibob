/**
 * Minimal structured logger.
 *
 * Emits newline-delimited JSON to stdout so that Vercel's log drain and any
 * external log aggregator (Datadog, Axiom, Logtail, …) can parse fields
 * without regex hacks.
 */

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };

  const line = JSON.stringify(entry);

  if (level === "error" || level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>): void {
    emit("info", message, meta);
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    emit("warn", message, meta);
  },
  error(message: string, meta?: Record<string, unknown>): void {
    emit("error", message, meta);
  },
  debug(message: string, meta?: Record<string, unknown>): void {
    if (process.env.LOG_LEVEL === "debug") {
      emit("debug", message, meta);
    }
  },
};
