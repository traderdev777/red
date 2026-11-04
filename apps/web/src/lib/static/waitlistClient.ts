"use client";

/**
 * Static-hosting (GitHub Pages) stand-in for app/actions/waitlist.ts.
 * Same validation and messages; writes straight to Supabase with the anon key.
 * RLS on public.waitlist allows anon INSERT only, so the key can't read the list.
 * There is no server here, so the per-IP rate limit does not apply on this build.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { waitlistSchema, type WaitlistState } from "@/lib/waitlistSchema";

let client: SupabaseClient | null = null;
function db(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export async function joinWaitlist(_prev: WaitlistState, form: FormData): Promise<WaitlistState> {
  const at = Date.now();
  const parsed = waitlistSchema.safeParse({
    email: form.get("email"),
    source: form.get("source"),
    company: form.get("company") ?? "",
  });
  if (!parsed.success) {
    if (parsed.error.issues.some((i) => i.path[0] === "company"))
      return { status: "ok", message: "You're on the list. One email when RED opens.", at };
    const msg =
      parsed.error.issues.find((i) => i.path[0] === "email")?.message ??
      "Check your email address.";
    return { status: "error", field: "email", message: msg, at };
  }
  const c = db();
  if (!c)
    return { status: "error", message: "The waitlist isn't connected yet. Nothing was saved.", at };
  const { error } = await c
    .from("waitlist")
    .insert({ email: parsed.data.email, source: parsed.data.source });
  if (error) {
    if (error.code === "23505")
      return { status: "duplicate", message: "You're already on the list.", at };
    return {
      status: "error",
      message: "Couldn't save that just now. Nothing was stored; try again.",
      at,
    };
  }
  return { status: "ok", message: "You're on the list. One email when RED opens.", at };
}
