"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ScanListQuerySchema, ScanRowSchema, type ScanRow } from "@red/shared";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { retryScanCore, startScanCore, type StartScanResult } from "@/lib/server/scans";
import { clientIp } from "@/lib/server/request";

async function requireUser() {
  const { supabase, user } = await currentUser();
  if (!user) redirect("/login?next=/app");
  return { supabase, user };
}

export type StartScanState = { status: "idle" } | (StartScanResult & { at: number });

export async function startScan(_prev: StartScanState, form: FormData): Promise<StartScanState> {
  const { supabase, user } = await requireUser();
  const result = await startScanCore({
    supabase,
    user,
    rawUrl: form.get("url"),
    ip: await clientIp(),
  });
  if (result.ok) revalidatePath("/app", "layout");
  return { ...result, at: Date.now() };
}

const RetrySchema = z.object({ scanId: z.string().uuid() });

export async function retryScan(_prev: StartScanState, form: FormData): Promise<StartScanState> {
  const { supabase, user } = await requireUser();
  const parsed = RetrySchema.safeParse({ scanId: form.get("scanId") });
  if (!parsed.success)
    return { ok: false, code: "invalid", message: "Unknown scan.", at: Date.now() };
  const result = await retryScanCore({
    supabase,
    user,
    scanId: parsed.data.scanId,
    ip: await clientIp(),
  });
  if (result.ok) revalidatePath("/app", "layout");
  return { ...result, at: Date.now() };
}

export type ScanListItem = Pick<
  ScanRow,
  | "id"
  | "url"
  | "normalized_url"
  | "status"
  | "progress"
  | "created_at"
  | "finished_at"
  | "cached_from"
  | "error"
>;
export type ScanPage = {
  items: ScanListItem[];
  nextCursor: { createdAt: string; id: string } | null;
};

const ListItemSchema = ScanRowSchema.pick({
  id: true,
  url: true,
  normalized_url: true,
  status: true,
  progress: true,
  created_at: true,
  finished_at: true,
  cached_from: true,
  error: true,
});

const COLUMNS =
  "id, url, normalized_url, status, progress, created_at, finished_at, cached_from, error";

/** Newest first, keyset pagination on (created_at, id). Reads through RLS. */
export async function listScans(input: unknown): Promise<ScanPage> {
  const { supabase } = await requireUser();
  const q = ScanListQuerySchema.parse(input ?? {});
  let query = supabase
    .from("scans")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(q.limit + 1);
  if (q.status !== "all") query = query.eq("status", q.status);
  if (q.q) query = query.ilike("normalized_url", `%${q.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
  if (q.cursor) {
    const c = q.cursor.createdAt;
    query = query.or(`created_at.lt."${c}",and(created_at.eq."${c}",id.lt.${q.cursor.id})`);
  }
  const { data, error } = await query;
  if (error) throw new Error(`listScans: ${error.message}`);
  const rows: ScanListItem[] = (data ?? []).map((r) => ListItemSchema.parse(r));
  const more = rows.length > q.limit;
  const items = more ? rows.slice(0, q.limit) : rows;
  const last = items.at(-1);
  return { items, nextCursor: more && last ? { createdAt: last.created_at, id: last.id } : null };
}

const DeleteSchema = z.object({ confirm: z.string().trim().toLowerCase() });
export type DeleteState = { status: "idle" } | { status: "error"; message: string; at: number };

export async function deleteAccount(_prev: DeleteState, form: FormData): Promise<DeleteState> {
  const { supabase, user } = await requireUser();
  const parsed = DeleteSchema.safeParse({ confirm: form.get("confirm") });
  if (!parsed.success || parsed.data.confirm !== (user.email ?? "").toLowerCase()) {
    return { status: "error", message: "Type your email exactly to confirm.", at: Date.now() };
  }
  // Cascades: profiles, scans, scan_usage (FK on delete cascade). Audit rows keep no user id.
  const { error } = await supabaseAdmin().auth.admin.deleteUser(user.id);
  if (error) {
    console.error("deleteUser failed", error.message);
    return {
      status: "error",
      message: "Couldn't delete the account. Nothing was removed.",
      at: Date.now(),
    };
  }
  await supabase.auth.signOut();
  redirect("/login?deleted=1");
}
