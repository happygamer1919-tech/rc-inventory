// P3-257. Un rand care se potriveste cu un client dezactivat primeste propriul mesaj
// si nu se completeaza. Functii pure, fara browser si fara baza.
import { expect, test } from "@playwright/test";
import {
  buildClientPlan,
  duplicateReason,
  type ExistingClient,
} from "@/lib/data/client-import-plan";
import { CLIENT_IMPORT_FIELDS } from "@/lib/data/client-import-types";

const MAPPING = ["name", "email", "address", ...CLIENT_IMPORT_FIELDS.slice(3).map(() => null)] as never;

function stored(active: boolean | undefined): ExistingClient {
  return {
    id: "c1",
    name: "Popescu SRL",
    emailKey: "a@b.md",
    phone: "069123456",
    empty: ["address"],
    ...(active === undefined ? {} : { active }),
  };
}

function plan(existing: ExistingClient[], rows: string[][]) {
  return buildClientPlan({ rows, mapping: MAPPING, owners: new Map(), existing }).plan;
}

test("P3-257: un client activ dublat ramane completabil, cu mesajul de pana acum", () => {
  const entry = plan([stored(true)], [["Popescu", "a@b.md", "Orhei"]]).entries[0]!;
  expect(entry.kind).toBe("duplicate");
  if (entry.kind !== "duplicate") return;
  expect(entry.fillable).toEqual(["address"]);
  expect(entry.against).toEqual({ kind: "stored", id: "c1", name: "Popescu SRL" });
  expect(duplicateReason(entry)).toBe('Dublat după email cu "Popescu SRL", care există deja.');
});

test("P3-257: un client fara marcajul active este tratat ca activ", () => {
  const entry = plan([stored(undefined)], [["Popescu", "a@b.md", "Orhei"]]).entries[0]!;
  if (entry.kind !== "duplicate") throw new Error("asteptat dublat");
  expect(entry.fillable).toEqual(["address"]);
});

test("P3-257: un client dezactivat are mesaj propriu si nimic de completat", () => {
  const result = plan([stored(false)], [["Popescu", "a@b.md", "Orhei"]]);
  expect(result.counts).toEqual({ fresh: 0, duplicate: 1, error: 0 });
  const entry = result.entries[0]!;
  if (entry.kind !== "duplicate") throw new Error("asteptat dublat");
  expect(entry.against).toMatchObject({ kind: "stored", id: "c1", inactive: true });
  expect(entry.fillable).toEqual([]);
  expect(duplicateReason(entry)).toBe(
    'Există deja ca client dezactivat: Popescu SRL. Reactivați-l din fișa clientului înainte de import.',
  );
});

test("P3-257: fara potrivire, randul ramane nou chiar daca exista un client dezactivat", () => {
  const result = plan([stored(false)], [["Altcineva", "x@y.md", "Orhei"]]);
  expect(result.counts).toEqual({ fresh: 1, duplicate: 0, error: 0 });
  expect(result.entries[0]!.kind).toBe("new");
});
