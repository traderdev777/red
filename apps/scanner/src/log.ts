import pino from "pino";
import { isoUtc } from "./collectors/util";

export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "red-scanner" },
  timestamp: () => `,"time":"${isoUtc()}"`,
  // Defence in depth: these keys never reach a log line even if passed by mistake.
  redact: {
    paths: ["*.value", "*.cookie", "*.cookies[*].value", "*.authorization", "*.key", "*.token", "headers.set-cookie"],
    censor: "[redacted]",
  },
});

export type Log = pino.Logger;

/** Every line about a scan carries scan_id. */
export const scanLog = (scanId: string, extra: Record<string, unknown> = {}) =>
  log.child({ scan_id: scanId, ...extra });
