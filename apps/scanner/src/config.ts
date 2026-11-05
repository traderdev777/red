import { z } from "zod";
import { hostname } from "node:os";
import { randomBytes } from "node:crypto";

const Env = z.object({
  NODE_ENV: z.string().default("production"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SCAN_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  SCANNER_BOT_URL: z.string().url().default("https://red.example/bot"),
  SCAN_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(180_000).default(60_000),
  SCAN_POLL_MS: z.coerce.number().int().min(500).max(60_000).default(2_000),
  REAPER_INTERVAL_MS: z.coerce.number().int().min(5_000).default(30_000),
  REAPER_TIMEOUT_S: z.coerce.number().int().min(60).default(300),
  PORT: z.coerce.number().int().default(4000),
  SCANNER_LIGHTHOUSE: z.enum(["on", "off"]).default("on"),
  /** "browser": local Chrome + Lighthouse. "lite": HTTP fetch + Google PageSpeed Insights (small hosts). */
  SCANNER_MODE: z.enum(["browser", "lite"]).default("browser"),
  /** PageSpeed Insights key (free, no billing). Without one, Google's anonymous quota is small. */
  PSI_API_KEY: z.string().min(10).optional(),
  /** Dev sandboxes only. See net/guardProxy.ts. */
  SCANNER_UPSTREAM_PROXY: z.string().url().optional(),
  CHROMIUM_EXECUTABLE: z.string().optional(),
  /** Analysis model. Without a key, analysis runs the deterministic rules only and says so. */
  GEMINI_API_KEY: z.string().min(10).optional(),
  /** Decrypts users' own Gemini keys (same value as the web app's RED_SECRETS_KEY). */
  RED_SECRETS_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-3.8-flash"),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).default(35_000),
  ANALYSIS_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(180_000).default(45_000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type Config = z.infer<typeof Env> & { workerId: string; userAgent: string; version: string };

export const SCANNER_VERSION = "1.0.0";

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse({
    ...env,
    SUPABASE_URL: env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL,
  });
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`scanner config invalid: ${fields}`);
  }
  const c = parsed.data;
  return {
    ...c,
    version: SCANNER_VERSION,
    workerId: `${hostname()}-${process.pid}-${randomBytes(3).toString("hex")}`,
    // Honest identification. No browser-like UA, no spoofing.
    userAgent: `REDScanner/${SCANNER_VERSION} (+${c.SCANNER_BOT_URL})`,
  };
}
