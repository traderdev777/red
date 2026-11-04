"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { Icon } from "@/components/ui/Icon";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { site } from "@/lib/site";

/**
 * Sticky nav. Height drops 64 → 52px once the page scrolls: the change says "you've left the top".
 * The bar is position: fixed over a 64px spacer, so shrinking never moves page content (CLS 0).
 */
export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="h-16">
      <header
        data-scrolled={scrolled || undefined}
        className="bg-ink-950/80 duration-240 ease-out-expo data-[scrolled]:border-line group fixed inset-x-0 top-0 z-50 border-b border-transparent backdrop-blur-md transition-[border-color]"
      >
        <div className="duration-240 ease-out-expo mx-auto flex h-16 max-w-[90rem] items-center justify-between gap-6 px-5 transition-[height] group-data-[scrolled]:h-[52px] md:px-10">
          <Link href="/" aria-label="RED home" className="rounded-sm">
            <Logo
              height={24}
              className="duration-240 ease-out-expo transition-transform group-data-[scrolled]:scale-90"
              title="RED"
            />
          </Link>

          <nav aria-label="Primary" className="hidden md:block">
            <ul className="flex items-center gap-8">
              {site.nav.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    className="text-step-n1 text-chrome-300 duration-120 ease-out-expo hover:text-chrome-100 rounded-sm transition-colors"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex items-center gap-2">
            <a href="#scan" className={buttonClasses({ size: "sm" })}>
              Scan a site
            </a>
            <button
              type="button"
              className={cn(buttonClasses({ variant: "ghost", size: "sm" }), "w-8 px-0 md:hidden")}
              aria-expanded={open}
              aria-controls="mobile-nav"
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((v) => !v)}
            >
              <Icon as={open ? X : Menu} />
            </button>
          </div>
        </div>

        <nav
          id="mobile-nav"
          aria-label="Primary mobile"
          hidden={!open}
          className="border-line bg-ink-950 border-t px-5 pb-4 md:hidden"
        >
          <ul className="flex flex-col">
            {site.nav.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="text-step-0 text-chrome-300 hover:text-chrome-100 block rounded-sm py-3"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
    </div>
  );
}
