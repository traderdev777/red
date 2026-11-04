import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Refreshes the Supabase session cookie on every matched request and gates routes:
 *   /app/*   signed out → /login?next=<path+query>
 *   /login   signed in  → next (if safe) or /app
 * Authorization still happens server-side in each page and action (RLS + getUser);
 * this only decides where to send people.
 */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  const { pathname, search } = request.nextUrl;
  const isApp = pathname === "/app" || pathname.startsWith("/app/");

  if (!url || !key) {
    // Not configured: never expose /app. Login explains what's missing.
    if (isApp) return redirectToLogin(request, pathname + search);
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list: CookieToSet[]) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  // Do not put code between createServerClient and getUser (session refresh relies on it).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isApp && !user) return redirectToLogin(request, pathname + search, response);

  if (pathname === "/login" && user) {
    const next = request.nextUrl.searchParams.get("next");
    const dest = request.nextUrl.clone();
    dest.search = "";
    const target = safeTarget(next);
    dest.pathname = target.pathname;
    dest.search = target.search;
    return withCookies(NextResponse.redirect(dest), response);
  }

  return response;
}

function safeTarget(next: string | null) {
  // Same rules as lib/safeNext, inlined: middleware runs on the edge bundle.
  const fallback = { pathname: "/app", search: "" };
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\"))
    return fallback;
  try {
    const u = new URL(next, "http://internal.invalid");
    if (u.origin !== "http://internal.invalid") return fallback;
    if (u.pathname !== "/app" && !u.pathname.startsWith("/app/")) return fallback;
    return { pathname: u.pathname, search: u.search };
  } catch {
    return fallback;
  }
}

function redirectToLogin(request: NextRequest, next: string, carry?: NextResponse) {
  const dest = request.nextUrl.clone();
  dest.pathname = "/login";
  dest.search = "";
  dest.searchParams.set("next", next);
  return carry ? withCookies(NextResponse.redirect(dest), carry) : NextResponse.redirect(dest);
}

function withCookies(target: NextResponse, source: NextResponse) {
  for (const c of source.cookies.getAll()) target.cookies.set(c);
  return target;
}

export const config = {
  matcher: ["/app/:path*", "/app", "/login"],
};
