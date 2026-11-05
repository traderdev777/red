import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, EyeOff, RotateCcw } from "lucide-react";
import { currentUser } from "@/lib/supabase/server";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { setFindingStatus } from "./actions";

export const metadata = { title: "Library" };

type Status = "open" | "done" | "dismissed";
interface Row {
  scan_id: string;
  finding_id: string;
  url_hash: string;
  normalized_url: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  kind: string;
  score: number;
  title: string;
  actions: number;
  created_at: string;
}
interface Item extends Row {
  status: Status;
  /** false = marked done earlier and not detected in the latest scan of this site. */
  current: boolean;
}

const SEV = ["critical", "high", "medium", "low", "info"] as const;
const SEV_TONE: Record<Row["severity"], string> = {
  critical: "border-risk/60 text-risk",
  high: "border-risk/40 text-risk",
  medium: "border-inferred/40 text-inferred",
  low: "border-line text-chrome-300",
  info: "border-line text-chrome-500",
};
const TABS: { key: Status | "resolved"; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "done", label: "Done" },
  { key: "resolved", label: "Verified fixed" },
  { key: "dismissed", label: "Dismissed" },
];

function host(u: string) {
  try {
    return new URL(u).host + new URL(u).pathname.replace(/\/$/, "");
  } catch {
    return u;
  }
}

function StatusButton({ item, to, label, icon }: { item: Item; to: Status; label: string; icon: typeof Check }) {
  return (
    <form action={setFindingStatus}>
      <input type="hidden" name="urlHash" value={item.url_hash} />
      <input type="hidden" name="findingId" value={item.finding_id} />
      <input type="hidden" name="status" value={to} />
      <button
        type="submit"
        aria-label={`${label}: ${item.title}`}
        className="border-line text-step-n1 text-chrome-300 hover:text-chrome-100 hover:border-chrome-500 focus-visible:shadow-glow-chrome duration-120 inline-flex h-8 items-center gap-1.5 rounded-sm border px-2 font-mono transition-colors focus-visible:outline-none"
      >
        <Icon as={icon} size={12} /> {label}
      </button>
    </form>
  );
}

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ tab?: string; severity?: string }> }) {
  const { supabase, user } = await currentUser();
  if (!user) redirect("/login?next=/app/library");
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.key === sp.tab)?.key ?? "open") as Status | "resolved";
  const sevFilter = SEV.find((s) => s === sp.severity) ?? null;

  const [{ data: rows }, { data: statuses }] = await Promise.all([
    supabase.from("scan_findings").select("*").order("created_at", { ascending: false }).limit(3000),
    supabase.from("finding_status").select("url_hash, finding_id, status"),
  ]);
  const all = (rows ?? []) as Row[];
  const statusOf = new Map((statuses ?? []).map((s) => [`${s.url_hash}|${s.finding_id}`, s.status as Status]));

  // Latest scan per site decides what is "current".
  const latestScan = new Map<string, string>();
  for (const r of all) if (!latestScan.has(r.url_hash)) latestScan.set(r.url_hash, r.scan_id);
  const items = new Map<string, Item>();
  for (const r of all) {
    const key = `${r.url_hash}|${r.finding_id}`;
    if (items.has(key)) continue; // newest row wins
    const current = latestScan.get(r.url_hash) === r.scan_id;
    items.set(key, { ...r, status: statusOf.get(key) ?? "open", current });
  }
  const list = [...items.values()];
  // An open finding no longer in the latest scan simply went away; only show items from the latest scan as open.
  const inTab = (i: Item) =>
    tab === "resolved" ? i.status === "done" && !i.current : tab === "open" ? i.status === "open" && i.current : tab === "done" ? i.status === "done" && i.current : i.status === "dismissed";
  const shown = list.filter(inTab).filter((i) => !sevFilter || i.severity === sevFilter);
  const count = (k: (typeof TABS)[number]["key"]) => list.filter((i) => (k === "resolved" ? i.status === "done" && !i.current : k === "open" ? i.status === "open" && i.current : k === "done" ? i.status === "done" && i.current : i.status === "dismissed")).length;

  const bySite = new Map<string, Item[]>();
  for (const i of shown.sort((a, b) => SEV.indexOf(a.severity) - SEV.indexOf(b.severity) || b.score - a.score)) {
    bySite.set(i.url_hash, [...(bySite.get(i.url_hash) ?? []), i]);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-12 md:px-8 md:py-16">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-step-4 tracking-display">Library</h1>
        <p className="text-step-0 text-chrome-300 max-w-[65ch]">
          Every finding from your latest scan of each site, as a work list. Mark one done, re-scan, and RED tells you whether
          it is still detected.
        </p>
      </header>

      <nav aria-label="Library views" className="border-line flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/app/library?tab=${t.key}${sevFilter ? `&severity=${sevFilter}` : ""}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "text-step-n1 -mb-px border-b-2 px-3 py-2 font-mono transition-colors duration-120",
              tab === t.key ? "border-red-500 text-chrome-100" : "border-transparent text-chrome-500 hover:text-chrome-100",
            )}
          >
            {t.label} <span className="text-chrome-500">{count(t.key)}</span>
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-2" aria-label="Filter by severity">
        <span className="text-step-n1 text-chrome-500 font-mono">severity</span>
        {[null, ...SEV].map((s) => (
          <Link
            key={s ?? "all"}
            href={`/app/library?tab=${tab}${s ? `&severity=${s}` : ""}`}
            aria-current={sevFilter === s ? "true" : undefined}
            className={cn(
              "text-step-n1 rounded-sm border px-2 py-0.5 font-mono",
              sevFilter === s ? "border-chrome-500 text-chrome-100" : "border-line text-chrome-500 hover:text-chrome-100",
            )}
          >
            {s ?? "all"}
          </Link>
        ))}
      </div>

      {all.length === 0 ? (
        <div className="border-line flex flex-col gap-3 rounded-lg border p-8">
          <h2 className="text-step-2 text-chrome-100">Nothing here yet.</h2>
          <p className="text-step-0 text-chrome-300">Findings appear after your first analyzed scan.</p>
          <Link href="/app" className="text-step-n1 text-chrome-100 font-mono underline underline-offset-4">
            Scan a site
          </Link>
        </div>
      ) : bySite.size === 0 ? (
        <p className="text-step-0 text-chrome-300">
          {tab === "open" ? "No open findings. Everything in your latest scans is done or dismissed." : tab === "resolved" ? "No fixes verified yet. Mark a finding done, then scan that site again." : "Nothing in this view."}
        </p>
      ) : (
        [...bySite.entries()].map(([hash, siteItems]) => (
          <section key={hash} aria-label={host(siteItems[0]!.normalized_url)} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-step-1 text-chrome-100 font-mono break-all">{host(siteItems[0]!.normalized_url)}</h2>
              <Link href={`/app/scans/${latestScan.get(hash)}`} className="text-step-n1 text-chrome-500 hover:text-chrome-100 font-mono">
                latest report
              </Link>
            </div>
            <ul className="border-line bg-line flex flex-col gap-px overflow-hidden rounded-lg border">
              {siteItems.map((i) => (
                <li key={i.finding_id} className="bg-ink-950 flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("text-step-n1 rounded-sm border px-1.5 font-mono uppercase", SEV_TONE[i.severity])}>{i.severity}</span>
                      <span className="text-step-n1 text-chrome-500 font-mono">
                        {i.category} · {i.kind} {i.score}
                        {i.actions ? ` · ${i.actions} build action${i.actions === 1 ? "" : "s"}` : ""}
                      </span>
                    </div>
                    <Link href={`/app/scans/${i.scan_id}#finding-${i.finding_id}`} className="text-step-0 text-chrome-100 hover:underline underline-offset-4">
                      {i.title}
                    </Link>
                    {tab === "resolved" && <p className="text-step-n1 text-detected font-mono">not detected in the latest scan of this site</p>}
                    {tab === "done" && <p className="text-step-n1 text-inferred font-mono">marked done, still detected in the latest scan</p>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {i.status !== "done" && <StatusButton item={i} to="done" label="Done" icon={Check} />}
                    {i.status !== "dismissed" && i.current && <StatusButton item={i} to="dismissed" label="Dismiss" icon={EyeOff} />}
                    {i.status !== "open" && <StatusButton item={i} to="open" label="Reopen" icon={RotateCcw} />}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
