"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/env";
import { rateLimit } from "@/lib/server/rateLimit";
import { clientIp, siteOrigin } from "@/lib/server/request";
import { safeNext } from "@/lib/safeNext";

export type LoginState =
  | { status: "idle" }
  | { status: "sent"; email: string; at: number }
  | { status: "error"; message: string; at: number };

const EmailSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Enter your email.")
    .max(254)
    .email("That isn't a valid email address."),
  next: z.string().max(2048).optional(),
});

function callbackUrl(origin: string, next: string) {
  const u = new URL("/auth/callback", origin);
  u.searchParams.set("next", next);
  return u.toString();
}

export async function sendMagicLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const at = Date.now();
  if (!supabaseConfigured())
    return { status: "error", message: "Auth isn't configured on this server yet.", at };
  const parsed = EmailSchema.safeParse({
    email: form.get("email"),
    next: form.get("next") ?? undefined,
  });
  if (!parsed.success)
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check your email.", at };

  const ip = await clientIp();
  const a = rateLimit(`login:ip:${ip}`, { max: 10, windowMs: 10 * 60_000 });
  const b = rateLimit(`login:email:${parsed.data.email}`, { max: 3, windowMs: 10 * 60_000 });
  if (!a.ok || !b.ok) {
    const mins = Math.ceil(Math.max(a.retryAfterS, b.retryAfterS) / 60);
    return {
      status: "error",
      message: `Too many sign-in emails requested. Try again in ${mins} min.`,
      at,
    };
  }

  const supabase = await supabaseServer();
  const next = safeNext(parsed.data.next);
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: callbackUrl(await siteOrigin(), next), shouldCreateUser: true },
  });
  if (error) {
    console.error("signInWithOtp failed", error.status, error.message);
    return { status: "error", message: "Couldn't send the link. Try again in a minute.", at };
  }
  return { status: "sent", email: parsed.data.email, at };
}

export async function signInWithGoogle(form: FormData) {
  if (process.env.NEXT_PUBLIC_GOOGLE_AUTH !== "1") redirect("/login?error=oauth");
  if (!supabaseConfigured()) redirect("/login?error=not-configured");
  const next = safeNext(String(form.get("next") ?? ""));
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl(await siteOrigin(), next) },
  });
  if (error || !data.url) redirect(`/login?error=oauth&next=${encodeURIComponent(next)}`);
  redirect(data.url);
}
