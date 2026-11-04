import { Suspense } from "react";
import { redirect } from "next/navigation";
import { listScans } from "../actions";
import { currentUser } from "@/lib/supabase/server";
import { ScanTable, ScanTableSkeleton } from "@/components/app/ScanTable";

export const metadata = { title: "Scans" };

async function History({ userId }: { userId: string }) {
  const initial = await listScans({ limit: 20 });
  return <ScanTable userId={userId} initial={initial} pageSize={20} />;
}

export default async function ScansPage() {
  const { user } = await currentUser();
  if (!user) redirect("/login?next=/app/scans");
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 md:px-8">
      <h1 className="font-display text-step-4 tracking-display">Scans</h1>
      <Suspense fallback={<ScanTableSkeleton />}>
        <History userId={user.id} />
      </Suspense>
    </div>
  );
}
