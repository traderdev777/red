import "server-only";
import { EvidenceDocSchema, ScanResultSchema, type EvidenceDoc } from "@red/shared";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Screenshots are private; links expire after this many seconds. */
export const SIGNED_URL_TTL_S = 300;

export type EvidenceLoad =
  | { status: "ok"; doc: EvidenceDoc; screenshots: { desktop: string | null; mobile: string | null } }
  | { status: "missing" | "unreadable"; message: string };

/**
 * Loads evidence for a scan the caller has ALREADY read through RLS. The path
 * must live under that scan's folder (or the folder of the scan it was cached
 * from), so a crafted result can't point at another scan's evidence.
 */
export async function loadEvidence(scan: { id: string; cached_from: string | null; result: unknown }): Promise<EvidenceLoad> {
  const parsed = ScanResultSchema.safeParse(scan.result);
  if (!parsed.success) return { status: "missing", message: "This scan has no evidence summary." };
  const path = parsed.data.evidencePath;
  const allowed = [scan.id, scan.cached_from].filter(Boolean).map((id) => `${id}/`);
  if (!allowed.some((p) => path.startsWith(p)) || path.includes("..")) {
    return { status: "unreadable", message: "Evidence path doesn't belong to this scan." };
  }
  const admin = supabaseAdmin();
  const { data, error } = await admin.storage.from("evidence").download(path);
  if (error || !data) return { status: "missing", message: "The evidence file isn't in storage." };
  let doc: EvidenceDoc;
  try {
    const json = JSON.parse(await data.text());
    const v = EvidenceDocSchema.safeParse(json);
    if (!v.success) return { status: "unreadable", message: "The evidence file didn't match the expected format." };
    doc = v.data;
  } catch {
    return { status: "unreadable", message: "The evidence file isn't valid JSON." };
  }
  const sign = async (key: string | null) => {
    if (!key || !allowed.some((p) => key.startsWith(p))) return null;
    const { data: s } = await admin.storage.from("evidence").createSignedUrl(key, SIGNED_URL_TTL_S);
    return s?.signedUrl ?? null;
  };
  const [desktop, mobile] = await Promise.all([sign(doc.screenshots.desktop), sign(doc.screenshots.mobile)]);
  return { status: "ok", doc, screenshots: { desktop, mobile } };
}
