import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Config } from "./config";

export const ClaimedScanSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  url: z.string(),
  normalized_url: z.string(),
  url_hash: z.string(),
  status: z.literal("collecting"),
  attempt: z.number().int(),
  created_at: z.string(),
});
export type ClaimedScan = z.infer<typeof ClaimedScanSchema>;

export class Db {
  readonly client: SupabaseClient;
  constructor(
    private readonly cfg: Config,
    client?: SupabaseClient,
  ) {
    this.client =
      client ??
      createClient(cfg.SUPABASE_URL, cfg.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 5 } },
      });
  }

  async claim(): Promise<ClaimedScan | null> {
    const { data, error } = await this.client.rpc("claim_next_scan", { p_worker_id: this.cfg.workerId });
    if (error) throw new Error(`claim_next_scan: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    return row ? ClaimedScanSchema.parse(row) : null;
  }

  /** false = we no longer own this scan (reaped, or finished elsewhere). */
  async progress(scanId: string, progress: number, status?: "collecting" | "analyzing"): Promise<boolean> {
    const { data, error } = await this.client.rpc("update_scan_progress", {
      p_scan_id: scanId,
      p_worker_id: this.cfg.workerId,
      p_progress: progress,
      p_status: status ?? null,
    });
    if (error) throw new Error(`update_scan_progress: ${error.message}`);
    return data === true;
  }

  async complete(scanId: string, result: unknown): Promise<boolean> {
    const { data, error } = await this.client.rpc("complete_scan", {
      p_scan_id: scanId,
      p_worker_id: this.cfg.workerId,
      p_result: result,
    });
    if (error) throw new Error(`complete_scan: ${error.message}`);
    return data === true;
  }

  async fail(scanId: string, message: string): Promise<boolean> {
    const { data, error } = await this.client.rpc("fail_scan", {
      p_scan_id: scanId,
      p_worker_id: this.cfg.workerId,
      p_error: message,
    });
    if (error) throw new Error(`fail_scan: ${error.message}`);
    return data === true;
  }

  async reap(timeoutS: number): Promise<string[]> {
    const { data, error } = await this.client.rpc("reap_stuck_scans", { p_timeout_seconds: timeoutS });
    if (error) throw new Error(`reap_stuck_scans: ${error.message}`);
    return (data ?? []) as string[];
  }

  async queueStats(): Promise<{ queued: number; active: number; oldest_queued_at: string | null }> {
    const { data, error } = await this.client.rpc("scan_queue_stats");
    if (error) throw new Error(`scan_queue_stats: ${error.message}`);
    const r = (Array.isArray(data) ? data[0] : data) ?? {};
    return { queued: Number(r.queued ?? 0), active: Number(r.active ?? 0), oldest_queued_at: r.oldest_queued_at ?? null };
  }

  async audit(scan: { id: string; user_id: string; url_hash: string }, event: "scan.blocked_ssrf" | "scan.blocked_bot_wall", detail: Record<string, unknown>) {
    const { error } = await this.client
      .from("scan_audit")
      .insert({ scan_id: scan.id, user_id: scan.user_id, url_hash: scan.url_hash, event, detail });
    if (error) throw new Error(`scan_audit: ${error.message}`);
  }

  async upload(path: string, body: Buffer | string, contentType: string): Promise<void> {
    const { error } = await this.client.storage
      .from("evidence")
      .upload(path, body, { contentType, upsert: true });
    if (error) throw new Error(`storage upload ${path}: ${error.message}`);
  }
}
