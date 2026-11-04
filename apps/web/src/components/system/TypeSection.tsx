"use client";

import { useEffect, useRef, useState } from "react";
import { typeSteps } from "@/lib/tokens";
import { SectionHeader, Specimen } from "./SectionHeader";

export function TypeSection() {
  const refs = useRef<Record<string, HTMLSpanElement | null>>({});
  const [px, setPx] = useState<Record<string, string>>({});

  useEffect(() => {
    const measure = () =>
      setPx(
        Object.fromEntries(
          typeSteps.map((s) => {
            const el = refs.current[s.step];
            return [s.step, el ? `${parseFloat(getComputedStyle(el).fontSize).toFixed(1)}px` : ""];
          }),
        ),
      );
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return (
    <section id="type" aria-labelledby="type-title" className="flex scroll-mt-24 flex-col gap-12">
      <SectionHeader id="type" n="02" title="Type">
        Three families with fixed jobs. Michroma is rationed: the wordmark, one hero line, section
        titles. Inter Tight carries everything you read. JetBrains Mono carries everything RED
        observed: code, URLs, headers, selectors, numbers you might copy.
      </SectionHeader>

      <div className="grid grid-cols-12 gap-6">
        <Specimen
          label="Display · Michroma 400"
          note="tracking −0.02em"
          className="col-span-12 lg:col-span-7"
        >
          <p className="font-display text-step-6 tracking-display text-chrome-100 leading-none">
            Read the site. Cite the source.
          </p>
        </Specimen>
        <div className="col-span-12 flex flex-col gap-8 lg:col-span-5 lg:pt-10">
          <Specimen label="Body · Inter Tight" note="400 / 500">
            <p className="text-step-1 text-chrome-100">
              RED fetched 214 requests and found 3 render-blocking stylesheets.
              <span className="text-chrome-300">
                {" "}
                Each finding links to the bytes it came from.
              </span>
            </p>
          </Specimen>
          <Specimen label="Mono · JetBrains Mono" note="evidence only">
            <p className="text-step-0 text-chrome-300 font-mono">
              <span className="text-chrome-100">GET</span> https://acme.dev/_next/static/css/app.css
              <br />
              <span className="text-chrome-500">cache-control:</span> no-store
            </p>
          </Specimen>
        </div>
      </div>

      <Specimen label="Scale" note="1.25 at 1440px · 1.2 at 360px · fluid clamp() between">
        <ol className="divide-line border-line flex flex-col divide-y border-y">
          {typeSteps.map((s) => (
            <li key={s.step} className="grid grid-cols-12 items-baseline gap-4 py-3">
              <span className="text-step-n2 text-chrome-500 col-span-3 font-mono md:col-span-2">
                --{s.step}
                <span className="text-chrome-500 block tabular-nums">{px[s.step] || "\u00a0"}</span>
              </span>
              <span
                ref={(el) => {
                  refs.current[s.step] = el;
                }}
                className="tracking-display text-chrome-100 col-span-9 truncate md:col-span-7"
                style={{
                  fontSize: `var(--${s.step})`,
                  fontFamily: ["step-7", "step-6", "step-5"].includes(s.step)
                    ? "var(--font-display)"
                    : undefined,
                  lineHeight: 1.1,
                }}
              >
                {s.step === "step-n2" ? "SOURCE · RESPONSE HEADER" : "Evidence before opinion"}
              </span>
              <span className="text-step-n1 text-chrome-500 col-span-12 md:col-span-3">
                {s.use}
              </span>
            </li>
          ))}
        </ol>
      </Specimen>
    </section>
  );
}
