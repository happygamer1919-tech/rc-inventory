// P3-307: two imports of the same kind cannot run at once in one browser.
//
// A second sheet (another tab, or the same page opened twice) that starts writing while
// the first is still saving rows makes both read the same stored clients, so each plans
// the same row as new. The lock lives in localStorage so it is seen across tabs. It carries
// a heartbeat time: a tab that crashed mid-import stops refreshing it, and the lock is
// ignored once it is older than IMPORT_LOCK_STALE_MS.
//
// The functions take the storage as an argument, so they run without a browser.

export type ImportKind = "clients" | "leads" | "projects" | "materials";

export const IMPORT_LOCK_STALE_MS = 30_000;
export const IMPORT_LOCK_BEAT_MS = 5_000;

const KIND_LABEL: Record<ImportKind, string> = {
  clients: "de clienți",
  leads: "de leaduri",
  projects: "de proiecte",
  materials: "de materiale",
};

/** Said next to the disabled Importă button. */
export function importLockMessage(kind: ImportKind): string {
  return `Un alt import ${KIND_LABEL[kind]} este în curs în acest browser. Așteptați să se termine, apoi apăsați Importă.`;
}

type LockStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const keyOf = (kind: ImportKind) => `rc-import-running:${kind}`;

function readLock(storage: LockStorage, kind: ImportKind): { owner: string; at: number } | null {
  try {
    const raw = storage.getItem(keyOf(kind));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { owner?: unknown; at?: unknown };
    if (typeof parsed.owner !== "string" || typeof parsed.at !== "number") return null;
    return { owner: parsed.owner, at: parsed.at };
  } catch {
    return null;
  }
}

/** True when an import of this kind that is not `owner` has beaten its heart recently. */
export function otherImportRunning(
  storage: LockStorage,
  kind: ImportKind,
  owner: string,
  now: number,
): boolean {
  const held = readLock(storage, kind);
  return held !== null && held.owner !== owner && now - held.at < IMPORT_LOCK_STALE_MS;
}

/** Takes the lock, or refreshes it when `owner` already holds it. False when another import holds it. */
export function acquireImportLock(
  storage: LockStorage,
  kind: ImportKind,
  owner: string,
  now: number,
): boolean {
  if (otherImportRunning(storage, kind, owner, now)) return false;
  try {
    storage.setItem(keyOf(kind), JSON.stringify({ owner, at: now }));
  } catch {
    // Storage refused (private mode, full): the lock cannot be shared, so it cannot block.
  }
  return true;
}

/** Lets go of the lock, only when `owner` is the one holding it. */
export function releaseImportLock(storage: LockStorage, kind: ImportKind, owner: string): void {
  try {
    if (readLock(storage, kind)?.owner === owner) storage.removeItem(keyOf(kind));
  } catch {
    // Nothing to release.
  }
}
