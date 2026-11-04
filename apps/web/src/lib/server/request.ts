import "server-only";
import { headers } from "next/headers";
import { sha256Hex } from "@red/shared";

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    h.get("cf-connecting-ip") ||
    "unknown"
  );
}

/** Salted hash so the audit log can group by network without storing addresses. */
export async function ipHash(ip: string): Promise<string> {
  const salt = process.env.AUDIT_IP_SALT ?? "";
  return sha256Hex(`${salt}:${ip}`);
}

/** Origin for auth redirects. Prefer the configured site URL (it must be in Supabase's allow list). */
export async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
