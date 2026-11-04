/**
 * Validates a post-login redirect target. Only same-origin paths under /app are
 * allowed; anything else (absolute URLs, protocol-relative //evil, backslashes,
 * encoded tricks) falls back to /app. Prevents open redirects through ?next=.
 */
export function safeNext(raw: string | null | undefined, fallback = "/app"): string {
  if (!raw) return fallback;
  let v: string;
  try {
    v = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  if (!v.startsWith("/") || v.startsWith("//") || v.includes("\\") || /[\u0000-\u001f]/.test(v))
    return fallback;
  try {
    const u = new URL(v, "http://internal.invalid");
    if (u.origin !== "http://internal.invalid") return fallback;
    if (u.pathname !== "/app" && !u.pathname.startsWith("/app/")) return fallback;
    return u.pathname + u.search;
  } catch {
    return fallback;
  }
}

/** The ?url= a visitor brought from the landing page, if /app?url=… is the target. */
export function resumeUrlFrom(next: string): string | null {
  const u = new URL(next, "http://internal.invalid");
  return u.pathname === "/app" ? u.searchParams.get("url") : null;
}
