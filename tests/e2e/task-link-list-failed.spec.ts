import { expect, test } from "@playwright/test";
import {
  PROJECT_LIST_READ_FAILED,
  closedProjectLabel,
  linkListError,
} from "@/lib/data/tasks-shape";

// P3-254. Un test fara baza de date: partea pura a citirii picate a listei de proiecte
// din formularul de sarcini. Fisierul sta in tests/e2e fiindca playwright.config.ts
// fixeaza testDir acolo.

const closed = { name: "Santier Nord", status: "closed", active: true };
const inactive = { name: "Santier Sud", status: "active", active: false };

test("P3-254: lista de proiecte citita bine pastreaza (închis) si (inactiv)", () => {
  expect(closedProjectLabel(closed, false)).toBe("Santier Nord (închis)");
  expect(closedProjectLabel(inactive, false)).toBe("Santier Sud (inactiv)");
});

test("P3-254: lista de proiecte picata nu pune niciun proiect legat ca inchis sau inactiv", () => {
  for (const p of [closed, inactive, { name: "Santier Est", status: "active", active: true }]) {
    const label = closedProjectLabel(p, true);
    expect(label).toBe(p.name);
    expect(label).not.toContain("(închis)");
    expect(label).not.toContain("(inactiv)");
  }
});

test("P3-254: semnalul de esec ajunge la casuta Înregistrare numai pentru proiecte", () => {
  expect(linkListError("project", true)).toBe(PROJECT_LIST_READ_FAILED);
  expect(PROJECT_LIST_READ_FAILED).toBe(
    "Lista de proiecte nu a putut fi încărcată. Reîncărcați pagina.",
  );
  expect(linkListError("project", false)).toBeNull();
  expect(linkListError("client", true)).toBeNull();
  expect(linkListError("", true)).toBeNull();
});
