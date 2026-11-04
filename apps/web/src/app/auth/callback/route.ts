import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import { resumeUrlFrom, safeNext } from "@/lib/safeNext";
import { startScanCore } from "@/lib/server/scans";
import { clientIp } from "@/lib/server/request";

/**
 * Lands both sign-in methods:
 *   ?code=…                    PKCE (Google OAuth, and magic links opened in the same browser)
 *   ?token_hash=…&type=email   magic link via the token-hash email template (works cross-device)
 * Then, if the visitor came from the landing page with /app?url=…, starts that scan
 * and lands them on it. Any failure there drops them on /app with the URL prefilled.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNext(params.get("next"));
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const to = (path: string) => NextResponse.redirect(new URL(path, request.nextUrl.origin));

  const providerError = params.get("error_description") ?? params.get("error");
  if (providerError) return to(`/login?error=provider&next=${encodeURIComponent(next)}`);

  const supabase = await supabaseServer();
  let ok = false;
  if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type)
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  if (!ok) return to(`/login?error=link&next=${encodeURIComponent(next)}`);

  const resume = resumeUrlFrom(next);
  if (!resume) return to(next);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return to(`/login?error=link&next=${encodeURIComponent(next)}`);

  const result = await startScanCore({ supabase, user, rawUrl: resume, ip: await clientIp() });
  if (result.ok) return to(`/app/scans/${result.scanId}`);
  const back = new URL("/app", request.nextUrl.origin);
  back.searchParams.set("url", resume);
  back.searchParams.set("resume", result.code);
  return NextResponse.redirect(back);
}
