"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ScrollTrigger as ScrollTriggerT } from "gsap/ScrollTrigger";
import { cn } from "@/lib/cn";
import { steps } from "./steps";

/**
 * Five pipeline stages. Desktop with motion allowed: the section pins and scroll
 * drives one active step at a time, with a red line reporting progress.
 * Below 768px or under reduced motion: a plain vertical sequence (also the SSR markup).
 */
export function HowItWorksClient({ intro, panels }: { intro: ReactNode; panels: ReactNode[] }) {
  const [mode, setMode] = useState<"flow" | "pinned">("flow");
  const [active, setActive] = useState(0);
  const pin = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const trigger = useRef<ScrollTriggerT | null>(null);

  // Decide the mode without GSAP; load it only when pinning will actually happen.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px) and (prefers-reduced-motion: no-preference)");
    const apply = () => setMode(mq.matches ? "pinned" : "flow");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (mode !== "pinned" || !pin.current) return;
    let cancelled = false;
    let st: ScrollTriggerT | null = null;
    Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(
      ([{ default: gsap }, { ScrollTrigger }]) => {
        if (cancelled || !pin.current) return;
        gsap.registerPlugin(ScrollTrigger);
        st = ScrollTrigger.create({
          trigger: pin.current,
          start: "top top+=64",
          end: () => `+=${window.innerHeight * 2.5}`,
          pin: true,
          anticipatePin: 1,
          onUpdate: (self) => {
            if (bar.current) bar.current.style.transform = `scaleY(${self.progress})`;
            setActive(Math.min(steps.length - 1, Math.floor(self.progress * steps.length)));
          },
        });
        trigger.current = st;
      },
    );
    return () => {
      cancelled = true;
      st?.kill();
      trigger.current = null;
    };
  }, [mode]);

  const jumpTo = (i: number) => {
    const st = trigger.current;
    if (!st) return;
    const y = st.start + ((i + 0.5) / steps.length) * (st.end - st.start);
    window.scrollTo({ top: y, behavior: "smooth" });
  };

  return (
    <section id="how-it-works" aria-labelledby="how-it-works-title" className="scroll-mt-16">
      <div ref={pin} className="mx-auto max-w-[90rem] px-5 py-24 md:px-10">
        {intro}

        {mode === "flow" ? (
          <ol className="mt-14 flex flex-col">
            {steps.map((s, i) => (
              <li
                key={s.id}
                className="border-line grid grid-cols-12 gap-x-6 gap-y-5 border-t py-10"
              >
                <div className="col-span-12 flex flex-col gap-3 md:col-span-4">
                  <span className="text-step-n2 text-chrome-500 font-mono">0{i + 1}</span>
                  <h3 className="font-display text-step-3 tracking-display">{s.name}</h3>
                  <p className="text-step-0 text-chrome-300">{s.summary}</p>
                </div>
                <div className="col-span-12 md:col-span-8">{panels[i]}</div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-14 grid grid-cols-12 gap-x-6">
            <div className="relative col-span-4 pl-6">
              {/* progress rail */}
              <span aria-hidden className="bg-line absolute bottom-0 left-0 top-0 w-px" />
              <span
                ref={bar}
                aria-hidden
                className="absolute bottom-0 left-0 top-0 w-px origin-top bg-red-500"
                style={{ transform: "scaleY(0)" }}
              />
              <ol className="flex flex-col gap-1">
                {steps.map((s, i) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => jumpTo(i)}
                      aria-current={i === active ? "step" : undefined}
                      className={cn(
                        "duration-240 ease-out-expo flex w-full flex-col gap-1 rounded-md px-3 py-3 text-left transition-colors",
                        i === active ? "bg-ink-900" : "hover:bg-ink-900/60",
                      )}
                    >
                      <span className="flex items-baseline gap-3">
                        <span className="text-step-n2 text-chrome-500 font-mono">0{i + 1}</span>
                        <span
                          className={cn(
                            "font-display text-step-2 tracking-display duration-240 ease-out-expo transition-colors",
                            i === active ? "text-chrome-100" : "text-chrome-500",
                          )}
                        >
                          {s.name}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
            <div className="col-span-8 grid">
              {steps.map((s, i) => (
                <article
                  key={s.id}
                  aria-hidden={i !== active}
                  inert={i !== active}
                  className={cn(
                    "duration-240 ease-out-expo col-start-1 row-start-1 flex flex-col gap-5 transition-[opacity,transform]",
                    i === active ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0",
                  )}
                >
                  <h3 className="sr-only">{s.name}</h3>
                  <p className="text-step-1 text-chrome-300 max-w-[56ch]">{s.summary}</p>
                  {panels[i]}
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
