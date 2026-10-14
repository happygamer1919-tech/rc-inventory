// P3-302. Un export tipareste colegii dezactivati si "Fără nume"; reimportul lor nu
// mai este o eroare, iar sursa nealeasa inca se spune pe ecran. Functii pure, fara
// browser si fara baza.
import { expect, test } from "@playwright/test";
import { buildClientPlan } from "@/lib/data/client-import-plan";
import { CLIENT_IMPORT_FIELDS } from "@/lib/data/client-import-types";
import { SOURCE_CHOSEN_NEXT_STEP } from "@/lib/data/import-preview-rows";
import { ownerLeftEmptyWarning } from "@/lib/data/import-shared";
import { buildPlan as buildLeadPlan } from "@/lib/data/lead-import-plan";
import { buildOwnerIndex } from "@/lib/data/lead-import-types";

const OWNERS = buildOwnerIndex([{ id: "u1", fullName: "Ana Activa" }], ["Ion Plecat"]);

test("leaduri: responsabil dezactivat pe un rand dublat ajunge in Dublate, nu in erori", () => {
  const { plan } = buildLeadPlan({
    rows: [["Ion SRL", "ion@example.md", "Ion Plecat"]],
    mapping: ["name", "email", "ownerName"],
    owners: OWNERS,
    fallbackSource: "",
    existing: [
      { id: "c9", name: "Ion SRL", phoneKey: null, emailKey: "ion@example.md", empty: [], active: true },
    ],
  });
  expect(plan.counts.error).toBe(0);
  expect(plan.counts.duplicate).toBe(1);
});

test("leaduri: rand nou cu responsabil dezactivat sau 'Fără nume' ramane, fara responsabil", () => {
  const { plan, prepared } = buildLeadPlan({
    rows: [
      ["Ion SRL", "ion@example.md", "Ion Plecat"],
      ["Vasile SRL", "vasile@example.md", "Fără nume"],
      ["Ghita SRL", "ghita@example.md", "Necunoscut Total"],
    ],
    mapping: ["name", "email", "ownerName"],
    owners: OWNERS,
    fallbackSource: "",
    existing: [],
  });
  expect(plan.counts.fresh).toBe(2);
  expect(plan.counts.error).toBe(1);
  expect(prepared.get(2)!.ownerId).toBe("");
  expect(prepared.get(3)!.ownerId).toBe("");
});

test("clienti: responsabil dezactivat nu mai este refuzat", () => {
  const { plan } = buildClientPlan({
    rows: [["Ana SRL", "ana@example.md", "Ion Plecat"]],
    mapping: ["name", "email", "ownerName", ...CLIENT_IMPORT_FIELDS.slice(3).map(() => null)],
    owners: OWNERS,
    existing: [],
  });
  expect(plan.counts.error).toBe(0);
  expect(plan.counts.fresh).toBe(1);
});

test("avertisment doar pentru un coleg care nu se poate atribui", () => {
  expect(ownerLeftEmptyWarning(OWNERS, ["x", "Ion Plecat"], 1)).toContain("Ion Plecat");
  expect(ownerLeftEmptyWarning(OWNERS, ["x", "Ana Activa"], 1)).toBeNull();
  expect(ownerLeftEmptyWarning(OWNERS, ["x", ""], 1)).toBeNull();
  expect(ownerLeftEmptyWarning(OWNERS, ["x", "Ion Plecat"], -1)).toBeNull();
});

test("leaduri: celula Sursă goala spune 'se alege la pasul următor'", () => {
  const { plan } = buildLeadPlan({
    rows: [["Ion SRL", "ion@example.md"]],
    mapping: ["name", "email"],
    owners: new Map(),
    fallbackSource: "",
    existing: [],
  });
  const { columns, rows } = plan.preview;
  expect(rows[0]!.cells[columns.indexOf("Sursă") - 1]).toBe(SOURCE_CHOSEN_NEXT_STEP);
});
