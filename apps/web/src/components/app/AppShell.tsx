"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight, Command, LogOut, Menu, Settings, X } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { Icon } from "@/components/ui/Icon";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/cn";
import { CommandPalette } from "./CommandPalette";
import { QuotaIndicator } from "./QuotaIndicator";
import { NAV, crumbs } from "./nav";

interface ShellProps {
  email: string;
  quota: { role: "user" | "owner"; used: number; limit: number };
  initialCollapsed: boolean;
  children: ReactNode;
}

function NavList({
  path,
  collapsed,
  onNavigate,
}: {
  path: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = item.match(path);
        const base = cn(
          "relative flex h-10 items-center gap-3 rounded-md px-3 text-step-n1 transition-colors duration-120 ease-out-expo",
          collapsed && "justify-center px-0",
        );
        const label = <span className={cn(collapsed && "sr-only")}>{item.label}</span>;
        if (item.disabled) {
          return (
            <li key={item.href}>
              <span
                aria-disabled="true"
                title={collapsed ? `${item.label}: ${item.disabled}` : undefined}
                className={cn(base, "text-chrome-500 cursor-not-allowed")}
              >
                <Icon as={item.icon} />
                {collapsed ? (
                  <span className="sr-only">{`${item.label}, ${item.disabled}`}</span>
                ) : (
                  <span className="flex min-w-0 flex-col leading-tight">
                    {item.label}
                    <span className="text-step-n2 text-chrome-500 truncate font-mono">
                      {item.disabled}
                    </span>
                  </span>
                )}
              </span>
            </li>
          );
        }
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              title={collapsed ? item.label : undefined}
              className={cn(
                base,
                active
                  ? "text-chrome-100"
                  : "text-chrome-300 hover:bg-ink-900 hover:text-chrome-100",
              )}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-red-500"
                />
              )}
              <Icon as={item.icon} />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function UserMenu({ email, collapsed }: { email: string; collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initial = email.slice(0, 1).toUpperCase();
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "hover:bg-ink-900 flex h-11 w-full items-center gap-3 rounded-md px-2 text-left",
          collapsed && "justify-center px-0",
        )}
      >
        <span
          aria-hidden
          className="border-line text-step-n2 text-chrome-100 grid h-7 w-7 shrink-0 place-items-center rounded-sm border font-mono"
        >
          {initial}
        </span>
        <span
          className={cn(
            "text-step-n2 text-chrome-300 min-w-0 flex-1 truncate font-mono",
            collapsed && "sr-only",
          )}
        >
          {email}
        </span>
        {collapsed && <span className="sr-only">Account menu</span>}
      </button>
      <div
        id={id}
        hidden={!open}
        className={cn(
          "border-line bg-ink-900 absolute bottom-12 z-20 w-56 rounded-md border p-1",
          collapsed ? "left-0" : "left-0 right-0 w-auto",
        )}
      >
        <p className="text-step-n2 text-chrome-500 truncate px-3 py-2 font-mono">{email}</p>
        <Link
          href="/app/settings"
          onClick={() => setOpen(false)}
          className="text-step-n1 text-chrome-300 hover:bg-ink-800 hover:text-chrome-100 flex h-9 items-center gap-2 rounded-sm px-3"
        >
          <Icon as={Settings} /> Settings
        </Link>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="text-step-n1 text-chrome-300 hover:bg-ink-800 hover:text-chrome-100 flex h-9 w-full items-center gap-2 rounded-sm px-3"
          >
            <Icon as={LogOut} /> Sign out
          </button>
        </form>
      </div>
    </div>
  );
}

export function AppShell({ email, quota, initialCollapsed, children }: ShellProps) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const drawerTitle = useId();
  const closeDrawer = useCallback(() => setDrawer(false), []);
  const closePalette = useCallback(() => setPalette(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setDrawer(false);
        setPalette((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    // Cookie, not localStorage: the server renders the right width first (no shift).
    document.cookie = `red_sidebar=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <div className="flex min-h-dvh">
      <aside
        aria-label="App"
        data-collapsed={collapsed || undefined}
        className="border-line bg-ink-950 duration-240 ease-out-expo sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r transition-[width] data-[collapsed]:w-16 md:flex"
      >
        <div
          className={cn(
            "flex h-14 items-center justify-between px-4",
            collapsed && "justify-center px-0",
          )}
        >
          <Link href="/app" aria-label="RED, new scan" className="rounded-sm">
            {collapsed ? <Logo variant="mark" height={24} /> : <Logo height={22} />}
          </Link>
        </div>
        <nav aria-label="Primary" className="flex-1 px-3 pt-4">
          <NavList path={path} collapsed={collapsed} />
        </nav>
        <div className="border-line flex flex-col gap-2 border-t p-3">
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className={cn(
              "text-step-n1 text-chrome-500 hover:bg-ink-900 hover:text-chrome-100 flex h-9 items-center gap-3 rounded-md px-3",
              collapsed && "justify-center px-0",
            )}
          >
            <Icon as={collapsed ? ChevronsRight : ChevronsLeft} />
            {!collapsed && <span>Collapse</span>}
          </button>
          <UserMenu email={email} collapsed={collapsed} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-line bg-ink-950/80 sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b px-4 backdrop-blur-md md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="text-chrome-300 hover:bg-ink-900 grid h-9 w-9 place-items-center rounded-md md:hidden"
              aria-label="Open navigation"
              aria-haspopup="dialog"
              onClick={() => setDrawer(true)}
            >
              <Icon as={Menu} />
            </button>
            <nav aria-label="Breadcrumb" className="min-w-0">
              <ol className="text-step-n2 tracking-label text-chrome-500 flex items-center gap-2 truncate font-mono uppercase">
                {crumbs(path).map((c, i, all) => (
                  <li key={`${c}-${i}`} className="flex items-center gap-2">
                    {i > 0 && <span aria-hidden>/</span>}
                    <span
                      aria-current={i === all.length - 1 ? "page" : undefined}
                      className={i === all.length - 1 ? "text-chrome-300" : undefined}
                    >
                      {c}
                    </span>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <QuotaIndicator {...quota} />
            <button
              type="button"
              onClick={() => setPalette(true)}
              aria-label="Open command palette"
              aria-keyshortcuts="Control+K Meta+K"
              className="border-line text-step-n2 text-chrome-500 hover:text-chrome-100 hidden h-8 items-center gap-1.5 rounded-sm border px-2 font-mono sm:inline-flex"
            >
              <Icon as={Command} size={12} /> K
            </button>
          </div>
        </header>

        <main id="main" className="flex-1">
          {children}
        </main>
      </div>

      {/* Mobile: the sidebar as a bottom sheet. */}
      <Dialog
        open={drawer}
        onClose={closeDrawer}
        labelledBy={drawerTitle}
        className="mb-0 mt-auto w-full"
      >
        <div className="border-line bg-ink-950 rounded-t-lg border-t px-4 pb-6 pt-3">
          <div className="mb-3 flex items-center justify-between">
            <h2
              id={drawerTitle}
              className="text-step-n2 tracking-label text-chrome-500 font-mono uppercase"
            >
              Navigation
            </h2>
            <button
              type="button"
              onClick={closeDrawer}
              aria-label="Close navigation"
              className="text-chrome-300 hover:bg-ink-900 grid h-9 w-9 place-items-center rounded-md"
            >
              <Icon as={X} />
            </button>
          </div>
          <nav aria-label="Primary mobile">
            <NavList path={path} collapsed={false} onNavigate={closeDrawer} />
          </nav>
          <div className="border-line mt-4 border-t pt-4">
            <p className="text-step-n2 text-chrome-500 truncate px-3 pb-2 font-mono">{email}</p>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="text-step-n1 text-chrome-300 hover:bg-ink-900 hover:text-chrome-100 flex h-10 w-full items-center gap-3 rounded-md px-3"
              >
                <Icon as={LogOut} /> Sign out
              </button>
            </form>
          </div>
        </div>
      </Dialog>

      <CommandPalette open={palette} onClose={closePalette} />
    </div>
  );
}
