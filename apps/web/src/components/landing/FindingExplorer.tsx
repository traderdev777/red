"use client";

import { useState } from "react";
import type { ConfidenceKind } from "@red/shared";
import { Badge } from "@/components/ui/Badge";
import { ConfidenceMeter } from "@/components/ui/ConfidenceMeter";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { cn } from "@/lib/cn";
import { IllustrationLabel } from "./IllustrationLabel";

interface Item {
  id: string;
  title: string;
  kind: ConfidenceKind;
  score: number;
  rationale: string;
  source: string;
  locator: string;
  excerpt: string;
  highlight: number[];
}

const ITEMS: Item[] = [
  {
    id: "framework",
    title: "Framework: Next.js",
    kind: "detected",
    score: 97,
    rationale: "Two independent matches: asset paths and a response header.",
    source: "network · https://example.com/",
    locator: "script[src], response headers",
    excerpt: `<script src="/_next/static/chunks/main-app-3f2a.js" async></script>
<script src="/_next/static/chunks/app/page-91c0.js" async></script>
x-powered-by: Next.js`,
    highlight: [1, 3],
  },
  {
    id: "css",
    title: "Render-blocking stylesheets",
    kind: "detected",
    score: 92,
    rationale: "Observed in <head> with no media attribute or preload.",
    source: "html · https://example.com/",
    locator: "head > link[rel=stylesheet]",
    excerpt: `<head>
  <link rel="stylesheet" href="/css/app.css">
  <link rel="stylesheet" href="/css/vendor.css">
</head>`,
    highlight: [2, 3],
  },
  {
    id: "goal",
    title: "Primary goal: demo bookings",
    kind: "inferred",
    score: 64,
    rationale: "Signals agree but none states it outright. Confirm before acting.",
    source: "dom-snapshot · 3 pages",
    locator: "a[href*=demo], nav, form#book",
    excerpt: `nav > a[href="/demo"]          "Book a demo"   (1st CTA)
main a[href="/demo"]           appears 4× on /
form#book  fields: name, work email, company size`,
    highlight: [1],
  },
];

/** Hover or focus a finding to swap in its evidence. The swap is the only motion. */
export function FindingExplorer() {
  const [activeId, setActiveId] = useState(ITEMS[0]!.id);
  const active = ITEMS.find((i) => i.id === activeId)!;

  return (
    <figure className="flex flex-col gap-3">
      <IllustrationLabel note="sample finding set" />
      <div className="border-line bg-ink-900 overflow-hidden rounded-lg border">
        <div className="border-line flex items-center justify-between border-b px-5 py-3">
          <span className="text-step-n1 text-chrome-300 truncate font-mono">
            example.com · 3 findings
          </span>
          <span className="text-step-n2 text-chrome-500 font-mono">hover or focus</span>
        </div>
        <ul aria-label="Findings" className="divide-line divide-y">
          {ITEMS.map((it) => {
            const on = it.id === activeId;
            return (
              <li key={it.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onPointerEnter={() => setActiveId(it.id)}
                  onFocus={() => setActiveId(it.id)}
                  onClick={() => setActiveId(it.id)}
                  className={cn(
                    "duration-120 ease-out-expo relative flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors",
                    on ? "bg-ink-800" : "hover:bg-ink-800/60",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-y-0 left-0 w-0.5",
                      on ? "bg-chrome-100" : "bg-transparent",
                    )}
                  />
                  <span className={cn("text-step-0", on ? "text-chrome-100" : "text-chrome-300")}>
                    {it.title}
                  </span>
                  <Badge kind={it.kind} />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="border-line flex flex-col gap-5 border-t p-5" aria-live="polite">
          <ConfidenceMeter
            kind={active.kind}
            value={active.score}
            label={`Confidence · ${active.title}`}
          />
          <p className="text-step-n1 text-chrome-300">{active.rationale}</p>
          <div className="flex flex-col gap-2">
            <span className="text-step-n2 text-chrome-500 font-mono">
              source <span className="text-chrome-300">{active.source}</span> · locator{" "}
              <span className="text-chrome-300">{active.locator}</span>
            </span>
            <CodeBlock
              filename="evidence excerpt"
              code={active.excerpt}
              highlight={active.highlight}
            />
          </div>
        </div>
      </div>
    </figure>
  );
}
