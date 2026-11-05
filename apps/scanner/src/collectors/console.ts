import { ConsoleSchema } from "@red/shared";
import type { z } from "zod";
import { capUrl } from "./util";

export interface RawConsole {
  errors: { text: string; url: string | null }[];
  failedRequests: { url: string; method: string; resourceType: string; error: string }[];
}

export function buildConsole(raw: RawConsole): z.infer<typeof ConsoleSchema> {
  return ConsoleSchema.parse({
    errors: raw.errors.slice(0, 100).map((e) => ({ text: e.text.slice(0, 500), url: e.url ? capUrl(e.url) : null })),
    failedRequests: raw.failedRequests.slice(0, 100).map((f) => ({
      url: capUrl(f.url),
      method: f.method,
      resourceType: f.resourceType,
      error: f.error.slice(0, 200),
    })),
  });
}
