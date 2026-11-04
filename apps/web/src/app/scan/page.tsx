import { redirect } from "next/navigation";

/** Old landing-page target. Scans now start inside the app (login first if needed). */
export default async function ScanRedirect({
  searchParams,
}: {
  searchParams: Promise<{ url?: string | string[] }>;
}) {
  const raw = (await searchParams).url;
  const url = Array.isArray(raw) ? raw[0] : raw;
  redirect(url ? `/app?url=${encodeURIComponent(url.slice(0, 2048))}` : "/app");
}
