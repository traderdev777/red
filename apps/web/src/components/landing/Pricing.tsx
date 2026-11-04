import Link from "next/link";
import { Check } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { buttonClasses } from "@/components/ui/Button";
import { SectionIntro } from "./SectionIntro";

const TIERS = [
  {
    id: "free",
    name: "Free",
    for: "Try it on a site you're curious about.",
    includes: [
      "Limited scans per month",
      "Detected vs inferred findings",
      "Evidence excerpts with sources",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    for: "For engineers who rebuild, migrate, or audit.",
    includes: ["Deep teardowns", "Code generation per finding", "Antigravity build prompts"],
  },
  {
    id: "agency",
    name: "Agency",
    for: "For teams delivering to clients.",
    includes: ["Everything in Pro", "White-label reports", "Your brand on every export"],
  },
];

export function Pricing() {
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-title"
      className="cv-section mx-auto max-w-[90rem] scroll-mt-16 px-5 py-24 md:px-10"
    >
      <div className="grid grid-cols-12 gap-x-6 gap-y-12">
        <div className="col-span-12 flex flex-col gap-8 lg:col-span-4">
          <SectionIntro id="pricing" eyebrow="Pricing" title="Three tiers." />
          <p className="text-step-0 text-chrome-100 font-mono">Pricing announced at launch.</p>
          <p className="text-step-0 text-chrome-300 max-w-[40ch]">
            We won&rsquo;t publish a number until it&rsquo;s real. Join the waitlist and
            you&rsquo;ll hear it first.
          </p>
        </div>
        <ol className="border-line col-span-12 flex flex-col border-t lg:col-span-8">
          {TIERS.map((t) => (
            <li
              key={t.id}
              className="border-line grid grid-cols-12 items-start gap-x-6 gap-y-4 border-b py-8"
            >
              <div className="col-span-12 flex flex-col gap-1 md:col-span-4">
                <h3 className="font-display text-step-3 tracking-display">{t.name}</h3>
                <p className="text-step-n1 text-chrome-300">{t.for}</p>
              </div>
              <ul className="col-span-12 flex flex-col gap-2 md:col-span-5">
                {t.includes.map((x) => (
                  <li key={x} className="text-step-0 text-chrome-300 flex items-start gap-2.5">
                    <Icon as={Check} className="text-chrome-500 mt-1 shrink-0" />
                    {x}
                  </li>
                ))}
              </ul>
              <div className="col-span-12 md:col-span-3 md:flex md:justify-end">
                <Link
                  href={`/?source=pricing-${t.id}#waitlist`}
                  scroll={false}
                  className={buttonClasses({ variant: "ghost" })}
                  aria-label={`Join the waitlist for ${t.name}`}
                >
                  Join waitlist
                </Link>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
