# Deploying RED

Three pieces, one Supabase project between them.

| Piece | Host | Needs |
| --- | --- | --- |
| Database, Auth, Storage, Realtime | Supabase | run every file in `supabase/migrations` in order |
| Web app (`apps/web`) | Vercel | env from `.env.example` |
| Scanner (`apps/scanner`) | Fly.io (Docker) | env from `apps/scanner/.env.example` |

## 1. Supabase
1. Create a project. SQL editor: run `supabase/migrations/*.sql` in filename order.
2. Auth → URL configuration: Site URL = the Vercel URL; Redirect URLs = `<site>/auth/callback`.
3. Auth → Providers: enable Email (magic link) and Google (client id/secret from Google Cloud).
4. Storage: the `evidence` bucket is created by the scanner migration (private).
5. Copy the project URL, anon key, service role key.

## 2. Vercel (apps/web)
- Import `traderdev777/red`, root directory `apps/web`, framework Next.js.
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `AUDIT_IP_SALT` (random), `RED_SECRETS_KEY` (`openssl rand -base64 32`), `SCANNER_URL`
  (the Fly app URL), `NEXT_PUBLIC_SITE_URL` (the Vercel URL).

## 3. Fly.io (scanner)
- `fly launch --no-deploy --copy-config --name <app>` from the repo root (uses `fly.toml`).
- `fly secrets set SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… SCANNER_BOT_URL=<site>/bot GEMINI_API_KEY=… RED_SECRETS_KEY=<same as Vercel>`
- `fly deploy`. Check `https://<app>.fly.dev/health`.

## 4. Point GitHub Pages at the live app
Repo → Settings → Secrets and variables → Actions → Variables: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL=<vercel url>`.
