import { radii, spaceScale } from "@/lib/tokens";
import { SectionHeader, Specimen } from "./SectionHeader";

export function SpaceSection() {
  return (
    <section id="space" aria-labelledby="space-title" className="flex scroll-mt-24 flex-col gap-12">
      <SectionHeader id="space" n="03" title="Space, radius, glow">
        Everything lands on a 4px grid. Three radii, no in-betweens. Depth comes from light, not
        from shadow: a 1px edge and a 12% red halo mark what has focus or is active.
      </SectionHeader>

      <div className="grid grid-cols-12 gap-6">
        <Specimen
          label="Spacing · 4px base"
          note="Tailwind units ×4"
          className="col-span-12 lg:col-span-6"
        >
          <ol className="flex flex-col gap-2">
            {spaceScale.map((px) => (
              <li key={px} className="grid grid-cols-[3rem_3rem_1fr] items-center gap-4">
                <span className="text-step-n2 text-chrome-500 font-mono tabular-nums">{px}px</span>
                <span className="text-step-n2 text-chrome-500 font-mono">{px / 4}</span>
                <span className="bg-chrome-500/30 h-3" style={{ width: px * 2 }} />
              </li>
            ))}
          </ol>
        </Specimen>

        <Specimen label="Radius · 4 / 8 / 14 only" className="col-span-12 lg:col-span-6 lg:pt-16">
          <div className="flex flex-wrap items-end gap-6">
            {radii.map((r) => (
              <div key={r.name} className="flex flex-col gap-3">
                <span
                  className="border-chrome-500/50 bg-ink-900 block h-20 w-28 border"
                  style={{ borderRadius: `var(--radius-${r.name})` }}
                />
                <span className="text-step-n2 text-chrome-300 font-mono">
                  rounded-{r.name} · {r.px}px
                </span>
                <span className="text-step-n1 text-chrome-500 max-w-[16ch]">{r.use}</span>
              </div>
            ))}
          </div>
        </Specimen>

        <Specimen
          label="Glow"
          note="replaces box-shadow depth"
          className="col-span-12 lg:col-span-9 lg:col-start-4"
        >
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {[
              {
                cls: "shadow-glow-red",
                name: "glow-red",
                use: "Focus ring. 1px edge, 4px halo at 12%.",
              },
              {
                cls: "shadow-glow-red-soft",
                name: "glow-red-soft",
                use: "Active, hovered primary, scan line.",
              },
              { cls: "shadow-glow-chrome", name: "glow-chrome", use: "Neutral selection edge." },
            ].map((g) => (
              <div key={g.name} className="flex flex-col gap-3">
                <span className={`bg-ink-900 block h-16 rounded-md ${g.cls}`} />
                <span className="text-step-n2 text-chrome-300 font-mono">shadow-{g.name}</span>
                <span className="text-step-n1 text-chrome-500">{g.use}</span>
              </div>
            ))}
          </div>
        </Specimen>
      </div>
    </section>
  );
}
