# RED

Point RED at a URL. It reads the site, cites its evidence, and hands you build actions.

## Layout

```
apps/web         Next.js 15 (App Router), Tailwind, Framer Motion, GSAP
apps/scanner     Playwright evidence collector: claims queued scans, GET /health (docs/SCANNER.md)
packages/shared  Domain types: Scan, Finding, Evidence, Confidence, BuildAction
docs/DESIGN.md   The design system contract
supabase/        SQL migrations (waitlist)
```

## Run

```bash
corepack enable          # or: npm i -g pnpm@9
pnpm install
cp .env.example apps/web/.env.local   # Next reads env from the app directory
pnpm dev                 # web on http://localhost:3000 (landing at /, gallery at /system)
pnpm dev:all             # web + scanner (scanner on :4000)
```

Other scripts: `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm format`, `pnpm test` (shared: URL validation, normalize, SSRF guard), `pnpm test:db` (migrations, RLS, quota; needs `TEST_DATABASE_URL` pointing at a throwaway Postgres, never Supabase).

`/system` is the live design system gallery. It returns 404 in production builds.

## Waitlist (Supabase)

1. Create a Supabase project. In SQL Editor, run `supabase/migrations/20261103000000_waitlist.sql`
   (or `supabase db push` with the CLI linked).
2. Put `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `apps/web/.env.local`.
3. Submit an email on `/`. The row appears in Table Editor → `waitlist`. Submitting the same
   address again (any casing) returns "You're already on the list".

The anon role can INSERT `email` and `source` and nothing else, so the public key cannot read the list.
Rate limiting is in-process (5 attempts per IP per 10 minutes). On serverless or multi-instance
hosting, move it to Redis before relying on it.

Without the env vars the form says plainly that the waitlist isn't connected and stores nothing.

## Landing page checks (run locally)

```bash
pnpm build && pnpm --filter @red/web start
npx lighthouse http://localhost:3000/ --form-factor=mobile --view
```

## App (Supabase Auth + database)

1. Supabase → SQL editor: run `supabase/migrations/20261103000000_waitlist.sql`, then
   `supabase/migrations/20261104000000_app_core.sql` (or `supabase db push`). Both are idempotent.
2. Auth → Providers: enable Email (magic link) and Google (client id/secret from Google Cloud,
   authorized redirect `https://<ref>.supabase.co/auth/v1/callback`).
3. Auth → URL Configuration: Site URL = `NEXT_PUBLIC_SITE_URL`; add `<site>/auth/callback` to Redirect URLs.
4. Optional, for magic links opened on a different device: in the Magic Link email template use
   `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}`.
   The default template works too (PKCE, same browser).
5. Fill `apps/web/.env.local` from `.env.example` (anon key, service role key, audit salt).
6. Make yourself owner: `supabase/snippets/make-owner.sql` in the SQL editor.

`scripts/try-role-escalation.sh` runs the direct-API attempts (self-promote, raise limit, write
status, spend another user's quota) against your project; each must return 403.

## Scanner

Full design, ethics rule and safety model: `docs/SCANNER.md`.

1. Run `supabase/migrations/20261105000000_scanner.sql` (queue functions + private `evidence` bucket).
2. `cp apps/scanner/.env.example apps/scanner/.env` and fill `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SCANNER_BOT_URL`.
3. `docker compose up --build` (scanner on :4000). Set `SCANNER_URL=http://localhost:4000` in `apps/web/.env.local`.
4. Without Docker: `pnpm --filter @red/scanner exec playwright install chromium`, then `pnpm --filter @red/scanner start`.

Tests: `pnpm test` (collectors on recorded fixtures, SSRF integration with a real Chrome),
`pnpm test:db` (queue: no double claims, refunds, reaper).
