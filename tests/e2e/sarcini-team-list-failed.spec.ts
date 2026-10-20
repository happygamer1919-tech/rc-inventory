import { expect, test } from "@playwright/test";
import { TEAM_LIST_READ_FAILED, assigneeListError } from "@/lib/data/tasks-shape";
import { teamNameLookup, toTask, type TaskRow } from "@/lib/data/tasks-map";

// P3-330. Un test fara baza de date: partea pura a listei echipei picate pe /sarcini.
// Fisierul sta in tests/e2e fiindca playwright.config.ts fixeaza testDir acolo.

const row: TaskRow = {
  id: "t1",
  title: "Sună furnizorul",
  description: null,
  status: "todo",
  priority: "medium",
  due_date: null,
  assignee_id: "u1",
  entity_type: null,
  entity_id: null,
  created_by: null,
  created_at: "2026-10-20T08:00:00Z",
  updated_at: "2026-10-20T08:00:00Z",
};

test("P3-330: mesajul listei echipei picate este cel din ecran", () => {
  expect(TEAM_LIST_READ_FAILED).toBe("Lista echipei nu s-a putut încărca.");
  expect(assigneeListError(true)).toBe(TEAM_LIST_READ_FAILED);
  expect(assigneeListError(false)).toBeNull();
});

test("P3-330: cu lista echipei picata, numele din imbinarea cu profilul se pastreaza", () => {
  const noNames = new Map<string, string>();
  const joined = { ...row, assignee: { id: "u1", full_name: "Ana Pop" } };
  expect(toTask(joined, noNames).assigneeName).toBe("Ana Pop");
  expect(toTask({ ...row, assignee: { id: "u1", full_name: null, email: "ana@rc.md" } }, noNames).assigneeName).toBe(
    "ana@rc.md",
  );
});

test("P3-330: lista echipei citita bine are intaietate fata de imbinare", () => {
  const names = teamNameLookup([{ id: "u1", displayName: "Ana Pop", active: true }]);
  expect(toTask({ ...row, assignee: { id: "u1", full_name: "Vechi" } }, names).assigneeName).toBe("Ana Pop");
});
