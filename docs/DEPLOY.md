# Deploying RED (free tiers, no card)

Three pieces, one Supabase project between them. Every host here has a free
plan that signs up with GitHub and asks for no card.

| Piece | Host (free plan) | Needs |
| --- | --- | --- |
| Database, Auth, Storage, Realtime | Supabase Free | run every file in `supabase/migrations` in order |
| Web app (`apps/web`) | Vercel Hobby | env below |
| Scanner (`apps/scanner`), lite mode | Render Free web service (Docker) | `render.yaml` + env below |
| Lighthouse for the scanner | Google PageSpeed Insights API | optional free API key |

## Why the scanner runs in lite mode
Render's free web service is 0.1 CPU and 512 MB, too small for Chrome and a
local Lighthouse. `SCANNER_MODE=lite` (set by `Dockerfile.lite`):

- fetches the page's HTML, redirects, headers, Set-Cookie, TLS certificate,
  DNS, well-known files and referenced source maps itself, through the same
  SSRF guard as the browser mode;
- gets Lighthouse scores, lab vitals, the request list, console errors and
  screenshots from Google PageSpeed Insights (Chrome runs on Google's side).

What lite mode does not see: anything the page's scripts add after load
(head tags, globals). The evidence records `collection.mode = "lite"` with
notes, the report shows them, and pages served as an empty shell are flagged
so no finding is drawn from their missing head. If PageSpeed Insights fails
(quota, timeout), the scan still finishes and the report says Lighthouse failed.

Free-tier limits to know:
- Render free sleeps after 15 minutes without inbound traffic and takes about
  a minute to wake. The web app pings `SCANNER_URL/health` whenever a scan is
  queued (`SCANNER_SLEEPS=1` also changes the queued message to "Waking the scanner").
- Render free has 750 instance-hours a month per workspace; one always-awake
  service is about 744.
- Supabase Free pauses a project after a week with no activity; reopen it
  from the dashboard.
- Without `PSI_API_KEY`, PageSpeed Insights uses Google's small anonymous
  quota. A key from Google Cloud (APIs & Services → Credentials, PageSpeed
  Insights API enabled) is free and needs no billing.

## 1. Supabase
1. New project (sign in with GitHub). SQL editor: run `supabase/migrations/*.sql` in filename order.
2. Auth → URL configuration: Site URL = the Vercel URL; Redirect URLs = `<site>/auth/callback`.
3. Auth → Providers: Email (magic link) is on by default. Google needs a client id/secret from Google Cloud.
4. Storage: the private `evidence` bucket is created by the scanner migration.
5. Settings → API: copy the project URL, anon key, service role key.

## 2. Render (scanner)
1. Sign in with GitHub, New → Blueprint, pick `traderdev777/red`. It reads `render.yaml`.
2. Fill the secret env vars it asks for:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SCANNER_BOT_URL` (`<site>/bot`),
   `PSI_API_KEY` (optional), `GEMINI_API_KEY` (optional), `RED_SECRETS_KEY` (same as Vercel).
3. Deploy. Check `https://<service>.onrender.com/health`.

## 3. Vercel (web app)
- Import `traderdev777/red`, root directory `apps/web`, framework Next.js.
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `AUDIT_IP_SALT` (random), `RED_SECRETS_KEY` (`openssl rand -base64 32`),
  `SCANNER_URL` (the Render URL), `SCANNER_SLEEPS=1`, `NEXT_PUBLIC_SITE_URL` (the Vercel URL).
- Known gap: the rate limiter is in memory, so on Vercel's serverless functions
  it is per instance, not global. The database quota (`consume_scan_quota`) still holds.

## 4. Point GitHub Pages at the live app
Repo → Settings → Secrets and variables → Actions → Variables: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL=<vercel url>`.

## Browser mode elsewhere
`apps/scanner/Dockerfile` (Chrome + local Lighthouse, `SCANNER_MODE=browser`) needs about
2 GB RAM and a full CPU. Use it on any host with that, or on your own machine with
`docker compose up` in `apps/scanner`.
