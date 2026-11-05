"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { removeGeminiKey, saveGeminiKey, type KeyState } from "@/app/app/settings/actions";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

export function GeminiKeyForm({ saved }: { saved: { last4: string; verifiedAt: string | null } | null }) {
  const [state, action, pending] = useActionState<KeyState, FormData>(saveGeminiKey, { status: "idle" });
  return (
    <div className="flex flex-col gap-4">
      {saved && (
        <div className="border-line flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3">
          <span className="text-step-n1 text-chrome-100 font-mono">
            <Icon as={KeyRound} size={16} className="text-detected mr-2 inline" />
            Key ending in {saved.last4}
            {saved.verifiedAt ? " · verified with Google" : ""}
          </span>
          <form action={removeGeminiKey}>
            <Button type="submit" variant="ghost" size="sm">
              Remove
            </Button>
          </form>
        </div>
      )}
      <form action={action} className="flex flex-col gap-3">
        <label htmlFor="gemini-key" className="text-step-n1 text-chrome-300">
          {saved ? "Replace with a new key" : "Gemini API key"}
        </label>
        <input
          id="gemini-key"
          name="key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          required
          placeholder="AIza…"
          aria-describedby="gemini-key-hint"
          className="border-line bg-ink-950 text-step-0 text-chrome-100 placeholder:text-chrome-500 focus-visible:shadow-glow-chrome h-12 rounded-md border px-4 font-mono focus-visible:outline-none"
        />
        <p id="gemini-key-hint" role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-step-n1 text-red-500" : state.status === "ok" ? "text-step-n1 text-detected" : "text-step-n1 text-chrome-500"}>
          {state.status === "idle" ? "Checked with Google before saving, then stored encrypted. Only the last four characters are ever shown." : state.message}
        </p>
        <Button type="submit" loading={pending} loadingLabel="Checking" className="self-start">
          Save key
        </Button>
      </form>
    </div>
  );
}
