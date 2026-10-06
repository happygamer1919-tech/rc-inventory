import { expect, test, type Page } from "@playwright/test";
import {
  cancelTaskPatch,
  changedTaskFields,
  taskPatchRow,
  type TaskFormValues,
} from "@/lib/data/tasks-shape";
import { managerAccount, ownerAccount, type TestAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// task-save-changed-fields.spec - linia de acceptanta a cardului P3-157.
//
// DEFECTUL: formularul unei sarcini trimitea inapoi toate cele opt campuri asa cum
// erau la deschiderea paginii, iar updateTask le scria pe toate. Un coleg marca
// sarcina "Finalizată", operatorul cu fisa deschisa mai devreme schimba numai
// termenul si salva, iar starea revenea la "De făcut". "Anulează sarcina" facea la
// fel cu celelalte campuri.
//
// PRIMELE CAZURI SUNT DE MODUL PUR, fara pagina si fara baza, pe tiparul cazurilor
// pure din import-shared.spec.ts. Ultimele trei deschid ecranul /sarcini si au nevoie
// de stiva locala din CI.
//
// COLEGUL SCRIE PRIN TABELA, CU JETONUL LUI, si nu printr-un al doilea browser: el
// este alt utilizator, iar ce se dovedeste aici este ce face formularul operatorului
// deschis MAI DEVREME, nu drumul pe care colegul a ajuns la randul lui.
//
// DATELE DE TEST NU SE STERG NICIODATA, conventia P2-07. Totul este prefixat TEST.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const TAG = `TEST-P3157-${RUN}`;
const SARCINI = "/sarcini";

/* =======================================================================
   MODUL PUR
   ======================================================================= */

const LOADED: TaskFormValues = {
  title: "Sună clientul",
  description: "Despre oferta de acoperiș",
  status: "todo",
  priority: "medium",
  dueDate: "2036-03-10",
  assigneeId: "",
  entityType: "client",
  entityId: "11111111-1111-1111-1111-111111111111",
};

test("sarcina salvata: numai termenul schimbat pleaca numai cu termenul", () => {
  const patch = changedTaskFields(LOADED, { ...LOADED, dueDate: "2036-03-20" });
  expect(patch).toEqual({ dueDate: "2036-03-20" });
});

test("sarcina salvata: nicio schimbare inseamna o modificare goala", () => {
  expect(changedTaskFields(LOADED, { ...LOADED })).toEqual({});
});

test("sarcina salvata: un termen sters pleaca gol, ca sa se goleasca", () => {
  expect(changedTaskFields(LOADED, { ...LOADED, dueDate: "" })).toEqual({ dueDate: "" });
});

test("sarcina salvata: perechea inregistrarii legate pleaca intreaga", () => {
  const other = "22222222-2222-2222-2222-222222222222";
  expect(changedTaskFields(LOADED, { ...LOADED, entityId: other })).toEqual({
    entityType: "client",
    entityId: other,
  });
  expect(changedTaskFields(LOADED, { ...LOADED, entityType: "", entityId: "" })).toEqual({
    entityType: "",
    entityId: "",
  });
});

test("sarcina salvata: randul pentru un termen singur nu atinge starea", () => {
  const row = taskPatchRow({ dueDate: "2036-03-20" });
  expect(row).toEqual({ due_date: "2036-03-20" });
  expect(Object.keys(row)).not.toContain("status");
});

test("sarcina anulata: anularea scrie numai starea", () => {
  expect(cancelTaskPatch()).toEqual({ status: "cancelled" });
  expect(taskPatchRow(cancelTaskPatch())).toEqual({ status: "cancelled" });
});

/* =======================================================================
   ECRANUL, CU STIVA LOCALA DIN CI
   ======================================================================= */

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "task-save-changed-fields.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL si " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY. In CI sunt exportate de pasul 'Export local " +
        "Supabase credentials'.",
    );
  }
  return { origin: new URL(url).origin, anon };
}

async function accessToken(account: TestAccount): Promise<string> {
  const { origin, anon } = env();
  const response = await fetch(`${origin}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: string };
  if (!response.ok || !body.access_token) {
    throw new Error(`autentificarea API a raspuns ${response.status}`);
  }
  return body.access_token;
}

async function asUser(
  token: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ ok: boolean; text: string; rows: Record<string, unknown>[] }> {
  const response = await fetch(`${env().origin}/rest/v1/${path}`, {
    method: init.method ?? "GET",
    headers: {
      apikey: env().anon,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text().catch(() => "");
  let rows: Record<string, unknown>[] = [];
  try {
    const parsed = JSON.parse(text);
    rows = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    rows = [];
  }
  return { ok: response.ok, text, rows };
}

let ownerToken = "";
let managerToken = "";

test.beforeAll(async () => {
  // Cazurile pure de mai sus nu au nevoie de stiva; jetoanele se cer numai cand
  // ruleaza si cazurile de ecran.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
  ownerToken = await accessToken(ownerAccount());
  managerToken = await accessToken(managerAccount());
});

async function seed(row: Record<string, unknown>): Promise<string> {
  const written = await asUser(ownerToken, "tasks?select=id", { method: "POST", body: row });
  expect(written.ok, `sarcina de test nu a putut fi scrisa: ${written.text}`).toBe(true);
  return String(written.rows[0]!.id);
}

async function readTask(id: string): Promise<Record<string, unknown>> {
  const r = await asUser(
    ownerToken,
    `tasks?select=title,status,priority,due_date,updated_at&id=eq.${id}`,
  );
  expect(r.rows, "sarcina se citeste din baza").toHaveLength(1);
  return r.rows[0]!;
}

/** Colegul schimba randul prin tabela, cu jetonul lui. */
async function colleagueWrites(id: string, row: Record<string, unknown>): Promise<void> {
  const r = await asUser(managerToken, `tasks?id=eq.${id}&select=id`, {
    method: "PATCH",
    body: row,
  });
  expect(r.ok && r.rows.length === 1, `colegul nu a putut scrie: ${r.text}`).toBe(true);
}

/** Operatorul deschide formularul sarcinii pe fila /sarcini si il lasa deschis. */
async function openFormEarlier(page: Page, id: string, window: [string, string]): Promise<void> {
  await signIn(page, ownerAccount());
  await page.goto(`${SARCINI}?de_la=${window[0]}&pana_la=${window[1]}`);
  await expect(page.getByTestId("tasks-filters")).toBeVisible({ timeout: 30_000 });
  const row = page.locator(`[data-testid="task-row"][data-id="${id}"]`);
  await expect(row, "sarcina semanata este pe lista").toHaveCount(1, { timeout: 30_000 });
  await row.getByTestId("task-edit").click();
  await expect(page.getByTestId("task-form")).toBeVisible();
}

test("sarcina salvata: termenul schimbat dupa ce un coleg a finalizat-o pastreaza starea Finalizata", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const id = await seed({ title: `${TAG} termen`, status: "todo", due_date: "2036-03-10" });

  await openFormEarlier(page, id, ["2036-03-01", "2036-03-31"]);

  await colleagueWrites(id, { status: "done" });
  expect((await readTask(id)).status, "colegul a finalizat sarcina").toBe("done");

  await page.getByTestId("field-task-due-date").fill("20.03.2036");
  await page.getByTestId("task-save").click();
  await expect(page.getByTestId("task-form")).toHaveCount(0, { timeout: 30_000 });

  await expect
    .poll(async () => (await readTask(id)).due_date, { timeout: 30_000 })
    .toBe("2036-03-20");
  expect((await readTask(id)).status, "starea pusa de coleg a ramas").toBe("done");
});

test("sarcina anulata: anularea dintr-un formular vechi pastreaza ce a schimbat colegul", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const id = await seed({
    title: `${TAG} anulare`,
    status: "todo",
    priority: "medium",
    due_date: "2036-04-10",
  });

  await openFormEarlier(page, id, ["2036-04-01", "2036-04-30"]);

  const colleagueTitle = `${TAG} anulare schimbata de coleg`;
  await colleagueWrites(id, { title: colleagueTitle, priority: "high", due_date: "2036-04-15" });

  await page.getByTestId("task-cancel-task").click();
  await expect(page.getByTestId("task-form")).toHaveCount(0, { timeout: 30_000 });

  await expect.poll(async () => (await readTask(id)).status, { timeout: 30_000 }).toBe("cancelled");
  const after = await readTask(id);
  expect(after.title, "titlul colegului a ramas").toBe(colleagueTitle);
  expect(after.priority, "urgenta colegului a ramas").toBe("high");
  expect(after.due_date, "termenul colegului a ramas").toBe("2036-04-15");
});

test("sarcina salvata: Salvează fara nicio schimbare nu scrie nimic", async ({ page }) => {
  test.setTimeout(300_000);
  const id = await seed({ title: `${TAG} neschimbata`, status: "todo", due_date: "2036-05-10" });

  await openFormEarlier(page, id, ["2036-05-01", "2036-05-31"]);
  await colleagueWrites(id, { status: "in_progress" });
  const before = await readTask(id);

  await page.getByTestId("task-save").click();
  await expect(page.getByTestId("task-form")).toHaveCount(0, { timeout: 30_000 });

  const after = await readTask(id);
  expect(after.status, "starea colegului a ramas").toBe("in_progress");
  expect(after.updated_at, "randul nu a fost scris deloc").toBe(before.updated_at);
});
