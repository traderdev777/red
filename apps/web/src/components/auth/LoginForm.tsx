"use client";

import { useActionState, useEffect, useRef } from "react";
import { ArrowRight, MailCheck } from "lucide-react";
import { sendMagicLink, signInWithGoogle, type LoginState } from "@/app/login/actions";
import { EmailInput } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

function GoogleGlyph() {
  // Google's "G" in one color: brand guidelines allow monochrome on dark UI.
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21.35 11.1H12v2.98h5.38c-.23 1.4-1.66 4.1-5.38 4.1a6.18 6.18 0 0 1 0-12.36c1.92 0 3.2.82 3.94 1.52l2.68-2.58C17.1 3.2 14.8 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.66 0 9.4-3.98 9.4-9.58 0-.64-.07-1.13-.05-1.12Z" />
    </svg>
  );
}

export function LoginForm({ next, notice }: { next: string; notice?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, {
    status: "idle",
  });
  const status = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state.status === "sent") status.current?.focus();
  }, [state]);

  if (state.status === "sent") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Icon as={MailCheck} size={20} className="text-detected" />
          <p
            ref={status}
            tabIndex={-1}
            role="status"
            className="text-step-1 text-chrome-100 outline-none"
          >
            Link sent to <span className="font-mono">{state.email}</span>
          </p>
        </div>
        <p className="text-step-0 text-chrome-300">
          Open it on this device to finish signing in. It expires in an hour. Nothing arrived? Check
          spam, then request another in a minute.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {notice && (
        <p
          role="alert"
          className="border-line bg-ink-900 text-step-n1 text-chrome-300 rounded-md border px-4 py-3"
        >
          {notice}
        </p>
      )}
      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <Button
          type="submit"
          variant="ghost"
          size="lg"
          className="w-full"
          leading={<GoogleGlyph />}
        >
          Continue with Google
        </Button>
      </form>

      <div className="flex items-center gap-4" aria-hidden>
        <span className="bg-line h-px flex-1" />
        <span className="text-step-n2 tracking-label text-chrome-500 font-mono uppercase">
          or email
        </span>
        <span className="bg-line h-px flex-1" />
      </div>

      <form action={action} noValidate className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        <EmailInput
          label="Email"
          name="email"
          placeholder="you@company.com"
          required
          autoFocus
          disabled={pending}
          error={state.status === "error" ? state.message : undefined}
        />
        <Button
          type="submit"
          size="lg"
          loading={pending}
          loadingLabel="Sending"
          trailing={<Icon as={ArrowRight} size={20} />}
        >
          Email me a sign-in link
        </Button>
      </form>
    </div>
  );
}
