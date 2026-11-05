-- Bring your own Gemini key. Stored encrypted (AES-256-GCM, key in the
-- RED_SECRETS_KEY env of the web app and scanner, never in the database).
-- No user grants at all: only the service role reads or writes this table,
-- after the app has authenticated the user server-side. Idempotent.

create table if not exists public.user_gemini_keys (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  ciphertext text not null,
  last4      text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint user_gemini_keys_last4 check (char_length(last4) = 4)
);

alter table public.user_gemini_keys enable row level security;
revoke all on table public.user_gemini_keys from anon, authenticated;
