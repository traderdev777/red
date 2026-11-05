/**
 * Evidence contract between apps/scanner (writer) and apps/web (reader).
 *
 * Everything here is what a normal visitor's browser receives from a public
 * site. Never: cookie values, response bodies beyond the caps, request
 * bodies, or anything behind a login. The scanner validates every module's
 * output against these schemas before it is stored.
 */
import { z } from "zod";

/** Caps, shared so the UI can explain truncation. */
export const EVIDENCE_LIMITS = {
  htmlBytes: 2 * 1024 * 1024,
  resourceInspectBytes: 512 * 1024,
  networkEntries: 400,
  evidenceBytes: 5 * 1024 * 1024,
  wellKnownHeadBytes: 2048,
  sourceMapsFetched: 3,
  sourcesPerMap: 200,
  jsonLdBlockBytes: 8 * 1024,
  consoleEntries: 100,
  urlChars: 2048,
} as const;

const Url = z.string().max(EVIDENCE_LIMITS.urlChars);
const Ms = z.number().nonnegative().nullable();

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export const RedirectHopSchema = z.object({
  url: Url,
  status: z.number().int(),
  location: Url.nullable(),
});

export const NavigationSchema = z.object({
  requestedUrl: Url,
  finalUrl: Url,
  status: z.number().int().nullable(),
  redirectChain: z.array(RedirectHopSchema),
  timing: z.object({
    ttfbMs: Ms,
    domContentLoadedMs: Ms,
    loadMs: Ms,
  }),
});
export type Navigation = z.infer<typeof NavigationSchema>;

// ---------------------------------------------------------------------------
// Document headers
// ---------------------------------------------------------------------------

export const SECURITY_HEADERS = [
  "content-security-policy",
  "content-security-policy-report-only",
  "strict-transport-security",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
  "cross-origin-opener-policy",
  "cross-origin-embedder-policy",
  "cross-origin-resource-policy",
] as const;
export type SecurityHeader = (typeof SECURITY_HEADERS)[number];

export const HeaderSchema = z.object({ name: z.string().max(256), value: z.string().max(8192) });

export const DocumentHeadersSchema = z.object({
  /** Every response header of the final document. Set-Cookie values are redacted to name + flags. */
  headers: z.array(HeaderSchema),
  security: z.record(z.enum(SECURITY_HEADERS), z.boolean()),
});
export type DocumentHeaders = z.infer<typeof DocumentHeadersSchema>;

// ---------------------------------------------------------------------------
// Cookies (never values)
// ---------------------------------------------------------------------------

export const CookieSchema = z
  .object({
    name: z.string().max(256),
    domain: z.string().max(256),
    path: z.string().max(512),
    /** ISO time, or null for a session cookie. */
    expires: z.string().nullable(),
    httpOnly: z.boolean(),
    secure: z.boolean(),
    sameSite: z.enum(["Strict", "Lax", "None"]).nullable(),
    thirdParty: z.boolean(),
  })
  .strict(); // .strict(): a stray "value" key fails validation instead of being stored.
export type Cookie = z.infer<typeof CookieSchema>;

// ---------------------------------------------------------------------------
// HTML and <head>
// ---------------------------------------------------------------------------

export const HtmlSchema = z.object({
  bytes: z.number().int().nonnegative(),
  truncated: z.boolean(),
  /** Desktop pass only, capped at EVIDENCE_LIMITS.htmlBytes. */
  content: z.string().nullable(),
});

export const JsonLdSchema = z.object({
  types: z.array(z.string().max(200)).max(50),
  valid: z.boolean(),
  bytes: z.number().int(),
  truncated: z.boolean(),
  raw: z.string(),
});

export const HeadSchema = z.object({
  title: z.string().max(1000).nullable(),
  description: z.string().max(2000).nullable(),
  canonical: Url.nullable(),
  generator: z.string().max(500).nullable(),
  viewport: z.string().max(500).nullable(),
  themeColor: z.string().max(200).nullable(),
  manifest: Url.nullable(),
  lang: z.string().max(50).nullable(),
  robots: z.string().max(500).nullable(),
  og: z.record(z.string(), z.string().max(2000)),
  twitter: z.record(z.string(), z.string().max(2000)),
  jsonLd: z.array(JsonLdSchema).max(20),
});
export type Head = z.infer<typeof HeadSchema>;

// ---------------------------------------------------------------------------
// Scripts and stylesheets
// ---------------------------------------------------------------------------

export const PartySchema = z.enum(["first", "third"]);

export const ScriptSchema = z.object({
  url: Url,
  bytes: z.number().int().nullable(),
  party: PartySchema,
  async: z.boolean(),
  defer: z.boolean(),
  module: z.boolean(),
});
export const StylesheetSchema = z.object({
  url: Url,
  bytes: z.number().int().nullable(),
  party: PartySchema,
  media: z.string().max(200).nullable(),
});
export const AssetsSchema = z.object({
  scripts: z.array(ScriptSchema).max(400),
  inlineScripts: z.object({ count: z.number().int(), bytes: z.number().int() }),
  stylesheets: z.array(StylesheetSchema).max(400),
  inlineStyles: z.object({ count: z.number().int(), bytes: z.number().int() }),
});
export type Assets = z.infer<typeof AssetsSchema>;

// ---------------------------------------------------------------------------
// Network log
// ---------------------------------------------------------------------------

export const NetworkEntrySchema = z.object({
  url: Url,
  method: z.string().max(16),
  resourceType: z.string().max(32),
  status: z.number().int().nullable(),
  /** Bytes on the wire (encoded), null when the browser didn't report it. */
  transferBytes: z.number().int().nullable(),
  startMs: z.number().nonnegative(),
  durationMs: Ms,
  initiator: z.object({ type: z.string().max(32), url: Url.nullable() }),
  domain: z.string().max(256),
  party: PartySchema,
  contentType: z.string().max(200).nullable(),
  cache: z.object({
    cacheControl: z.string().max(500).nullable(),
    age: z.string().max(50).nullable(),
    etag: z.boolean(),
    lastModified: z.boolean(),
    expires: z.string().max(100).nullable(),
  }),
  fromCache: z.boolean(),
  failed: z.string().max(200).nullable(),
});
export type NetworkEntry = z.infer<typeof NetworkEntrySchema>;

export const NetworkSchema = z.object({
  entries: z.array(NetworkEntrySchema).max(EVIDENCE_LIMITS.networkEntries),
  totalRequests: z.number().int(),
  truncated: z.boolean(),
  transferBytes: z.number().int(),
  byType: z.record(z.string(), z.object({ count: z.number().int(), bytes: z.number().int() })),
});
export type Network = z.infer<typeof NetworkSchema>;

// ---------------------------------------------------------------------------
// Runtime, console, vitals
// ---------------------------------------------------------------------------

export const RuntimeSchema = z.object({
  /** Presence only. Values are never read. */
  globals: z.record(z.string(), z.boolean()),
});

export const ConsoleSchema = z.object({
  errors: z.array(z.object({ text: z.string().max(500), url: Url.nullable() })).max(100),
  failedRequests: z
    .array(z.object({ url: Url, method: z.string(), resourceType: z.string(), error: z.string().max(200) }))
    .max(100),
});

export const VitalsSchema = z.object({
  lcpMs: Ms,
  cls: z.number().nonnegative().nullable(),
  fcpMs: Ms,
  /** Longest event duration seen. No interaction is simulated, so usually null. */
  inpProxyMs: Ms,
  /** Sum of long-task time over 50ms after FCP, until load settled. */
  tbtProxyMs: Ms,
});
export type Vitals = z.infer<typeof VitalsSchema>;

// ---------------------------------------------------------------------------
// One viewport pass
// ---------------------------------------------------------------------------

export const PassSchema = z.object({
  viewport: z.object({ width: z.number().int(), height: z.number().int() }),
  navigation: NavigationSchema,
  document: DocumentHeadersSchema,
  cookies: z.array(CookieSchema).max(200),
  html: HtmlSchema,
  head: HeadSchema,
  assets: AssetsSchema,
  network: NetworkSchema,
  runtime: RuntimeSchema,
  console: ConsoleSchema,
  vitals: VitalsSchema,
});
export type Pass = z.infer<typeof PassSchema>;

// ---------------------------------------------------------------------------
// Site-level modules
// ---------------------------------------------------------------------------

export const ThirdPartyCategorySchema = z.enum([
  "analytics",
  "ads",
  "tag-manager",
  "fonts",
  "cdn",
  "payments",
  "social",
  "video",
  "support",
  "monitoring",
  "consent",
  "experimentation",
  "maps",
  "hosting",
  "auth",
  "captcha",
  "commerce",
  "cms",
  "other",
]);
export type ThirdPartyCategory = z.infer<typeof ThirdPartyCategorySchema>;

export const ThirdPartySchema = z.object({
  domain: z.string().max(256),
  /** Known vendor name from packages/shared/data/third-parties.json, else null. */
  vendor: z.string().max(100).nullable(),
  category: ThirdPartyCategorySchema,
  requests: z.number().int(),
  transferBytes: z.number().int(),
});
export type ThirdParty = z.infer<typeof ThirdPartySchema>;

export const WellKnownFileSchema = z.object({
  path: z.string().max(200),
  url: Url,
  status: z.number().int().nullable(),
  exists: z.boolean(),
  bytes: z.number().int().nullable(),
  contentType: z.string().max(200).nullable(),
  head: z.string().nullable(),
  truncated: z.boolean(),
  error: z.string().max(200).nullable(),
});
export type WellKnownFile = z.infer<typeof WellKnownFileSchema>;

export const SourceMapsSchema = z.object({
  referenced: z
    .array(z.object({ assetUrl: Url, mapUrl: Url, via: z.enum(["header", "comment"]) }))
    .max(400),
  fetched: z
    .array(
      z.object({
        mapUrl: Url,
        status: z.number().int().nullable(),
        file: z.string().max(500).nullable(),
        sources: z.array(z.string().max(500)),
        sourcesCount: z.number().int(),
        truncated: z.boolean(),
        skipped: z.string().max(200).nullable(),
      }),
    )
    .max(3),
});
export type SourceMaps = z.infer<typeof SourceMapsSchema>;

export const TlsSchema = z.object({
  protocol: z.string().max(50).nullable(),
  issuer: z.string().max(500).nullable(),
  subject: z.string().max(500).nullable(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
});

export const DnsSchema = z.object({
  hostname: z.string(),
  cnameChain: z.array(z.string()).max(10),
  addresses: z.array(z.object({ address: z.string(), family: z.number().int() })).max(32),
  asn: z
    .array(
      z.object({
        address: z.string(),
        asn: z.string().nullable(),
        prefix: z.string().nullable(),
        country: z.string().nullable(),
        org: z.string().nullable(),
      }),
    )
    .max(8),
});

export const LighthouseSchema = z.object({
  status: z.enum(["ok", "failed", "skipped"]),
  reason: z.string().max(500).nullable(),
  version: z.string().nullable(),
  formFactor: z.literal("mobile"),
  scores: z.object({
    performance: z.number().int().min(0).max(100).nullable(),
    accessibility: z.number().int().min(0).max(100).nullable(),
    bestPractices: z.number().int().min(0).max(100).nullable(),
    seo: z.number().int().min(0).max(100).nullable(),
  }),
  audits: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().max(300),
        score: z.number().nullable(),
        displayValue: z.string().max(200).nullable(),
        numericValue: z.number().nullable(),
      }),
    )
    .max(40),
});
export type Lighthouse = z.infer<typeof LighthouseSchema>;

export const BlockedRequestSchema = z.object({
  host: z.string().max(256),
  reason: z.string().max(200),
  phase: z.enum(["navigation", "subresource", "connect", "fetch"]),
});

export const EVIDENCE_VERSION = 1 as const;

export const EvidenceDocSchema = z.object({
  version: z.literal(EVIDENCE_VERSION),
  scanId: z.string().uuid(),
  requestedUrl: Url,
  collectedAt: z.string(),
  durationMs: z.number().int(),
  scanner: z.object({ version: z.string(), userAgent: z.string() }),
  truncated: z.boolean(),
  truncation: z.array(z.string()),
  passes: z.object({ desktop: PassSchema, mobile: PassSchema.nullable() }),
  mobileError: z.string().max(500).nullable(),
  thirdParties: z.array(ThirdPartySchema).max(300),
  wellKnown: z.array(WellKnownFileSchema),
  sourceMaps: SourceMapsSchema,
  tls: TlsSchema.nullable(),
  dns: DnsSchema.nullable(),
  lighthouse: LighthouseSchema,
  screenshots: z.object({ desktop: z.string().nullable(), mobile: z.string().nullable() }),
  blockedRequests: z.array(BlockedRequestSchema).max(200),
});
export type EvidenceDoc = z.infer<typeof EvidenceDocSchema>;

// ---------------------------------------------------------------------------
// Compact summary stored in public.scans.result
// ---------------------------------------------------------------------------

export const EvidenceSummarySchema = z.object({
  finalUrl: Url,
  status: z.number().int().nullable(),
  redirects: z.number().int(),
  timing: NavigationSchema.shape.timing,
  vitals: z.object({ desktop: VitalsSchema, mobile: VitalsSchema.nullable() }),
  requests: z.number().int(),
  transferBytes: z.number().int(),
  thirdParties: z.object({
    count: z.number().int(),
    top: z.array(z.object({ name: z.string(), category: ThirdPartyCategorySchema })).max(8),
  }),
  cookies: z.object({ count: z.number().int(), thirdParty: z.number().int() }),
  securityHeaders: z.record(z.enum(SECURITY_HEADERS), z.boolean()),
  lighthouse: LighthouseSchema.shape.scores.extend({ status: LighthouseSchema.shape.status }),
  tls: z.object({ protocol: z.string().nullable(), issuer: z.string().nullable() }).nullable(),
  sourceMapsReferenced: z.number().int(),
  consoleErrors: z.number().int(),
  screenshots: z.object({ desktop: z.string().nullable(), mobile: z.string().nullable() }),
  truncated: z.boolean(),
});
export type EvidenceSummary = z.infer<typeof EvidenceSummarySchema>;

export function storageKeyFor(scanId: string, file: string): string {
  return `${scanId}/${file}`;
}
