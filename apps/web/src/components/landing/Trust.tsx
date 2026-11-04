import { EyeOff, KeyRound, PenTool } from "lucide-react";
import { Icon } from "@/components/ui/Icon";

const LIMITS = [
  {
    icon: EyeOff,
    title: "Only what the browser receives",
    body: "RED reads the HTML, headers, assets, and network responses any visitor gets. Nothing else.",
  },
  {
    icon: KeyRound,
    title: "No logins, no private APIs",
    body: "No credential stuffing, no session reuse, no paywall or auth bypass, no undocumented endpoints.",
  },
  {
    icon: PenTool,
    title: "Rebuilds are original",
    body: "Generated code and design are new work. RED never reproduces a site's branding, imagery, or source.",
  },
];

export function Trust() {
  return (
    <section aria-labelledby="trust-title" className="cv-section border-line bg-ink-900 border-y">
      <div className="mx-auto grid max-w-[90rem] grid-cols-12 gap-x-6 gap-y-10 px-5 py-20 md:px-10">
        <div className="col-span-12 flex flex-col gap-5 lg:col-span-5">
          <span className="text-step-n2 tracking-label text-chrome-500 font-mono uppercase">
            Trust and limits
          </span>
          <h2 id="trust-title" className="font-display text-step-4 tracking-display">
            Public evidence. Original output.
          </h2>
          <p className="text-step-1 text-chrome-300 max-w-[48ch]">
            RED analyzes only what every visitor&rsquo;s browser receives. If it needs a password to
            see, RED doesn&rsquo;t see it.
          </p>
        </div>
        <ul className="divide-line col-span-12 flex flex-col divide-y lg:col-span-6 lg:col-start-7">
          {LIMITS.map((l) => (
            <li key={l.title} className="grid grid-cols-[2rem_1fr] gap-4 py-6 first:pt-0">
              <Icon as={l.icon} size={20} className="text-chrome-300 mt-0.5" />
              <div className="flex flex-col gap-1.5">
                <h3 className="text-step-1 text-chrome-100">{l.title}</h3>
                <p className="text-step-0 text-chrome-300">{l.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
