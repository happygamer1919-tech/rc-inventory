// P3-313. Un client scris de doua ori in acelasi fisier (o data cu email, o data fara) este
// prins, iar plecarea de pe pagina in mijlocul unui import nu poate porni un al doilea import
// si nu ascunde rezultatul.
//
// Functii pure, fara browser si fara baza.
import { expect, test } from "@playwright/test";
import { buildClientPlan, type ClientImportPlan } from "@/lib/data/client-import-plan";
import { readAnchors } from "@/lib/data/import-file-anchors";
import {
  IMPORT_LEFT_MESSAGE,
  IMPORT_LEAVE_PROMPT,
  acquireImportLock,
  clearImportProgress,
  importLeftNotice,
  otherImportRunning,
  releaseImportLock,
  writeImportProgress,
} from "@/lib/import-lock";

const MAPPING = ["name", "email", "phone", "address"] as never;

function plan(rows: string[][], earlier?: [string, number][], lines?: number[]): ClientImportPlan {
  return buildClientPlan({ rows, lines, mapping: MAPPING, owners: new Map(), existing: [], earlier }).plan;
}

function duplicateOf(entry: ClientImportPlan["entries"][number] | undefined) {
  if (!entry || entry.kind !== "duplicate") throw new Error("asteptat dublat");
  return entry;
}

const NO_EMAIL = ["Popescu SRL", "", "069123456", ""];
const WITH_EMAIL = ["Popescu SRL", "popescu@x.md", "+373 69 123 456", ""];

test("P3-313: acelasi client fara email si apoi cu email in acelasi fisier este un dublat", () => {
  const result = plan([NO_EMAIL, WITH_EMAIL]);
  expect(result.counts).toEqual({ fresh: 1, duplicate: 1, error: 0 });
  const entry = duplicateOf(result.entries[1]);
  expect(entry.against).toMatchObject({ kind: "file", line: 2 });
  expect(entry.matchedBy).toBe("namePhone");
  // Emailul din al doilea rand se poate scrie in campul gol al primului.
  expect(entry.fillable).toContain("email");
});

test("P3-313: acelasi client cu email si apoi fara email in acelasi fisier este un dublat", () => {
  const result = plan([WITH_EMAIL, NO_EMAIL]);
  expect(result.counts).toEqual({ fresh: 1, duplicate: 1, error: 0 });
  const entry = duplicateOf(result.entries[1]);
  expect(entry.against).toMatchObject({ kind: "file", line: 2 });
  expect(entry.matchedBy).toBe("namePhone");
});

test("P3-313: acelasi email ramane dublat dupa email, nu dupa nume si telefon", () => {
  const result = plan([WITH_EMAIL, ["Alt Nume", "popescu@x.md", "079000000", ""]]);
  const entry = duplicateOf(result.entries[1]);
  expect(entry.matchedBy).toBeUndefined();
});

test("P3-313: doua adrese diferite cu acelasi nume si telefon raman doi clienti", () => {
  const result = plan([WITH_EMAIL, ["Popescu SRL", "alt@x.md", "069123456", ""]]);
  expect(result.counts).toEqual({ fresh: 2, duplicate: 0, error: 0 });
});

test("P3-313: doua randuri fara email cu acelasi nume si telefon raman un dublat", () => {
  const result = plan([NO_EMAIL, NO_EMAIL]);
  expect(result.counts).toEqual({ fresh: 1, duplicate: 1, error: 0 });
});

test("P3-313: dublatul se vede si cand cele doua randuri sunt in loturi diferite", () => {
  const first = plan([NO_EMAIL], undefined, [2]);
  const anchors = readAnchors(first.anchors);
  expect(anchors.length).toBeGreaterThan(0);
  const second = plan([WITH_EMAIL], anchors, [260]);
  const entry = duplicateOf(second.entries[0]);
  expect(entry.against).toMatchObject({ kind: "file", line: 2, otherBatch: true });
  expect(entry.matchedBy).toBe("namePhone");

  // Si invers: randul cu email in primul lot, cel fara email in al doilea.
  const firstWith = plan([WITH_EMAIL], undefined, [2]);
  const secondNo = plan([NO_EMAIL], readAnchors(firstWith.anchors), [260]);
  expect(duplicateOf(secondNo.entries[0]).against).toMatchObject({ kind: "file", line: 2 });
});

test("P3-313: un rand nou lasa cel mult doua ancore", () => {
  expect(plan([WITH_EMAIL]).anchors).toHaveLength(2);
  expect(plan([NO_EMAIL]).anchors).toHaveLength(2);
});

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

test("P3-313: mesajul de plecare este in romana, fara linii lungi", () => {
  expect(IMPORT_LEFT_MESSAGE).toBe("Un import a rulat; rândurile scrise până la plecare sunt salvate.");
  expect(IMPORT_LEAVE_PROMPT).toContain("Importul este în curs");
  const dashes = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);
  expect(IMPORT_LEFT_MESSAGE + IMPORT_LEAVE_PROMPT).not.toMatch(dashes);
});

test("P3-313: dupa plecare, blocarea ramane cat timp se scrie si anunturile apar abia dupa", () => {
  const storage = new MemoryStorage();
  // Foaia pleaca in timp ce bucla scrie: blocarea NU se elibereaza, inimii ii ia locul bucla.
  expect(acquireImportLock(storage, "clients", "fila-1", 1_000)).toBe(true);
  writeImportProgress(storage, "clients", { owner: "fila-1", done: 400, total: 1200 });
  // O foaie noua nu poate porni al doilea import si nu arata inca anuntul.
  expect(otherImportRunning(storage, "clients", "fila-2", 6_000)).toBe(true);
  expect(acquireImportLock(storage, "clients", "fila-2", 6_000)).toBe(false);
  expect(importLeftNotice(storage, "clients", "fila-2", 6_000)).toBeNull();

  // Bucla se termina si elibereaza: anuntul apare, cu numerele cunoscute.
  writeImportProgress(storage, "clients", { owner: "fila-1", done: 1200, total: 1200 });
  releaseImportLock(storage, "clients", "fila-1");
  expect(importLeftNotice(storage, "clients", "fila-2", 9_000)).toBe(
    `${IMPORT_LEFT_MESSAGE} Rânduri prelucrate până la plecare: 1.200 din 1.200.`,
  );
  expect(acquireImportLock(storage, "clients", "fila-2", 9_000)).toBe(true);
});

test("P3-313: dupa o plecare cu inchiderea filei, blocarea expira si anuntul apare", () => {
  const storage = new MemoryStorage();
  acquireImportLock(storage, "leads", "fila-1", 0);
  writeImportProgress(storage, "leads", { owner: "fila-1", done: 200, total: 900 });
  expect(importLeftNotice(storage, "leads", "fila-2", 10_000)).toBeNull();
  expect(importLeftNotice(storage, "leads", "fila-2", 40_000)).toContain("200 din 900");
});

test("P3-313: anuntul se sterge cand operatorul il inchide, iar alt fel de import nu il vede", () => {
  const storage = new MemoryStorage();
  writeImportProgress(storage, "clients", { owner: "fila-1", done: 5, total: 10 });
  expect(importLeftNotice(storage, "projects", "fila-2", 0)).toBeNull();
  expect(importLeftNotice(storage, "clients", "fila-2", 0)).not.toBeNull();
  clearImportProgress(storage, "clients");
  expect(importLeftNotice(storage, "clients", "fila-2", 0)).toBeNull();
});
