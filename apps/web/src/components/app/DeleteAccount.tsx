"use client";

import { useActionState, useCallback, useId, useRef, useState } from "react";
import { deleteAccount, type DeleteState } from "@/app/app/actions";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { EmailInput } from "@/components/ui/Input";

export function DeleteAccount({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<DeleteState, FormData>(deleteAccount, {
    status: "idle",
  });
  const titleId = useId();
  const input = useRef<HTMLInputElement>(null);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)} aria-haspopup="dialog">
        Delete account
      </Button>
      <Dialog
        open={open}
        onClose={close}
        labelledBy={titleId}
        initialFocus={input}
        className="mx-auto mt-[12vh] w-[min(32rem,calc(100vw-2rem))]"
      >
        <form
          action={action}
          className="bg-ink-900 flex flex-col gap-5 rounded-lg border border-red-900 p-6"
        >
          <h2 id={titleId} className="text-step-2 text-chrome-100">
            Delete your account?
          </h2>
          <p className="text-step-0 text-chrome-300">
            This removes your sign-in, profile, every scan, and your usage history. It can&rsquo;t
            be undone.
          </p>
          <EmailInput
            ref={input}
            name="confirm"
            label={`Type ${email} to confirm`}
            autoComplete="off"
            error={state.status === "error" ? state.message : undefined}
            disabled={pending}
          />
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={pending} loadingLabel="Deleting">
              Delete permanently
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
