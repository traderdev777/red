"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { sections } from "./sections";

/** Index rail. The red tick marks the section currently in the reading position. */
export function SystemNav() {
  const [active, setActive] = useState<string>(sections[0].id);

  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <nav aria-label="Design system sections">
      <ol className="flex flex-col">
        {sections.map((s) => {
          const on = s.id === active;
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={on ? "location" : undefined}
                className={cn(
                  "text-step-n1 duration-120 ease-out-expo group flex items-center gap-3 rounded-sm py-1.5 transition-colors",
                  on ? "text-chrome-100" : "text-chrome-500 hover:text-chrome-300",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "duration-240 ease-out-expo h-px transition-[width,background-color]",
                    on ? "w-6 bg-red-500" : "bg-line w-3 group-hover:w-4",
                  )}
                />
                <span className="text-step-n2 font-mono">{s.n}</span>
                {s.title}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
