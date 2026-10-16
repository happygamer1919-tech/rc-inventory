"use client";

// P3-313. The two pieces of text an import sheet shows around leaving the page mid-run.
// The logic is in lib/use-import-lock.ts; the strings are in lib/import-lock.ts.

import { Button } from "@/components/ui/primitives";
import { IMPORT_LEAVE_PROMPT } from "@/lib/import-lock";

type LeaveLock = {
  leave: { open: boolean; stay: () => void; go: () => void };
  leftNotice: string | null;
  dismissLeftNotice: () => void;
};

/** Wired once into each import sheet, next to the step list. */
export function ImportLeaveGuard({ lock }: { lock: LeaveLock }) {
  return (
    <>
      <ImportLeaveDialog leave={lock.leave} />
      <ImportLeftNotice message={lock.leftNotice} onDismiss={lock.dismissLeftNotice} />
    </>
  );
}

/** The confirm built into the page: shown when the operator clicks a link or Back mid-run. */
function ImportLeaveDialog({
  leave,
}: {
  leave: { open: boolean; stay: () => void; go: () => void };
}) {
  if (!leave.open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="import-leave-title"
        className="w-full max-w-[420px] rounded-[16px] bg-rc-white p-5 text-rc-black shadow-2xl"
        data-testid="import-leave"
      >
        <h2 id="import-leave-title" className="text-[16px] font-bold">
          Importul este în curs
        </h2>
        <p className="mt-2 text-[13.5px]">{IMPORT_LEAVE_PROMPT}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={leave.go} data-testid="import-leave-go">
            Plec oricum
          </Button>
          <Button type="button" onClick={leave.stay} data-testid="import-leave-stay">
            Rămân aici
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Shown on return to the sheet after a run was left. */
function ImportLeftNotice({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  if (!message) return null;
  return (
    <div className="px-6 pt-4">
      <div
        role="status"
        data-testid="import-left"
        className="flex items-start justify-between gap-3 rounded-[12px] border border-rc-line p-3 text-[13px]"
      >
        <p>{message}</p>
        <Button type="button" variant="secondary" onClick={onDismiss} data-testid="import-left-dismiss">
          Am înțeles
        </Button>
      </div>
    </div>
  );
}
