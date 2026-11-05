/* eslint-disable @next/next/no-img-element -- signed, short-lived Storage URLs; next/image would cache them past expiry */
import type { EvidenceDoc, Pass, Vitals } from "@red/shared";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import type { EvidenceLoad } from "@/lib/server/evidence";
import { SIGNED_URL_TTL_S } from "@/lib/server/evidence";

/**
 * "Evidence collected": only facts the scanner read directly. No findings,
 * no scores of our own, no interpretation. Every number here is in evidence.json.
 */

type Rating = "good" | "needs-improvement" | "poor";
const TONE: Record<Rating, string> = {
  good: "text-detected",
  "needs-improvement": "text-inferred",
  poor: "text-risk",
};
const RATING_LABEL: Record<Rating, string> = { good: "good", "needs-improvement": "needs work", poor: "poor" };

/** web.dev thresholds (good ≤ first, poor > second). */
const VITAL_THRESHOLDS = {
  lcpMs: [2500, 4000],
  fcpMs: [1800, 3000],
  cls: [0.1, 0.25],
  inpProxyMs: [200, 500],
  tbtProxyMs: [200, 600],
} as const;

function rate(v: number | null, [good, poor]: readonly [number, number]): Rating | null {
  if (v == null) return null;
  return v <= good ? "good" : v <= poor ? "needs-improvement" : "poor";
}
const rateScore = (s: number | null): Rating | null => (s == null ? null : s >= 90 ? "good" : s >= 50 ? "needs-improvement" : "poor");

const ms = (v: number | null) => (v == null ? "n/a" : v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`);
function bytes(n: number | null | undefined) {
  if (n == null) return "n/a";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
const short = (u: string, n = 72) => {
  try {
    const x = new URL(u);
    const s = `${x.host}${x.pathname}${x.search}`;
    return s.length > n ? `${s.slice(0, n - 1)}…` : s;
  } catch {
    return u.slice(0, n);
  }
};

function Section({ title, meta, children }: { title: string; meta?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-line flex flex-col gap-4 border-t pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-step-1 text-chrome-100">{title}</h3>
        {meta && <span className="text-step-n1 text-chrome-500 font-mono">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="bg-ink-950 flex flex-col gap-1 p-4">
      <dt className="text-step-n1 text-chrome-500 font-mono">{label}</dt>
      <dd className={cn("text-step-1 text-chrome-100 font-mono", tone)}>{value}</dd>
    </div>
  );
}

function VitalsGrid({ v, label }: { v: Vitals; label: string }) {
  const rows: { key: keyof typeof VITAL_THRESHOLDS; name: string; fmt: (x: number | null) => string }[] = [
    { key: "lcpMs", name: "LCP", fmt: ms },
    { key: "fcpMs", name: "FCP", fmt: ms },
    { key: "cls", name: "CLS", fmt: (x) => (x == null ? "n/a" : x.toFixed(3)) },
    { key: "tbtProxyMs", name: "TBT (proxy)", fmt: ms },
    { key: "inpProxyMs", name: "INP (proxy)", fmt: ms },
  ];
  return (
    <div className="flex flex-col gap-2">
      <p className="text-step-n1 text-chrome-300 font-mono">{label}</p>
      <dl className="border-line bg-line grid grid-cols-2 gap-px overflow-hidden rounded-md border sm:grid-cols-5">
        {rows.map((r) => {
          const val = v[r.key];
          const rating = rate(val, VITAL_THRESHOLDS[r.key]);
          return (
            <Fact
              key={r.key}
              label={r.name}
              value={
                <span className="flex flex-col">
                  <span className={rating ? TONE[rating] : undefined}>{r.fmt(val)}</span>
                  <span className="text-step-n1 text-chrome-500">{rating ? RATING_LABEL[rating] : "not observed"}</span>
                </span>
              }
            />
          );
        })}
      </dl>
    </div>
  );
}

function Waterfall({ pass }: { pass: Pass }) {
  const entries = pass.network.entries.slice(0, 30);
  const end = Math.max(1, ...entries.map((e) => e.startMs + (e.durationMs ?? 0)));
  const types = Object.entries(pass.network.byType).sort((a, b) => b[1].bytes - a[1].bytes);
  return (
    <div className="flex flex-col gap-4">
      <dl className="border-line bg-line grid grid-cols-2 gap-px overflow-hidden rounded-md border sm:grid-cols-4">
        <Fact label="requests" value={pass.network.totalRequests} />
        <Fact label="transferred" value={bytes(pass.network.transferBytes)} />
        <Fact label="third-party requests" value={pass.network.entries.filter((e) => e.party === "third").length} />
        <Fact label="failed" value={pass.console.failedRequests.length} />
      </dl>
      <div className="overflow-x-auto">
        <table className="text-step-n1 w-full min-w-[36rem] font-mono">
          <caption className="sr-only">Transfer by resource type</caption>
          <thead className="text-chrome-500">
            <tr>
              <th scope="col" className="py-1 pr-4 text-left font-normal">type</th>
              <th scope="col" className="py-1 pr-4 text-right font-normal">requests</th>
              <th scope="col" className="py-1 text-right font-normal">transferred</th>
            </tr>
          </thead>
          <tbody className="text-chrome-300">
            {types.map(([t, s]) => (
              <tr key={t} className="border-line border-t">
                <td className="py-1 pr-4">{t}</td>
                <td className="py-1 pr-4 text-right">{s.count}</td>
                <td className="py-1 text-right">{bytes(s.bytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figure className="flex flex-col gap-2">
        <figcaption className="text-step-n1 text-chrome-500 font-mono">
          first {entries.length} of {pass.network.totalRequests} requests by start time, 0 to {ms(end)}
        </figcaption>
        <ol className="flex flex-col gap-1" aria-label="Request waterfall">
          {entries.map((e, i) => {
            const left = (e.startMs / end) * 100;
            const width = Math.max(0.6, ((e.durationMs ?? 0) / end) * 100);
            return (
              <li key={`${e.url}-${i}`} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-3">
                <span className="text-step-n1 text-chrome-300 truncate font-mono" title={e.url}>
                  <span className="text-chrome-500">{e.status ?? "—"} </span>
                  {short(e.url, 60)}
                </span>
                <span className="bg-ink-950 relative h-3 rounded-sm" aria-label={`starts ${ms(e.startMs)}, takes ${ms(e.durationMs)}`}>
                  <span
                    className={cn("absolute inset-y-0 rounded-sm", e.party === "third" ? "bg-chrome-500" : "bg-chrome-300", e.failed && "bg-risk")}
                    style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}
                  />
                </span>
              </li>
            );
          })}
        </ol>
        <p className="text-step-n1 text-chrome-500 font-mono">light bar first-party · grey bar third-party · red bar failed</p>
      </figure>
    </div>
  );
}

export function EvidencePanel({ load, collectedAt }: { load: EvidenceLoad; collectedAt: string | null }) {
  if (load.status !== "ok") {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-step-2 text-chrome-100">Evidence couldn&rsquo;t be shown.</h2>
        <p className="text-step-0 text-chrome-300 max-w-[60ch]">{load.message}</p>
      </div>
    );
  }
  const d: EvidenceDoc = load.doc;
  const p = d.passes.desktop;
  const sec = Object.entries(p.document.security);
  const lh = d.lighthouse;
  const scores = [
    ["Performance", lh.scores.performance],
    ["Accessibility", lh.scores.accessibility],
    ["Best practices", lh.scores.bestPractices],
    ["SEO", lh.scores.seo],
  ] as const;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Badge kind="detected" />
          <span className="text-step-n1 text-chrome-500 font-mono">
            read directly from the page · {Math.round(d.durationMs / 1000)}s · {d.scanner.userAgent}
          </span>
        </div>
        <h2 className="text-step-2 text-chrome-100">Evidence collected</h2>
        <p className="text-step-0 text-chrome-300 max-w-[65ch]">
          What a visitor&rsquo;s browser received from {short(p.navigation.finalUrl, 60)}. Analysis and findings are not run
          yet; nothing here is interpreted.
        </p>
        {d.truncated && (
          <p className="text-step-n1 text-inferred font-mono">truncated: {d.truncation.join(", ")} exceeded the evidence caps</p>
        )}
        {collectedAt && <p className="sr-only">Collected at {collectedAt}</p>}
      </header>

      <Section title="Screenshots" meta={`above the fold · links expire in ${SIGNED_URL_TTL_S / 60} min`}>
        <div className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
          {(
            [
              ["desktop", "Desktop, 1440 × 900", load.screenshots.desktop],
              ["mobile", "Mobile, 390 × 844", load.screenshots.mobile],
            ] as const
          ).map(([k, caption, src]) => (
            <figure key={k} className="flex flex-col gap-2">
              {src ? (
                <img
                  src={src}
                  alt={`${caption} screenshot of ${short(p.navigation.finalUrl, 40)}`}
                  className="border-line bg-ink-950 w-full rounded-md border"
                  loading="lazy"
                />
              ) : (
                <div className="border-line bg-ink-950 text-step-n1 text-chrome-500 flex aspect-video items-center justify-center rounded-md border font-mono">
                  {k === "mobile" && d.mobileError ? d.mobileError : "no screenshot"}
                </div>
              )}
              <figcaption className="text-step-n1 text-chrome-500 font-mono">{caption}</figcaption>
            </figure>
          ))}
        </div>
      </Section>

      <Section title="Navigation" meta={`HTTP ${p.navigation.status ?? "n/a"}`}>
        <dl className="border-line bg-line grid grid-cols-2 gap-px overflow-hidden rounded-md border sm:grid-cols-4">
          <Fact label="TTFB" value={ms(p.navigation.timing.ttfbMs)} />
          <Fact label="DOMContentLoaded" value={ms(p.navigation.timing.domContentLoadedMs)} />
          <Fact label="load" value={ms(p.navigation.timing.loadMs)} />
          <Fact label="redirects" value={p.navigation.redirectChain.length} />
        </dl>
        <ol className="text-step-n1 text-chrome-300 flex flex-col gap-1 font-mono">
          {p.navigation.redirectChain.map((h, i) => (
            <li key={i} className="break-all">
              <span className="text-chrome-500">{h.status} </span>
              {h.url}
            </li>
          ))}
          <li className="break-all">
            <span className="text-chrome-500">{p.navigation.status} </span>
            {p.navigation.finalUrl}
          </li>
        </ol>
      </Section>

      <Section title="Web vitals" meta="one lab load, no interaction; proxies marked">
        <VitalsGrid v={p.vitals} label="desktop" />
        {d.passes.mobile ? <VitalsGrid v={d.passes.mobile.vitals} label="mobile" /> : <p className="text-step-n1 text-chrome-500 font-mono">mobile pass: {d.mobileError ?? "not run"}</p>}
      </Section>

      <Section title="Lighthouse" meta={lh.status === "ok" ? `v${lh.version} · mobile profile` : lh.status}>
        {lh.status === "ok" ? (
          <dl className="border-line bg-line grid grid-cols-2 gap-px overflow-hidden rounded-md border sm:grid-cols-4">
            {scores.map(([name, s]) => {
              const r = rateScore(s);
              return <Fact key={name} label={name} value={s ?? "n/a"} tone={r ? TONE[r] : undefined} />;
            })}
          </dl>
        ) : (
          <p className="text-step-n1 text-chrome-300 font-mono">Lighthouse {lh.status}: {lh.reason}</p>
        )}
      </Section>

      <Section title="Response headers" meta={`${p.document.headers.length} headers on the document`}>
        <ul className="flex flex-wrap gap-2" aria-label="Security headers">
          {sec.map(([name, present]) => (
            <li
              key={name}
              className={cn(
                "text-step-n1 rounded-sm border px-2 py-0.5 font-mono",
                present ? "border-detected/30 text-detected" : "border-line text-chrome-500",
              )}
            >
              {present ? "present" : "absent"} · {name}
            </li>
          ))}
        </ul>
        <details className="group">
          <summary className="text-step-n1 text-chrome-300 hover:text-chrome-100 cursor-pointer font-mono">all headers</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="text-step-n1 w-full font-mono">
              <caption className="sr-only">Document response headers</caption>
              <tbody>
                {p.document.headers.map((h, i) => (
                  <tr key={`${h.name}-${i}`} className="border-line border-t align-top">
                    <th scope="row" className="text-chrome-500 py-1 pr-4 text-left font-normal whitespace-nowrap">{h.name}</th>
                    <td className="text-chrome-300 py-1 break-all">{h.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Section>

      <Section title="Requests" meta="desktop pass">
        <Waterfall pass={p} />
      </Section>

      <Section title="Third parties" meta={`${d.thirdParties.length} domains · from the shared vendor list`}>
        {d.thirdParties.length === 0 ? (
          <p className="text-step-n1 text-chrome-500 font-mono">No third-party requests on the desktop load.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-step-n1 w-full min-w-[32rem] font-mono">
              <caption className="sr-only">Third-party domains</caption>
              <thead className="text-chrome-500">
                <tr>
                  <th scope="col" className="py-1 pr-4 text-left font-normal">domain</th>
                  <th scope="col" className="py-1 pr-4 text-left font-normal">vendor</th>
                  <th scope="col" className="py-1 pr-4 text-left font-normal">category</th>
                  <th scope="col" className="py-1 pr-4 text-right font-normal">requests</th>
                  <th scope="col" className="py-1 text-right font-normal">transferred</th>
                </tr>
              </thead>
              <tbody className="text-chrome-300">
                {d.thirdParties.slice(0, 40).map((t) => (
                  <tr key={t.domain} className="border-line border-t">
                    <td className="py-1 pr-4">{t.domain}</td>
                    <td className="py-1 pr-4">{t.vendor ?? <span className="text-chrome-500">unlisted</span>}</td>
                    <td className="py-1 pr-4">{t.category}</td>
                    <td className="py-1 pr-4 text-right">{t.requests}</td>
                    <td className="py-1 text-right">{bytes(t.transferBytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Cookies" meta="names and flags only; values are never stored">
        {p.cookies.length === 0 ? (
          <p className="text-step-n1 text-chrome-500 font-mono">No cookies were set during the desktop load.</p>
        ) : (
          <ul className="text-step-n1 text-chrome-300 flex flex-col gap-1 font-mono">
            {p.cookies.map((c, i) => (
              <li key={`${c.name}-${c.domain}-${i}`} className="break-all">
                <span className="text-chrome-100">{c.name}</span>
                <span className="text-chrome-500">
                  {" "}
                  · {c.domain}
                  {c.thirdParty ? " · third-party" : ""}
                  {c.secure ? " · Secure" : ""}
                  {c.httpOnly ? " · HttpOnly" : ""}
                  {c.sameSite ? ` · SameSite=${c.sameSite}` : ""}
                  {c.expires ? ` · expires ${c.expires.slice(0, 10)}` : " · session"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Site files, TLS and DNS">
        <dl className="border-line bg-line grid grid-cols-1 gap-px overflow-hidden rounded-md border sm:grid-cols-3">
          <Fact label="TLS" value={<span className="text-step-n1">{d.tls ? `${d.tls.protocol ?? "?"} · ${d.tls.issuer ?? "?"}` : "n/a"}</span>} />
          <Fact
            label="host network"
            value={<span className="text-step-n1">{d.dns?.asn[0]?.org ?? d.dns?.cnameChain.at(-1) ?? "n/a"}</span>}
          />
          <Fact label="source maps referenced" value={d.sourceMaps.referenced.length} />
        </dl>
        <ul className="text-step-n1 flex flex-wrap gap-2 font-mono" aria-label="Well-known files">
          {d.wellKnown.map((w) => (
            <li key={w.path} className={cn("rounded-sm border px-2 py-0.5", w.exists ? "border-detected/30 text-detected" : "border-line text-chrome-500")}>
              {w.exists ? "found" : "missing"} · {w.path}
              {w.exists && w.bytes != null ? ` · ${bytes(w.bytes)}` : ""}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
