import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { currentUser } from "@/lib/supabase/server";
import { readQuota } from "@/lib/quota";

export const metadata: Metadata = {
  title: { default: "App", template: "%s · RED" },
  robots: { index: false, follow: false },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Middleware already redirects, but every server entry point re-checks.
  const { supabase, user } = await currentUser();
  if (!user) redirect("/login?next=/app");
  const [quota, store] = await Promise.all([readQuota(supabase, user), cookies()]);

  return (
    <AppShell
      email={user.email ?? "account"}
      quota={quota}
      initialCollapsed={store.get("red_sidebar")?.value === "collapsed"}
    >
      {children}
    </AppShell>
  );
}
