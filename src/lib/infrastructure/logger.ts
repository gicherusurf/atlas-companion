// Atlas Infrastructure — Logging.
//
// A lightweight, consistently-formatted logger every Atlas module can
// use instead of calling `console.log`/`console.error` directly with its
// own ad-hoc formatting. Every log line carries a timestamp, level, and
// scope (which module logged it) in the same shape, regardless of which
// module produced it.
//
// This file has no imports — logging must never depend on anything else
// in the Infrastructure Layer (or Atlas), so that logging itself never
// becomes a source of circular imports or a reason some other module
// fails to load.

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

const CONSOLE_METHOD: Record<LogLevel, (...args: unknown[]) => void> = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

function formatMessage(level: LogLevel, scope: string, message: string): string {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}] [${scope}] ${message}`;
}

function emit(level: LogLevel, scope: string, message: string, context?: LogContext): void {
  const formatted = formatMessage(level, scope, message);
  const write = CONSOLE_METHOD[level];
  if (context && Object.keys(context).length > 0) {
    write(formatted, context);
  } else {
    write(formatted);
  }
  // TODO(telemetry): this is the single point every log line passes
  // through — a future Sentry/OpenTelemetry/Cloud Logging integration
  // should hook in exactly here (e.g. `error` also calling
  // `Sentry.captureException`, or every level also exporting an
  // OpenTelemetry log record), rather than each module adding its own
  // telemetry calls alongside its own logging calls.
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

/**
 * Creates a logger scoped to a single module (e.g.
 * `createLogger("PageService")`), so every line it emits is
 * self-identifying without the caller repeating the scope on every call.
 */
export function createLogger(scope: string): Logger {
  return {
    debug: (message, context) => emit("debug", scope, message, context),
    info: (message, context) => emit("info", scope, message, context),
    warn: (message, context) => emit("warn", scope, message, context),
    error: (message, context) => emit("error", scope, message, context),
  };
}

/** A default, unscoped logger — prefer `createLogger(scope)` within a specific module. */
export const logger: Logger = createLogger("atlas");
