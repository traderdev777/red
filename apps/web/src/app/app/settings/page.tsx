import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { readQuota } from "@/lib/quota";
import { DeleteAccount } from "@/components/app/DeleteAccount";
import { Button } from "@/components/ui/Button";
import { GeminiKeyForm } from "@/components/app/GeminiKeyForm";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { supabase, user } = await currentUser();
  if (!user) redirect("/login?next=/app/settings");
  const quota = await readQuota(supabase, user);
  const provider = (user.app_metadata?.provider as string | undefined) ?? "email";
  // Service role read of the caller's own row (the table has no user grants); only last4 leaves the server.
  const { data: keyRow } = await supabaseAdmin()
    .from("user_gemini_keys")
    .select("last4, verified_at")
    .eq("user_id", user.id)
    .maybeSingle();
  const saved = keyRow ? { last4: keyRow.last4 as string, verifiedAt: (keyRow.verified_at as string | null) ?? null } : null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-12 px-4 py-12 md:px-8">
      <h1 className="font-display text-step-4 tracking-display">Settings</h1>

      <section
        aria-labelledby="account"
        className="border-line grid grid-cols-12 gap-x-6 gap-y-6 border-t pt-8"
      >
        <h2
          id="account"
          className="text-step-n2 tracking-label text-chrome-500 col-span-12 font-mono uppercase md:col-span-4"
        >
          Account
        </h2>
        <div className="col-span-12 flex flex-col gap-8 md:col-span-8">
          <dl className="text-step-n1 grid grid-cols-[8rem_1fr] gap-y-3">
            <dt className="text-chrome-500">Email</dt>
            <dd className="text-chrome-100 break-all font-mono">{user.email}</dd>
            <dt className="text-chrome-500">Signed in with</dt>
            <dd className="text-chrome-100 font-mono">{provider}</dd>
            <dt className="text-chrome-500">Daily scans</dt>
            <dd className="text-chrome-100 font-mono">
              {quota.role === "owner" ? "unlimited (owner)" : quota.limit}
            </dd>
          </dl>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="ghost">
              Sign out
            </Button>
          </form>
          <div className="border-line flex flex-col gap-3 rounded-lg border p-5">
            <h3 className="text-step-0 text-chrome-100">Delete account</h3>
            <p className="text-step-n1 text-chrome-300">
              Removes your sign-in and every scan. Immediate and permanent.
            </p>
            <div>
              <DeleteAccount email={user.email ?? ""} />
            </div>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="byok"
        className="border-line grid grid-cols-12 gap-x-6 gap-y-6 border-t pt-8"
      >
        <div className="col-span-12 flex flex-col gap-2 md:col-span-4">
          <h2 id="byok" className="text-step-n2 tracking-label text-chrome-500 font-mono uppercase">
            Bring your own Gemini key
          </h2>
        </div>
        <div className="col-span-12 flex flex-col gap-3 md:col-span-8">
          <p className="text-step-n1 text-chrome-300 max-w-[60ch]">
            Analysis runs on your own Gemini quota instead of RED&rsquo;s. The scanner reads the key only while analyzing
            your scans.
          </p>
          <GeminiKeyForm saved={saved} />
        </div>
      </section>
    </div>
  );
}
