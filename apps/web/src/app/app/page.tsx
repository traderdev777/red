import { Suspense } from "react";
import { redirect } from "next/navigation";
import { validatePublicUrl } from "@red/shared";
import { listScans } from "./actions";
import { currentUser } from "@/lib/supabase/server";
import { ScanForm } from "@/components/app/ScanForm";
import { ScanTable, ScanTableSkeleton } from "@/components/app/ScanTable";

export const metadata = { title: "New scan" };

const RESUME_NOTICE: Record<string, string> = {
  quota: "You're signed in, but today's scan limit is used up, so the scan didn't start.",
  "unsafe-url": "You're signed in. That URL didn't pass the server-side safety check.",
  "rate-limited": "You're signed in. Too many scans just now; press Scan to try again.",
  error: "You're signed in. The scan couldn't start; press Scan to try again.",
  invalid: "You're signed in. Check the URL and press Scan.",
};

async function History({ userId }: { userId: string }) {
  const initial = await listScans({ limit: 10 });
  return <ScanTable userId={userId} initial={initial} pageSize={10} />;
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; resume?: string }>;
}) {
  const { user } = await currentUser();
  if (!user) redirect("/login?next=/app");
  const sp = await searchParams;
  const prefill = typeof sp.url === "string" ? sp.url.slice(0, 2048) : undefined;
  let notice = sp.resume
    ? RESUME_NOTICE[sp.resume]
    : prefill
      ? "Ready when you are. Press Scan to start."
      : undefined;
  if (sp.resume === "unsafe-url" && prefill) {
    const check = validatePublicUrl(prefill);
    notice = `You're signed in. The scan didn't start: ${check.ok ? "that host resolves to a private or reserved address." : check.message}`;
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-16 px-4 py-12 md:px-8 md:py-16">
      <section aria-labelledby="new-scan" className="flex max-w-3xl flex-col gap-6">
        <h1 id="new-scan" className="font-display text-step-4 tracking-display">
          Scan a site.
        </h1>
        <ScanForm initialUrl={prefill} notice={notice} />
      </section>

      <section aria-labelledby="recent" className="flex flex-col gap-5">
        <h2 id="recent" className="text-step-n2 tracking-label text-chrome-500 font-mono uppercase">
          Recent scans
        </h2>
        <Suspense fallback={<ScanTableSkeleton />}>
          <History userId={user.id} />
        </Suspense>
      </section>
    </div>
  );
}
