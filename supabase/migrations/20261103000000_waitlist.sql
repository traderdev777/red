-- RED waitlist.
-- Anonymous visitors may INSERT a row and nothing else: no SELECT, UPDATE, or DELETE.
-- Duplicates are rejected by the unique constraint (SQLSTATE 23505), which the
-- server action maps to "You're already on the list".

create extension if not exists citext;

create table if not exists public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       citext not null,
  created_at  timestamptz not null default now(),
  source      text not null default 'landing',
  constraint waitlist_email_unique unique (email),
  constraint waitlist_email_format check (
    char_length(email) <= 254
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  constraint waitlist_source_allowed check (
    source in ('landing', 'pricing-free', 'pricing-pro', 'pricing-agency')
  )
);

alter table public.waitlist enable row level security;

-- Table privileges: anon can insert the two user-supplied columns only.
revoke all on table public.waitlist from anon, authenticated;
grant insert (email, source) on table public.waitlist to anon;

-- Row policy: the matching INSERT-only policy. No select policy exists,
-- so even a misconfigured grant cannot expose the list.
drop policy if exists "anon can join the waitlist" on public.waitlist;
create policy "anon can join the waitlist"
  on public.waitlist
  for insert
  to anon
  with check (true);

comment on table public.waitlist is 'Launch waitlist. Insert-only for anon; read via service role.';
