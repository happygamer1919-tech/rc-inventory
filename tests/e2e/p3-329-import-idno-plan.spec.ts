// P3-329. IDNO-ul este cheie de dublare la importul de clienti, in baza si in fisier, iar
// completarea nu scrie niciodata un IDNO pe care il tine alt client. Functii pure, fara
// browser si fara baza.
import { expect, test } from "@playwright/test";
import {
  buildClientPlan,
  duplicateReason,
  idnoKey,
  type ExistingClient,
} from "@/lib/data/client-import-plan";
import { CLIENT_IMPORT_FIELDS, type ClientImportColumnMapping } from "@/lib/data/client-import-types";
import { idnoTakenMessage } from "@/lib/data/import-idno";

const MAPPING: ClientImportColumnMapping = [
  "name",
  "email",
  "fiscalCode",
  "address",
  ...CLIENT_IMPORT_FIELDS.slice(4).map(() => null),
];

const STORED: ExistingClient = {
  id: "c1",
  name: "Popescu SRL",
  emailKey: "a@b.md",
  idnoKey: "1003600123456",
  empty: ["address"],
};

function plan(rows: string[][], existing: ExistingClient[] = [STORED]) {
  return buildClientPlan({ rows, mapping: MAPPING, owners: new Map(), existing }).plan;
}

test("P3-329: idnoKey ignora spatiile si literele mici, iar un IDNO gol nu are cheie", () => {
  expect(idnoKey(" 1003 6001 23456 ")).toBe("1003600123456");
  expect(idnoKey("md-ab12")).toBe("MD-AB12");
  expect(idnoKey("   ")).toBeNull();
  expect(idnoKey(null)).toBeNull();
});

test("P3-329: un rand cu IDNO-ul unui client stocat este dublat, chiar cu alt nume si alt email", () => {
  const { entries, counts } = plan([["Alt nume SRL", "altul@x.md", "1003 600 123 456", "Orhei"]]);
  expect(counts).toEqual({ fresh: 0, duplicate: 1, error: 0 });
  const entry = entries[0]!;
  expect(entry.kind).toBe("duplicate");
  if (entry.kind !== "duplicate") return;
  expect(entry.matchedBy).toBe("idno");
  expect(entry.against).toMatchObject({ kind: "stored", id: "c1" });
  expect(entry.fillable).toEqual(["address"]);
  expect(duplicateReason(entry)).toBe('Același IDNO cu "Popescu SRL", care există deja.');
});

test("P3-329: un IDNO diferit sau lipsa IDNO-ului nu face dublat", () => {
  const { counts } = plan([
    ["Unu SRL", "unu@x.md", "1003600999999", ""],
    ["Doi SRL", "doi@x.md", "", ""],
  ]);
  expect(counts).toEqual({ fresh: 2, duplicate: 0, error: 0 });
});

test("P3-329: doua randuri cu acelasi IDNO in fisier: al doilea este dublat cu oferta de completare", () => {
  const { entries, counts } = plan(
    [
      ["Unu SRL", "unu@x.md", "2004600111111", ""],
      ["Doi SRL", "doi@x.md", "2004600111111", "Soroca"],
    ],
    [],
  );
  expect(counts).toEqual({ fresh: 1, duplicate: 1, error: 0 });
  const entry = entries[1]!;
  expect(entry.kind).toBe("duplicate");
  if (entry.kind !== "duplicate") return;
  expect(entry.matchedBy).toBe("idno");
  expect(entry.against).toMatchObject({ kind: "file", line: 2 });
  expect(entry.fillable).toEqual(["address"]);
  expect(duplicateReason(entry)).toBe("Același IDNO cu rândul 2 din același fișier.");
});

test("P3-329: o ancora de IDNO din lotul de dinainte face dublat un rand din lotul urmator", () => {
  const first = buildClientPlan({
    rows: [["Unu SRL", "unu@x.md", "2004600111111", ""]],
    mapping: MAPPING,
    owners: new Map(),
    existing: [],
  }).plan;
  expect(first.anchors).toContainEqual(["idno:2004600111111", 2]);

  const second = buildClientPlan({
    rows: [["Doi SRL", "doi@x.md", "2004600111111", ""]],
    mapping: MAPPING,
    owners: new Map(),
    existing: [],
    earlier: first.anchors,
  }).plan;
  expect(second.counts.duplicate).toBe(1);
});

test("P3-329: completarea nu ofera IDNO-ul pe care il tine alt client stocat", () => {
  // Randul se potriveste dupa email cu c2 (fara IDNO), dar IDNO-ul din fisier este al lui c1.
  const c2: ExistingClient = {
    id: "c2",
    name: "Fara IDNO SRL",
    emailKey: "c2@b.md",
    idnoKey: null,
    empty: ["fiscalCode", "address"],
  };
  const { entries } = plan([["Fara IDNO SRL", "c2@b.md", "1003600123456", "Orhei"]], [STORED, c2]);
  const entry = entries[0]!;
  expect(entry.kind).toBe("duplicate");
  if (entry.kind !== "duplicate") return;
  expect(entry.against).toMatchObject({ kind: "stored", id: "c2" });
  expect(entry.fillable).toEqual(["address"]);
});

test("P3-329: completarea ofera IDNO-ul cand nimeni altcineva nu il are", () => {
  const c2: ExistingClient = {
    id: "c2",
    name: "Fara IDNO SRL",
    emailKey: "c2@b.md",
    idnoKey: null,
    empty: ["fiscalCode", "address"],
  };
  const { entries } = plan([["Fara IDNO SRL", "c2@b.md", "3005600777777", "Orhei"]], [STORED, c2]);
  const entry = entries[0]!;
  expect(entry.kind).toBe("duplicate");
  if (entry.kind !== "duplicate") return;
  expect(entry.fillable).toEqual(["fiscalCode", "address"]);
});

test("P3-329: mesajul pentru un IDNO tinut de alt client este in romana", () => {
  expect(idnoTakenMessage("1003600123456", "Popescu SRL")).toBe(
    "IDNO-ul 1003600123456 aparține deja clientului Popescu SRL.",
  );
});
