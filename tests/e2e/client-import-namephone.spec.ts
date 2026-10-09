// P3-197. Un rand fara email se potriveste dupa nume si telefon si cu clientii
// stocati care AU email. Functii pure, fara browser si fara baza.
import { expect, test } from "@playwright/test";
import { buildClientPlan, type ExistingClient } from "@/lib/data/client-import-plan";
import { CLIENT_IMPORT_FIELDS } from "@/lib/data/client-import-types";

const STORED: ExistingClient = {
  id: "c1",
  name: "Popescu SRL",
  emailKey: "a@b.md",
  phone: "069123456",
  empty: [],
};

test("P3-197: un rand fara email, cu acelasi nume si telefon, este dublat al clientului stocat cu email", () => {
  const { plan } = buildClientPlan({
    rows: [["  popescu   srl ", "+373 69 123 456"]],
    mapping: ["name", "phone", ...CLIENT_IMPORT_FIELDS.slice(2).map(() => null)],
    owners: new Map(),
    existing: [STORED],
  });
  expect(plan.counts.fresh).toBe(0);
  expect(plan.counts.duplicate).toBe(1);
  const entry = plan.entries[0]!;
  expect(entry.kind).toBe("duplicate");
  if (entry.kind !== "duplicate") return;
  expect(entry.matchedBy).toBe("namePhone");
  expect(entry.against).toMatchObject({ kind: "stored", id: "c1" });
});

test("P3-197: un rand cu alt email si acelasi nume si telefon ramane nou", () => {
  const { plan } = buildClientPlan({
    rows: [["Popescu SRL", "x@y.md", "069123456"]],
    mapping: ["name", "email", "phone", ...CLIENT_IMPORT_FIELDS.slice(3).map(() => null)],
    owners: new Map(),
    existing: [STORED],
  });
  expect(plan.counts.fresh).toBe(1);
  expect(plan.counts.duplicate).toBe(0);
  expect(plan.entries[0]!.kind).toBe("new");
});
