"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server";

const Input = z.object({
  urlHash: z.string().regex(/^[0-9a-f]{64}$/),
  findingId: z.string().min(1).max(120),
  status: z.enum(["open", "done", "dismissed"]),
});

/** Sets the caller's own triage status for a finding on a site. RLS scopes every write to auth.uid(). */
export async function setFindingStatus(form: FormData): Promise<void> {
  const parsed = Input.safeParse({ urlHash: form.get("urlHash"), findingId: form.get("findingId"), status: form.get("status") });
  if (!parsed.success) return;
  const { supabase, user } = await currentUser();
  if (!user) return;
  const { urlHash, findingId, status } = parsed.data;
  if (status === "open") {
    await supabase.from("finding_status").delete().eq("url_hash", urlHash).eq("finding_id", findingId);
  } else {
    const { data } = await supabase
      .from("finding_status")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("url_hash", urlHash)
      .eq("finding_id", findingId)
      .select("finding_id");
    if (!data?.length) await supabase.from("finding_status").insert({ url_hash: urlHash, finding_id: findingId, status });
  }
  revalidatePath("/app/library");
}
