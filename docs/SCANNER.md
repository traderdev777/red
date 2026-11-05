# RED scanner

`apps/scanner` claims queued scans from Postgres, loads the page once in a fresh
Chrome the way a visitor's browser would, records what it received, stores the
evidence in a private bucket, and marks the scan done. Analysis is a later stage.

## Ethics rule (enforced in code)

**Public evidence only: what every visitor's browser receives.**

| Rule | Where it is enforced |
| --- | --- |
| Honest identity. Every request says `REDScanner/1.0.0 (+SCANNER_BOT_URL)`. No browser-like UA, no rotation. | `config.ts` (`userAgent`), `collectors/pass.ts` (context `userAgent`), Lighthouse `emulatedUserAgent` |
| No stealth plugins, no fingerprint spoofing, no `navigator.webdriver` patching, no header tricks. | Nothing of the kind is installed or injected; the only init script is the read-only vitals observer (`collectors/vitals.ts`) |
| No CAPTCHA solving, no bot-protection evasion, no retry designed to get past a wall. | `collectors/botwall.ts` detects Cloudflare, Akamai, DataDome, PerimeterX, Imperva, Sucuri, AWS WAF and CAPTCHA-only pages and **fails** the scan: *"Blocked by bot protection. RED does not bypass protections."* The only retry is for transient network errors (`errors.ts`), never after a wall |
| No logins, no forms, no clicks, no private APIs. | The pass navigates once and reads; there is no input code path |
| Cookie values are never stored. | `CookieSchema` is `.strict()` with no `value` field; `Set-Cookie` header values are redacted to `name=[redacted]; attrs` (`collectors/headers.ts`); pino redacts `value`, `cookie`, `token`, `authorization` keys |
| Runtime globals: presence only. | `collectors/runtime.ts` evaluates an allowlist of boolean expressions in the page; no value is read back |
| Source maps: only those the page references, at most 3, only `file` and `sources` paths, never `sourcesContent`; skipped if robots.txt disallows. | `collectors/sourcemaps.ts`, `net/robots.ts` |
| Beyond the single page view, robots.txt is respected. The one visitor-equivalent page view is always made; robots.txt is recorded as evidence. | `pipeline/collect.ts` |

If a site blocks us, the scan says so. It does not try again with a different face.

## Safety: SSRF

Three layers, each sufficient on its own for private addresses:

1. **Queue entry and navigations.** `assertPublicUrl` (shared) runs on the queued URL
   before anything connects, on every main-frame navigation (Playwright `route`), and on
   every redirect hop (`request` events with `redirectedFrom`, plus a `validatePublicUrl`
   https/shape check). A failure fails the scan with
   *"Blocked: the page sent the scanner to a private or reserved address."* and writes a
   `scan.blocked_ssrf` audit row.
2. **Egress guard** (`net/guardProxy.ts`). Chrome runs with `--proxy-server` pointing at a
   per-scan local proxy and `--proxy-bypass-list=<-loopback>` (so even loopback is proxied).
   For every connection (pages, iframes, workers, Lighthouse) the guard allows ports 80/443
   only, rejects non-public hostnames, resolves the name itself, rejects if **any** A/AAAA
   is private, loopback, link-local, CGNAT, multicast or metadata, and connects to the
   address it checked (DNS pinning). Refused requests are listed in
   `evidence.blockedRequests`. QUIC and non-proxied WebRTC UDP are disabled.
3. **Node-side fetches** (well-known files, source maps) go through the same guard
   (`net/fetcher.ts`), follow at most 3 redirects, and re-validate each hop.

`SCANNER_UPSTREAM_PROXY` chains the guard to another proxy for sandboxed development.
The private-address check still runs first, but the upstream resolves the name again, so
pinning is weaker. The scanner logs a warning at startup. Never set it in production.

Isolation: one fresh Chrome per scan, one fresh context per viewport pass; downloads
refused, popups closed, dialogs dismissed, service workers blocked, no permissions granted.

## Caps

| What | Cap | On overflow |
| --- | --- | --- |
| Document HTML | 2 MB | `html.truncated: true` |
| Body inspection (script/style tails for `sourceMappingURL`, map files) | 512 KB | map recorded with `skipped` reason |
| Network log | 400 entries | `network.truncated: true`, `totalRequests` keeps the real count |
| Evidence JSON | 5 MB | drops HTML content, then mobile network, then JSON-LD raw, then trims desktop network; `truncated: true` and `truncation[]` names each part |
| Well-known files | first 2 KB | `truncated: true` |
| Per scan | 60 s (`SCAN_TIMEOUT_MS`) | scan fails: "Scan exceeded the 60 second limit." |

## Pipeline and progress

`pipeline/index.ts` runs ordered stages. Today: `collect` (status `collecting`).
Prompt 5 appends `fingerprint` and `analyze` (status `analyzing`); no refactor needed.

Progress moves only at real milestones, written through `update_scan_progress`
(service role) so Realtime pushes them to the UI:

| % | Milestone |
| --- | --- |
| 10 | desktop navigation answered (and passed the bot-wall check) |
| 30 | network settled (800 ms quiet, capped) |
| 45 | runtime probes, head, assets, vitals, cookies read |
| 60 | mobile pass finished (or recorded as failed) |
| 80 | Lighthouse finished, failed, or skipped (all recorded) |
| 95 | screenshots and `evidence.json` uploaded |
| 100 | `complete_scan`: status `done`, `result.analysis = null` |

## Queue (Postgres)

`supabase/migrations/20261105000000_scanner.sql`, service role only:

- `claim_next_scan(worker_id)`: oldest queued, `FOR UPDATE SKIP LOCKED`, sets `collecting`, `started_at`, `heartbeat_at`, `worker_id`.
- `update_scan_progress(id, worker_id, progress, status?)`: monotonic, max 99, only by the owning worker; returns `false` if the scan was taken away, and the worker stops.
- `complete_scan(id, worker_id, result)`, `fail_scan(id, worker_id, error)`: owner only. A failure before analysis refunds the day's quota once.
- `reap_stuck_scans(timeout_s = 300)`: active scans older than the timeout become `failed` / "Scanner timed out", refunded, audited `scan.reaped`.
- `scan_queue_stats()`: for `/health`.

The worker polls every 2 s and also wakes on a Realtime INSERT. Concurrency is
`SCAN_CONCURRENCY` (default 2). SIGTERM stops claiming and lets in-flight scans finish.

## Evidence

`evidence/<scan_id>/evidence.json` (schema: `packages/shared/src/evidence.ts`,
`EvidenceDocSchema`), `desktop.jpg`, `mobile.jpg` in the private `evidence` bucket.
`scans.result` holds the compact `EvidenceSummary` plus `evidencePath`. The web app reads
evidence server-side after an RLS read of the scan, and shows screenshots through signed
URLs that expire in 5 minutes.

Third-party labels come from `packages/shared/data/third-parties.json` (exact host or
dot-suffix, longest match wins). Unlisted domains show as `unlisted` / `other`; nothing is guessed.

## Run

```bash
cp apps/scanner/.env.example apps/scanner/.env   # fill in
docker compose up --build                        # scanner on :4000, /health
```

Non-root (`pwuser`), read-only root filesystem, `cap_drop: ALL`, 2 CPUs, 2 GB memory,
1 GB `/dev/shm`, 75 s stop grace for the SIGTERM drain.

## Tests

- `apps/scanner/test/collectors.test.ts`: every collector against recorded real passes
  (`test/fixtures/*.raw.json`, recorded with `scripts/record-fixture.ts`; cookie values and
  `Set-Cookie` values stripped) plus edge cases.
- `apps/scanner/test/ssrf.integration.test.ts`: real Chrome + guard + a local fixture
  server (allowed only when `NODE_ENV=test`): redirect to 127.0.0.1, redirect to
  169.254.169.254, a public-looking name resolving to 10.0.0.7, a script navigation to
  loopback. All fail the scan; the internal server records zero hits.
- `supabase/tests/scanner-queue.test.ts`: two workers never claim the same scan,
  ownership, monotonic progress, refunds, reaper.
