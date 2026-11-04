import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { colorTokens } from "@/lib/tokens";
import { SystemNav } from "@/components/system/SystemNav";
import { ColorSection } from "@/components/system/ColorSection";
import { TypeSection } from "@/components/system/TypeSection";
import { SpaceSection } from "@/components/system/SpaceSection";
import { MotionSection } from "@/components/system/MotionSection";
import { ComponentsSection } from "@/components/system/ComponentsSection";
import { ChecklistSection } from "@/components/system/ChecklistSection";

export const metadata: Metadata = {
  title: "System",
  robots: { index: false, follow: false },
};

const FACTS = [
  { k: "Color tokens", v: String(colorTokens.length) },
  { k: "Type steps", v: "10" },
  { k: "Radii", v: "3" },
  { k: "Durations", v: "4" },
  { k: "Components", v: "10" },
  { k: "Motion primitives", v: "5" },
];

export default function SystemPage() {
  // Dev-only surface. Production builds return 404 for this route.
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="mx-auto max-w-[90rem] px-6 lg:px-10">
      <header className="border-line bg-ink-950/90 sticky top-0 z-40 -mx-6 flex h-16 items-center justify-between border-b px-6 backdrop-blur lg:-mx-10 lg:px-10">
        <Logo height={24} />
        <span className="text-step-n2 tracking-label text-chrome-500 font-mono uppercase">
          System · v0.1 · dev only
        </span>
      </header>

      <div className="grid grid-cols-12 gap-x-6">
        <aside className="col-span-12 hidden lg:col-span-2 lg:block">
          <div className="sticky top-24 pt-16">
            <SystemNav />
          </div>
        </aside>

        <main id="main" className="col-span-12 flex flex-col gap-32 pb-40 lg:col-span-10">
          <section
            aria-labelledby="hero-title"
            className="grid grid-cols-12 gap-x-6 gap-y-10 pt-16 lg:pt-24"
          >
            <div className="col-span-12 flex flex-col gap-8 lg:col-span-8">
              <p className="text-step-n1 text-chrome-500 font-mono">RED design system</p>
              <h1
                id="hero-title"
                className="font-display text-step-7 tracking-tightest leading-none"
              >
                Evidence first.
                <br />
                <span className="text-chrome-500">Red only when it matters.</span>
              </h1>
              <p className="text-step-1 text-chrome-300 max-w-[56ch]">
                Tokens, motion, and components for a product that reads a website and reports what
                it found with the source attached. Everything here renders from the code that ships.
              </p>
            </div>
            <dl className="border-line col-span-12 grid grid-cols-3 gap-x-6 gap-y-6 self-end border-t pt-6 lg:col-span-4 lg:grid-cols-2">
              {FACTS.map((f) => (
                <div key={f.k} className="flex flex-col gap-1">
                  <dt className="text-step-n2 tracking-label text-chrome-500 font-mono uppercase">
                    {f.k}
                  </dt>
                  <dd className="font-display text-step-3 text-chrome-100 tabular-nums">{f.v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <ColorSection />
          <TypeSection />
          <SpaceSection />
          <MotionSection />
          <ComponentsSection />
          <ChecklistSection />
        </main>
      </div>
    </div>
  );
}
