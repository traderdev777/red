import { History, Library, ScanSearch, Settings, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Matches the current path. */
  match: (path: string) => boolean;
  disabled?: string;
}

export const NAV: NavItem[] = [
  { href: "/app", label: "New scan", icon: ScanSearch, match: (p) => p === "/app" },
  { href: "/app/scans", label: "Scans", icon: History, match: (p) => p.startsWith("/app/scans") },
  {
    href: "/app/library",
    label: "Library",
    icon: Library,
    match: (p) => p.startsWith("/app/library"),
  },
  {
    href: "/app/settings",
    label: "Settings",
    icon: Settings,
    match: (p) => p.startsWith("/app/settings"),
  },
];

export function crumbs(path: string): string[] {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 1) return ["app", "new scan"];
  return parts.map((p, i) => (i === 2 && parts[1] === "scans" ? p.slice(0, 8) : p));
}
