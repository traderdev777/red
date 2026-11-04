import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { site } from "@/lib/site";

export function Footer() {
  return (
    <footer className="cv-section border-line border-t">
      <div className="mx-auto grid max-w-[90rem] grid-cols-12 gap-x-6 gap-y-8 px-5 py-12 md:px-10">
        <div className="col-span-12 flex flex-col gap-4 md:col-span-5">
          <Link href="/" aria-label="RED home" className="self-start rounded-sm">
            <Logo height={28} />
          </Link>
          <p className="text-step-n1 text-chrome-500 font-mono">Built in Belagavi.</p>
        </div>
        <nav aria-label="Footer" className="col-span-12 md:col-span-7 md:justify-self-end">
          <ul className="flex flex-wrap gap-x-8 gap-y-3">
            {site.nav.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  className="text-step-n1 text-chrome-300 hover:text-chrome-100 rounded-sm"
                >
                  {l.label}
                </a>
              </li>
            ))}
            <li>
              <a
                href="#waitlist"
                className="text-step-n1 text-chrome-300 hover:text-chrome-100 rounded-sm"
              >
                Waitlist
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
