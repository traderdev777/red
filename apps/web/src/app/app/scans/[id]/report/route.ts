import { NextResponse } from "next/server";
import { z } from "zod";
import { ScanResultSchema } from "@red/shared";
import { currentUser } from "@/lib/supabase/server";
import { reportMarkdown } from "@/lib/report";
import { loadAnalysis } from "@/lib/server/evidence";

/** Download the stored report. RLS decides who can read the scan. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { supabase, user } = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await supabase.from("scans").select("id, normalized_url, status, result, finished_at, cached_from").eq("id", id).maybeSingle();
  if (!data || data.status !== "done") return NextResponse.json({ error: "not_found" }, { status: 404 });
  const parsed = ScanResultSchema.safeParse(data.result);
  const analysis = parsed.success ? await loadAnalysis({ id: data.id, cached_from: data.cached_from, result: data.result }) : null;
  if (!parsed.success || !analysis) return NextResponse.json({ error: "no_analysis" }, { status: 404 });
  const host = (() => {
    try {
      return new URL(data.normalized_url).hostname;
    } catch {
      return "site";
    }
  })();
  const format = new URL(req.url).searchParams.get("format") === "json" ? "json" : "md";
  const name = `red-${host}-${id.slice(0, 8)}.${format}`;
  const body =
    format === "json"
      ? JSON.stringify({ url: data.normalized_url, finishedAt: data.finished_at, summary: parsed.data.summary, analysis }, null, 2)
      : reportMarkdown(data.normalized_url, data.finished_at, analysis);
  return new NextResponse(body, {
    headers: {
      "content-type": format === "json" ? "application/json; charset=utf-8" : "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "private, no-store",
    },
  });
}
