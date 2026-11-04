import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server";
import { ScanView, type ScanViewData } from "@/components/app/ScanView";

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
      "id, url, normalized_url, status, progress, error, cached_from, retry_of, failed_stage, attempt, created_at, finished_at",
    )
    .eq("id", id)
    .maybeSingle<ScanViewData>();
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 md:px-8">
      <ScanView initial={data} />
    </div>
  );
}
