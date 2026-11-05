import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server";
import { ScanView, type ScanViewData } from "@/components/app/ScanView";
import { EvidencePanel } from "@/components/app/evidence/EvidencePanel";
import { ReportPanel } from "@/components/app/report/ReportPanel";
import { loadAnalysis, loadEvidence } from "@/lib/server/evidence";
import { scannerHealth } from "@/lib/server/scanner";

export const metadata = { title: "Scan" };

export default async function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { supabase, user } = await currentUser();
  if (!user) redirect(`/login?next=/app/scans/${id}`);

  // RLS: another user's scan id reads as not found.
  const { data } = await supabase
    .from("scans")
    .select(
      "id, url, normalized_url, status, progress, error, cached_from, retry_of, failed_stage, attempt, created_at, started_at, finished_at, result",
    )
    .eq("id", id)
    .maybeSingle<ScanViewData & { result: unknown }>();
  if (!data) notFound();
  const { result, ...scan } = data;

  // Evidence only for a finished scan, and only after the RLS read above succeeded.
  const ref = { id: scan.id, cached_from: scan.cached_from, result };
  const [evidence, analysis, health] = await Promise.all([
    scan.status === "done" ? loadEvidence(ref) : null,
    scan.status === "done" ? loadAnalysis(ref) : null,
    scan.status === "queued" ? scannerHealth() : null,
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 md:px-8">
      <ScanView
        initial={scan}
        scanner={health}
        evidence={
          evidence ? (
            <div className="flex flex-col gap-12">
              {analysis ? (
                <ReportPanel analysis={analysis} scanId={scan.id} />
              ) : (
                <p className="text-step-n1 text-chrome-500 font-mono">
                  No analysis on this scan: it finished before the analysis stage existed. Scan again for findings.
                </p>
              )}
              <div className="border-line border-t pt-10">
                <EvidencePanel load={evidence} collectedAt={scan.finished_at} />
              </div>
            </div>
          ) : null
        }
      />
    </div>
  );
}
