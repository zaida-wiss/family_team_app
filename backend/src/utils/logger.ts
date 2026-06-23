import pino from "pino";

const IS_DEV = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: IS_DEV ? "debug" : "info",
  redact: {
    paths: [
      "password",
      "passwordHash",
      "accessToken",
      "refreshToken",
      "req.headers.authorization",
      "req.headers.cookie",
      "*.password",
      "*.passwordHash",
      "*.accessToken",
      "*.refreshToken"
    ],
    censor: "[REDACTED]"
  },
  ...(IS_DEV && {
    transport: {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "HH:MM:ss" }
    }
  })
});
