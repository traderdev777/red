import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { LoginForm } from "@/components/auth/LoginForm";
import { resumeUrlFrom, safeNext } from "@/lib/safeNext";
import { supabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

const NOTICES: Record<string, string> = {
  link: "That sign-in link is invalid or expired. Request a new one.",
  oauth: "Google sign-in couldn't start. Try again, or use an email link.",
  provider: "Google sign-in was cancelled or refused.",
  "not-configured": "Auth isn't configured on this server yet.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; signed_out?: string; deleted?: string }>;
}) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const resume = resumeUrlFrom(next);
  const notice = !supabaseConfigured()
    ? NOTICES["not-configured"]
    : sp.error
      ? (NOTICES[sp.error] ?? "Sign-in failed. Try again.")
      : sp.deleted
        ? "Your account and its scans were deleted."
        : sp.signed_out
          ? "Signed out."
          : undefined;

  return (
    <main
      id="main"
      className="mx-auto grid min-h-dvh max-w-[90rem] grid-cols-12 gap-x-6 px-5 md:px-10"
    >
      <div className="col-span-12 flex flex-col justify-center gap-10 py-16 md:col-span-7 lg:col-span-5">
        <Link href="/" aria-label="RED home" className="self-start rounded-sm">
          <Logo height={28} />
        </Link>
        <div className="flex flex-col gap-4">
          <h1 className="font-display text-step-4 tracking-display">Sign in to scan.</h1>
          {resume ? (
            <p className="text-step-0 text-chrome-300">
              Your scan of <span className="text-chrome-100 break-all font-mono">{resume}</span>{" "}
              starts as soon as you&rsquo;re in.
            </p>
          ) : (
            <p className="text-step-0 text-chrome-300">
              {process.env.NEXT_PUBLIC_GOOGLE_AUTH === "1"
                ? "No password. A Google account or an email link."
                : "No password. Just a link to your email."}
            </p>
          )}
        </div>
        <LoginForm next={next} notice={notice} />
        <p className="text-step-n2 text-chrome-500 font-mono">
          New here? The same link creates your account. Accounts start with five scans a day.
        </p>
      </div>
    </main>
  );
}
