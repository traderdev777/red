import { Check } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { SectionHeader } from "./SectionHeader";

const RULES = [
  {
    rule: "No emoji as icons",
    how: "Lucide only, through <Icon>, which fixes the stroke at 1.5px.",
  },
  {
    rule: "No stock gradients",
    how: "Solid fills. The only gradient is the scan line's 10% trail, and it means \u201Cjust read\u201D.",
  },
  {
    rule: "No purple, no rainbow",
    how: "The Tailwind palette is replaced, not extended. Off-system colors don't compile.",
  },
  {
    rule: "One red, under 8%",
    how: "red-500 signals, red-600 fills the one primary action, red-900 tints evidence.",
  },
  {
    rule: "No \u201CWelcome to\u2026\u201D copy",
    how: "Lead with what RED found or what to do next. Numbers over adjectives.",
  },
  {
    rule: "No decorative motion",
    how: "Every animation names the state it reports. Reduced motion lands on the end state.",
  },
  {
    rule: "On the grid",
    how: "4px spacing, 12-column layout, radii 4/8/14. Arbitrary values need a reason in review.",
  },
  {
    rule: "No centered card grids",
    how: "Asymmetric spans, a reading column, and an index rail. Rhythm comes from offsets.",
  },
  {
    rule: "Engineer-to-engineer voice",
    how: "Precise, short, cites the source. \u201C3 stylesheets block paint\u201D, not \u201CLet\u2019s boost your speed!\u201D",
  },
];

export function ChecklistSection() {
  return (
    <section
      id="checklist"
      aria-labelledby="checklist-title"
      className="flex scroll-mt-24 flex-col gap-12"
    >
      <SectionHeader id="checklist" n="06" title="Anti-template rules">
        The checks every screen passes before review. Documented in full in docs/DESIGN.md.
      </SectionHeader>
      <ol className="grid grid-cols-12 gap-x-6">
        {RULES.map((r, i) => (
          <li
            key={r.rule}
            className={`border-line col-span-12 grid grid-cols-[2.5rem_1fr] gap-4 border-t py-5 md:col-span-6 ${i % 2 ? "md:translate-y-8" : ""}`}
          >
            <span className="text-step-n2 text-chrome-500 flex items-center gap-2 font-mono">
              <Icon as={Check} size={12} className="text-detected" />
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-step-1 text-chrome-100">{r.rule}</span>
              <span className="text-step-n1 text-chrome-300">{r.how}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
