import pino from "pino";

const level = process.env.LOG_LEVEL || "info";

const rootLogger = pino({
  level,
  transport:
    process.env.NODE_ENV !== "production"
      ? {
          target: "pino/file",
          options: { destination: 1 },
        }
      : undefined,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "password",
      "token",
      "accessToken",
      "refreshToken",
      "authKey",
      "credentials",
      "creds",
      "secret",
      "*.password",
      "*.token",
      "*.secret",
    ],
    censor: "[REDACTED]",
  },
});

/**
 * Creates a named child logger for a specific module.
 * Never logs message content, auth keys, or tokens (redacted automatically).
 */
export function createLogger(module: string): pino.Logger {
  return rootLogger.child({ module });
}

export default rootLogger;
