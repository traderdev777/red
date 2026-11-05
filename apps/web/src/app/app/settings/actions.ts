"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { seal } from "@red/shared/server";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type KeyState = { status: "idle" } | { status: "ok" | "error"; message: string; at: number };

const KeyInput = z
  .string()
  .trim()
  .min(20, "That doesn't look like a Gemini API key.")
  .max(200, "That doesn't look like a Gemini API key.")
  .regex(/^[A-Za-z0-9_\-.]+$/, "Paste only the key, with no spaces or quotes.");

/** Asks Google whether the key works (lists models). Never logs or returns the key. */
async function verify(key: string): Promise<"ok" | "rejected" | "unreachable"> {
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
      headers: { "x-goog-api-key": key },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) return "ok";
    return res.status === 400 || res.status === 401 || res.status === 403 ? "rejected" : "unreachable";
  } catch {
    return "unreachable";
  }
}

export async function saveGeminiKey(_prev: KeyState, form: FormData): Promise<KeyState> {
  const { user } = await currentUser();
  if (!user) return { status: "error", message: "Sign in again to save a key.", at: Date.now() };
  const parsed = KeyInput.safeParse(form.get("key"));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]!.message, at: Date.now() };
  const key = parsed.data;
  const check = await verify(key);
  if (check === "rejected") return { status: "error", message: "Google rejected this key. Nothing was saved.", at: Date.now() };
  if (check === "unreachable") return { status: "error", message: "Couldn't reach Google to check the key. Nothing was saved; try again.", at: Date.now() };
  let ciphertext: string;
  try {
    ciphertext = seal(key);
  } catch {
    return { status: "error", message: "Key storage isn't configured on this server. Nothing was saved.", at: Date.now() };
  }
  const { error } = await supabaseAdmin()
    .from("user_gemini_keys")
    .upsert({ user_id: user.id, ciphertext, last4: key.slice(-4), verified_at: new Date().toISOString() });
  if (error) return { status: "error", message: "Couldn't save the key. Nothing was stored.", at: Date.now() };
  revalidatePath("/app/settings");
  return { status: "ok", message: `Saved. Your next scans use the key ending in ${key.slice(-4)}.`, at: Date.now() };
}

export async function removeGeminiKey(): Promise<void> {
  const { user } = await currentUser();
  if (!user) return;
  await supabaseAdmin().from("user_gemini_keys").delete().eq("user_id", user.id);
  revalidatePath("/app/settings");
}
