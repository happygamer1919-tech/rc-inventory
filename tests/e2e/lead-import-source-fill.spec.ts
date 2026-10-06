// P3-168. Sursa implicita a importului de leaduri este pentru leaduri NOI. Un dublat
// completat primeste numai ce a adus fisierul insusi, ca ce se scrie sa fie ce a
// aratat pasul "Verifică". Nu atinge nici browserul, nici baza: planul este o functie pura.
import { expect, test } from "@playwright/test";
import { buildPlan } from "@/lib/data/lead-import-plan";

const STORED = {
  id: "c1",
  name: "Ion SRL",
  phoneKey: null,
  emailKey: "ion@example.md",
  empty: ["source", "address"] as ("source" | "address")[],
};

test("dublat completat: sursa implicita nu se scrie pe clientul existent", () => {
  const { plan, prepared } = buildPlan({
    rows: [["Ion SRL", "ion@example.md", "Str. Mare 1"]],
    mapping: ["name", "email", "address"],
    owners: new Map(),
    fallbackSource: "site",
    existing: [STORED],
  });
  const entry = plan.entries[0]!;
  expect(entry.kind).toBe("duplicate");
  if (entry.kind !== "duplicate") return;
  expect(entry.fillable).toEqual(["address"]);
  // Leadul pregatit poarta sursa implicita, dar nu este oferita la completare.
  expect(prepared.get(2)!.source).toBe("site");
});

test("dublat completat: sursa scrisa in fisier se completeaza ca pana acum", () => {
  const { plan } = buildPlan({
    rows: [["Ion SRL", "ion@example.md", "Recomandare"]],
    mapping: ["name", "email", "source"],
    owners: new Map(),
    fallbackSource: "site",
    existing: [STORED],
  });
  const entry = plan.entries[0]!;
  expect(entry.kind).toBe("duplicate");
  if (entry.kind !== "duplicate") return;
  expect(entry.fillable).toEqual(["source"]);
});

test("rand nou fara sursa: primeste sursa implicita", () => {
  const { plan, prepared } = buildPlan({
    rows: [["Ana SRL", "ana@example.md"]],
    mapping: ["name", "email"],
    owners: new Map(),
    fallbackSource: "site",
    existing: [STORED],
  });
  expect(plan.entries[0]!.kind).toBe("new");
  expect(prepared.get(2)!.source).toBe("site");
});
