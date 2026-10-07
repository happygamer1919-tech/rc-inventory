// Data pasului urmator la import. Fara coloana de data, valoarea trimisa la creare este
// undefined (nu ""), ca randul "De reluat" sa primeasca aceeasi oglindire ca din formular.
// Pe un client existent cu data goala, data din fisier se completeaza; o data deja
// scrisa nu se atinge. Planul este o functie pura: nu atinge nici browserul, nici baza.
import { expect, test } from "@playwright/test";
import { buildPlan } from "@/lib/data/lead-import-plan";
import { importNextActionAt } from "@/lib/data/import-shared";

type Field = "nextActionDate" | "address";

function stored(empty: Field[]) {
  return {
    id: "c1",
    name: "Ion SRL",
    phoneKey: null,
    emailKey: "ion@example.md",
    empty,
  };
}

test("fara data in fisier: la creare se trimite undefined, nu stergere", () => {
  expect(importNextActionAt("")).toBeUndefined();
  expect(importNextActionAt("2026-11-03")).toBe("2026-11-03");
});

test("lead nou dintr-un fisier fara coloana de data: data pregatita este goala", () => {
  const { plan, prepared } = buildPlan({
    rows: [["Ana SRL", "ana@example.md"]],
    mapping: ["name", "email"],
    owners: new Map(),
    fallbackSource: "site",
    existing: [stored(["nextActionDate"])],
  });
  expect(plan.entries[0]!.kind).toBe("new");
  expect(importNextActionAt(prepared.get(2)!.nextActionDate)).toBeUndefined();
});

test("existent cu data goala: data din fisier se completeaza", () => {
  const { plan } = buildPlan({
    rows: [["Ion SRL", "ion@example.md", "2026-11-03"]],
    mapping: ["name", "email", "nextActionDate"],
    owners: new Map(),
    fallbackSource: "site",
    existing: [stored(["nextActionDate"])],
  });
  const entry = plan.entries[0]!;
  expect(entry.kind).toBe("duplicate");
  if (entry.kind !== "duplicate") return;
  expect(entry.fillable).toEqual(["nextActionDate"]);
});

test("existent cu data deja scrisa: data din fisier nu o suprascrie", () => {
  const { plan } = buildPlan({
    rows: [["Ion SRL", "ion@example.md", "2026-11-03"]],
    mapping: ["name", "email", "nextActionDate"],
    owners: new Map(),
    fallbackSource: "site",
    existing: [stored([])],
  });
  const entry = plan.entries[0]!;
  expect(entry.kind).toBe("duplicate");
  if (entry.kind !== "duplicate") return;
  expect(entry.fillable).toEqual([]);
});
