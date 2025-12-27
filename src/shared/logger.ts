export type LogLevel = "debug" | "info" | "warn" | "error";

function log(level: LogLevel, message: string, meta?: unknown): void {
  const timestamp = new Date().toISOString();
  // Keep logging simple and structured for now.
  if (meta !== undefined) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ timestamp, level, message, meta }));
  } else {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ timestamp, level, message }));
  }
}

export const logger = {
  debug: (message: string, meta?: unknown) => log("debug", message, meta),
  info: (message: string, meta?: unknown) => log("info", message, meta),
  warn: (message: string, meta?: unknown) => log("warn", message, meta),
  error: (message: string, meta?: unknown) => log("error", message, meta),
};


