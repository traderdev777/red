"use client";

import { useEffect, useState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { colorTokens, contrast } from "@/lib/tokens";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { SectionHeader, Specimen } from "./SectionHeader";

function readVar(name: string): string | null {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  const parts = raw.split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return (
    "#" +
    parts
      .map((p) => p.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

const PAGE = "#05060A";

export function ColorSection() {
  const [live, setLive] = useState<Record<string, string | null>>({});
  useEffect(() => {
    setLive(Object.fromEntries(colorTokens.map((t) => [t.name, readVar(t.name)])));
  }, []);
  const checked = Object.keys(live).length > 0;
  const drift = colorTokens.filter((t) => checked && live[t.name] !== t.hex);

  return (
    <section id="color" aria-labelledby="color-title" className="flex scroll-mt-24 flex-col gap-12">
      <SectionHeader id="color" n="01" title="Color">
        Black, signal red, chrome. Taken from the mark, nothing added. Every value below is read
        live from <code className="text-step-n1 text-chrome-100 font-mono">tokens.css</code> and
        checked against the manifest, so drift shows up here before it ships.
      </SectionHeader>

      <div className="grid grid-cols-12 gap-6">
        {/* Ink planes: elevation is a step in lightness, never a shadow */}
        <Specimen
          label="Elevation by ink"
          note="no drop shadows"
          className="col-span-12 lg:col-span-5"
        >
          <div className="border-line bg-ink-950 relative h-80 rounded-lg border p-6">
            <div className="border-line bg-ink-900 absolute inset-x-6 bottom-6 top-14 rounded-lg border p-5">
              <span className="text-step-n2 text-chrome-500 font-mono">ink-900 · surface</span>
              <div className="border-line bg-ink-800 absolute inset-x-5 bottom-5 top-12 rounded-md border p-4">
                <span className="text-step-n2 text-chrome-500 font-mono">ink-800 · raised</span>
                <p className="text-step-n1 text-chrome-300 mt-3 max-w-[28ch]">
                  Popovers, toasts, and hovered rows sit here. One step up, one border.
                </p>
              </div>
            </div>
            <span className="text-step-n2 text-chrome-500 absolute left-6 top-5 font-mono">
              ink-950 · page
            </span>
          </div>
        </Specimen>

        <Specimen
          label="Tokens"
          note={
            !checked
              ? "reading css…"
              : drift.length
                ? `${drift.length} drifted`
                : "13 of 13 in sync"
          }
          className="col-span-12 lg:col-span-7"
        >
          <ul className="divide-line border-line divide-y rounded-lg border">
            {colorTokens.map((t) => {
              const ratio = contrast(t.hex, PAGE);
              const ok = !checked || live[t.name] === t.hex;
              return (
                <li
                  key={t.name}
                  className="grid grid-cols-[2rem_7.5rem_5.5rem_1fr_auto] items-center gap-4 px-4 py-3"
                >
                  <span
                    aria-hidden
                    className="border-line h-6 w-6 rounded-sm border"
                    style={{ background: `rgb(var(--${t.name}))` }}
                  />
                  <span className="text-step-n1 text-chrome-100 font-mono">--{t.name}</span>
                  <span className="text-step-n1 text-chrome-300 font-mono">{t.hex}</span>
                  <span className="text-step-n1 text-chrome-500 truncate">{t.role}</span>
                  <span className="text-step-n2 text-chrome-500 flex items-center gap-3 font-mono">
                    <span title="Contrast against ink-950" className="tabular-nums">
                      {ratio.toFixed(1)}:1
                    </span>
                    {ok ? (
                      <Icon
                        as={Check}
                        size={12}
                        className="text-detected"
                        label="In sync with tokens.css"
                      />
                    ) : (
                      <Icon
                        as={TriangleAlert}
                        size={12}
                        className="text-risk"
                        label={`Drift: CSS has ${live[t.name] ?? "nothing"}`}
                      />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </Specimen>

        <div className="col-span-12 grid grid-cols-12 gap-6 lg:col-span-7 lg:col-start-6">
          <Specimen
            label="Red budget"
            note="8% of any screen, maximum"
            className="col-span-12 md:col-span-7"
          >
            <div className="grid grid-cols-[repeat(25,minmax(0,1fr))] gap-[3px]" aria-hidden>
              {Array.from({ length: 100 }, (_, i) => (
                <span
                  key={i}
                  className={cn("aspect-square rounded-[1px]", i < 8 ? "bg-red-500" : "bg-ink-800")}
                />
              ))}
            </div>
            <p className="text-step-n1 text-chrome-300">
              Red marks the one action, the active state, or a risk. If a screen needs more red than
              this to read, the hierarchy is wrong.
            </p>
          </Specimen>
          <Specimen label="Banned" className="col-span-12 md:col-span-5">
            <ul className="text-step-n1 text-chrome-300 flex flex-col gap-2">
              <li>A second red, or any pink or orange standing in for one</li>
              <li>Purple, and blue-to-purple gradients</li>
              <li>Rainbow or multi-hue charts; status colors only mean status</li>
              <li>Red as decoration: dividers, backgrounds, icons at rest</li>
            </ul>
          </Specimen>
        </div>
      </div>
    </section>
  );
}
