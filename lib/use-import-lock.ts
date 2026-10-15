"use client";

// P3-307: React side of lib/import-lock.ts. `blocked` is true while an import of this kind
// started by ANOTHER sheet is running in this browser; `acquire` is called when this sheet
// starts importing and keeps the lock alive until `release`.

import * as React from "react";
import {
  IMPORT_LOCK_BEAT_MS,
  acquireImportLock,
  otherImportRunning,
  releaseImportLock,
  type ImportKind,
} from "@/lib/import-lock";

export function useImportLock(kind: ImportKind): {
  blocked: boolean;
  acquire: () => boolean;
  release: () => void;
} {
  const owner = React.useRef<string>("");
  if (owner.current === "") owner.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const beat = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const [blocked, setBlocked] = React.useState(false);

  const check = React.useCallback(() => {
    try {
      setBlocked(otherImportRunning(window.localStorage, kind, owner.current, Date.now()));
    } catch {
      setBlocked(false);
    }
  }, [kind]);

  const stopBeat = React.useCallback(() => {
    if (beat.current !== null) clearInterval(beat.current);
    beat.current = null;
  }, []);

  const release = React.useCallback(() => {
    stopBeat();
    try {
      releaseImportLock(window.localStorage, kind, owner.current);
    } catch {
      // Storage unavailable: nothing was held.
    }
  }, [kind, stopBeat]);

  const acquire = React.useCallback(() => {
    try {
      if (!acquireImportLock(window.localStorage, kind, owner.current, Date.now())) {
        setBlocked(true);
        return false;
      }
    } catch {
      return true;
    }
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

  React.useEffect(() => {
    check();
    const timer = setInterval(check, 2_000);
    window.addEventListener("storage", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("storage", check);
      release();
    };
  }, [check, release]);

  return { blocked, acquire, release };
}
