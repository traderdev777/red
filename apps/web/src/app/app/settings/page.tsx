import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { currentUser } from "@/lib/supabase/server";
import { readQuota } from "@/lib/quota";
import { DeleteAccount } from "@/components/app/DeleteAccount";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { supabase, user } = await currentUser();
  if (!user) redirect("/login?next=/app/settings");
  const quota = await readQuota(supabase, user);
  const provider = (user.app_metadata?.provider as string | undefined) ?? "email";

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
          <span className="text-step-n2 text-chrome-500 font-mono">Coming in a later build</span>
        </div>
        <div className="col-span-12 flex flex-col gap-3 md:col-span-8">
          <p className="text-step-n1 text-chrome-300">
            Run analysis on your own Gemini quota. Not available yet; nothing here is stored.
          </p>
          <div
            aria-hidden
            className="border-line flex h-12 items-center gap-3 rounded-md border border-dashed px-4"
          >
            <Icon as={KeyRound} className="text-chrome-500" />
            <span className="text-step-n1 text-chrome-500 font-mono">Gemini API key</span>
          </div>
          <Button variant="ghost" disabled className="self-start">
            Save key
          </Button>
        </div>
      </section>
    </div>
  );
}
