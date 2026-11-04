"use server";

import { headers } from "next/headers";
import { waitlistSchema, type WaitlistState } from "@/lib/waitlistSchema";
import { rateLimit } from "@/lib/server/rateLimit";
import { supabaseAnon } from "@/lib/server/supabase";

async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    h.get("cf-connecting-ip") ||
    "unknown"
  );
}

export async function joinWaitlist(_prev: WaitlistState, form: FormData): Promise<WaitlistState> {
  const at = Date.now();
  const parsed = waitlistSchema.safeParse({
    email: form.get("email"),
    source: form.get("source"),
    company: form.get("company") ?? "",
  });

  if (!parsed.success) {
    const honeypot = parsed.error.issues.some((i) => i.path[0] === "company");
    // Bots get the same answer as humans; nothing is written.
    if (honeypot)
      return { status: "ok", message: "You're on the list. One email when RED opens.", at };
    const msg =
      parsed.error.issues.find((i) => i.path[0] === "email")?.message ??
      "Check your email address.";
    return { status: "error", field: "email", message: msg, at };
  }

  const limit = rateLimit(`waitlist:${await clientIp()}`);
  if (!limit.ok) {
    const mins = Math.max(1, Math.ceil(limit.retryAfterS / 60));
    return {
      status: "error",
      message: `Too many attempts from this network. Try again in ${mins} min.`,
      at,
    };
  }

  const db = supabaseAnon();
  if (!db) {
    console.error("waitlist: SUPABASE_URL or SUPABASE_ANON_KEY is not set");
    return { status: "error", message: "The waitlist isn't connected yet. Nothing was saved.", at };
  }

  // No .select(): anon has INSERT only, so asking for the row back would fail RLS.
  const { error } = await db
    .from("waitlist")
    .insert({ email: parsed.data.email, source: parsed.data.source });

  if (error) {
    if (error.code === "23505") {
      return { status: "duplicate", message: "You're already on the list.", at };
    }
    console.error("waitlist insert failed", { code: error.code, message: error.message });
    return {
      status: "error",
      message: "Couldn't save that just now. Nothing was stored; try again.",
      at,
    };
  }

  return { status: "ok", message: "You're on the list. One email when RED opens.", at };
}
