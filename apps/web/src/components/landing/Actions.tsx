import { BookOpenText, Code2, Layers, TerminalSquare, type LucideIcon } from "lucide-react";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { Icon } from "@/components/ui/Icon";
import { Reveal } from "@/motion/Reveal";
import { IllustrationLabel } from "./IllustrationLabel";
import { SectionIntro } from "./SectionIntro";

interface ActionItem {
  icon: LucideIcon;
  title: string;
  body: string;
  file: string;
  language: string;
  code: string;
}

const ACTIONS: ActionItem[] = [
  {
    icon: BookOpenText,
    title: "Explain deeper",
    body: "Open any finding and get the mechanism, the cost, and the evidence chain behind it.",
    file: "explain perf.render-blocking-css",
    language: "text",
    code: `why    stylesheets in <head> block first paint
where  head > link[rel=stylesheet] ×2
cost   first paint waits on two network round-trips
fix    inline critical rules, load the rest async
proof  2 excerpts · source URLs attached`,
  },
  {
    icon: Code2,
    title: "Generate code for a feature",
    body: "Pick a feature RED found and get an original implementation in your stack.",
    file: "components/PlanToggle.tsx",
    language: "tsx",
    code: `export function PlanToggle({ value, onChange }: Props) {
  return (
    <div role="radiogroup" aria-label="Billing period">
      {(["monthly", "yearly"] as const).map((p) => (
        <button key={p} role="radio" aria-checked={value === p}
          onClick={() => onChange(p)}>{p}</button>
      ))}
    </div>
  );
}`,
  },
  {
    icon: Layers,
    title: "Build a similar app, original visuals",
    body: "Keep the structure and interaction patterns. Replace every brand asset with your own.",
    file: "rebuild.plan",
    language: "yaml",
    code: `keep:   section order, information architecture,
        interaction patterns, accessibility wins
new:    palette, type, imagery, illustrations, copy
never:  logos, brand marks, screenshots, source code
output: Next.js app router + Tailwind, your tokens`,
  },
  {
    icon: TerminalSquare,
    title: "Generate Antigravity build prompts",
    body: "Export the plan as ordered prompts an agent can run, one bounded task each.",
    file: "prompts/02-pricing.md",
    language: "md",
    code: `# Task 2 of 6 · Pricing section
Build a three-tier pricing section in app/(site)/pricing.
Use the design tokens in styles/tokens.css only.
Tiers come from content/pricing.json. Monthly/yearly
toggle is a radiogroup. No images from the source site.
Done when: keyboard-operable, axe clean, no CLS.`,
  },
];

export function Actions() {
  return (
    <section
      id="actions"
      aria-labelledby="actions-title"
      className="cv-section mx-auto max-w-[90rem] scroll-mt-16 px-5 py-24 md:px-10"
    >
      <div className="grid grid-cols-12 gap-x-6">
        <div className="col-span-12 lg:col-span-6">
          <SectionIntro id="actions" eyebrow="Actions" title="From finding to running code.">
            A teardown you can&rsquo;t act on is trivia. Each finding ships with the next step
            already written.
          </SectionIntro>
        </div>
        <div className="col-span-12 flex items-end lg:col-span-6 lg:justify-end">
          <IllustrationLabel note="previews show output format" className="mt-6" />
        </div>
      </div>

      <Reveal
        as="ol"
        className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4"
        stagger={0.08}
      >
        {ACTIONS.map((a, i) => (
          <article
            key={a.title}
            className="flex h-full flex-col gap-4 xl:pt-[var(--offset)]"
            style={{ ["--offset" as string]: `${i * 2.5}rem` }}
          >
            <div className="flex items-center gap-3">
              <span className="text-step-n2 text-chrome-500 font-mono">0{i + 1}</span>
              <Icon as={a.icon} size={20} className="text-chrome-300" />
            </div>
            <h3 className="text-step-2 text-chrome-100 font-medium">{a.title}</h3>
            <p className="text-step-n1 text-chrome-300">{a.body}</p>
            <CodeBlock
              className="mt-auto"
              filename={a.file}
              language={a.language}
              code={a.code}
              showLineNumbers={false}
              wrap
            />
          </article>
        ))}
      </Reveal>
    </section>
  );
}
