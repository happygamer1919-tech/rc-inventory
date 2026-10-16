"use client";

// P3-307: React side of lib/import-lock.ts. `blocked` is true while an import of this kind
// started by ANOTHER sheet is running in this browser; `acquire` is called when this sheet
// starts importing and keeps the lock alive until `release`.
//
// P3-313: leaving the page mid-run. While an import runs, the browser asks before the tab is
// closed or reloaded, and a click on an in-app link or the Back button opens a confirm built
// into the page (`leave`). The sheet unmounting while the batch loop is still writing does NOT
// release the lock: the loop goes on in this tab, so the heartbeat keeps the lock until the
// loop ends (`release` in its finally) or the tab dies and the stale window expires it. The
// sheet reports progress with `noteProgress`; a fresh sheet shows `leftNotice` once.

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  IMPORT_LOCK_BEAT_MS,
  acquireImportLock,
  clearImportProgress,
  importLeftNotice,
  otherImportRunning,
  releaseImportLock,
  writeImportProgress,
  type ImportKind,
} from "@/lib/import-lock";

/** Where a confirmed leave goes: an in-app address, or one step back in the history. */
type LeaveTarget = { href: string } | { back: true };

export function useImportLock(kind: ImportKind): {
  blocked: boolean;
  acquire: () => boolean;
  release: () => void;
  noteProgress: (done: number, total: number) => void;
  leave: { open: boolean; stay: () => void; go: () => void };
  leftNotice: string | null;
  dismissLeftNotice: () => void;
} {
  const router = useRouter();
  const owner = React.useRef<string>("");
  if (owner.current === "") owner.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const beat = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const mounted = React.useRef(true);
  const running = React.useRef(false);
  const [blocked, setBlocked] = React.useState(false);
  const [active, setActive] = React.useState(false);
  const [target, setTarget] = React.useState<LeaveTarget | null>(null);
  const [leftNotice, setLeftNotice] = React.useState<string | null>(null);

  const check = React.useCallback(() => {
    try {
      const now = Date.now();
      setBlocked(otherImportRunning(window.localStorage, kind, owner.current, now));
      setLeftNotice(running.current ? null : importLeftNotice(window.localStorage, kind, owner.current, now));
    } catch {
      setBlocked(false);
    }
  }, [kind]);

  const stopBeat = React.useCallback(() => {
    if (beat.current !== null) clearInterval(beat.current);
    beat.current = null;
  }, []);

  const release = React.useCallback(() => {
    running.current = false;
    stopBeat();
    try {
      releaseImportLock(window.localStorage, kind, owner.current);
      // A run that ended while its sheet was still open has nothing to tell on return.
      if (mounted.current) clearImportProgress(window.localStorage, kind);
    } catch {
      // Storage unavailable: nothing was held.
    }
    if (mounted.current) setActive(false);
  }, [kind, stopBeat]);

  const acquire = React.useCallback(() => {
    try {
      if (!acquireImportLock(window.localStorage, kind, owner.current, Date.now())) {
        setBlocked(true);
        return false;
      }
    } catch {
      // Storage unavailable: the lock cannot be shared, but the leave guard still applies.
    }
    running.current = true;
    setActive(true);
    setLeftNotice(null);
    stopBeat();
    beat.current = setInterval(() => {
      try {
        acquireImportLock(window.localStorage, kind, owner.current, Date.now());
      } catch {
        // Storage unavailable: the lock simply goes stale.
      }
    }, IMPORT_LOCK_BEAT_MS);
    return true;
  }, [kind, stopBeat]);

  const noteProgress = React.useCallback(
    (done: number, total: number) => {
      if (!running.current) return;
      try {
        writeImportProgress(window.localStorage, kind, { owner: owner.current, done, total });
      } catch {
        // Storage unavailable: no notice on return.
      }
    },
    [kind],
  );

  const dismissLeftNotice = React.useCallback(() => {
    try {
      clearImportProgress(window.localStorage, kind);
    } catch {
      // Nothing to clear.
    }
    setLeftNotice(null);
  }, [kind]);

  React.useEffect(() => {
    mounted.current = true;
    check();
    const timer = setInterval(check, 2_000);
    window.addEventListener("storage", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("storage", check);
      mounted.current = false;
      // The loop is still writing: keep the heartbeat and the lock, `release` ends them.
      if (!running.current) release();
    };
  }, [check, release]);

  // The leave guard, only while this sheet's run is going.
  React.useEffect(() => {
    if (!active) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      setTarget({ href: `${url.pathname}${url.search}${url.hash}` });
    };
    // One extra history entry, so Back lands on this page again and can ask first.
    window.history.pushState(window.history.state, "", window.location.href);
    const onPop = () => {
      window.history.pushState(window.history.state, "", window.location.href);
      setTarget({ back: true });
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
    };
  }, [active]);

  const stay = React.useCallback(() => setTarget(null), []);
  const go = React.useCallback(() => {
    const where = target;
    setTarget(null);
    if (!where) return;
    if ("href" in where) router.push(where.href);
    // The sentinel entry and the entry Back was meant to leave.
    else window.history.go(-2);
  }, [router, target]);

  return {
    blocked,
    acquire,
    release,
    noteProgress,
    leave: { open: target !== null, stay, go },
    leftNotice,
    dismissLeftNotice,
  };
}
