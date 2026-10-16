import { expect, test } from "@playwright/test";
import { ownerAccount, type TestAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// P3-315. Sarcini se deschide pe sarcinile DESCHISE (de facut si in lucru). Cele finalizate
// se aduc cate 50 pe pagina cu filtrul "Finalizate"; "Toate stările" le aduce pe toate.
//
// 60 de sarcini finalizate si 2 deschise, toate cu termen in martie 2041, ca fereastra de
// termen sa le izoleze de restul sarcinilor stivei de test. Nimic nu se sterge: sarcinile de
// test raman, ca oriunde in aceasta aplicatie.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const TAG = `TEST-P3315-${RUN}`;
const WINDOW = "de_la=2041-03-01&pana_la=2041-03-31";
const DONE_COUNT = 60;

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("This spec needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
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
    throw new Error(`API authentication failed with status ${response.status}`);
  }
  return body.access_token;
}

async function insertTasks(token: string, rows: Record<string, unknown>[]): Promise<void> {
  const { origin, anon } = env();
  const response = await fetch(`${origin}/rest/v1/tasks`, {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(rows),
  });
  expect(response.ok, `task creation failed: ${response.status} ${await response.text()}`).toBe(true);
}

test("sarcini: lista implicita arata numai sarcinile deschise, iar Finalizate vin cate 50 pe pagina", async ({
  page,
}) => {
  test.setTimeout(240_000);

  const token = await accessToken(ownerAccount());
  const day = (n: number) => `2041-03-${String(n).padStart(2, "0")}`;

  await insertTasks(token, [
    { title: `${TAG} deschisa de facut`, status: "todo", priority: "medium", due_date: day(15) },
    { title: `${TAG} deschisa in lucru`, status: "in_progress", priority: "medium", due_date: day(16) },
  ]);
  await insertTasks(
    token,
    Array.from({ length: DONE_COUNT }, (_, i) => ({
      title: `${TAG} finalizata ${String(i + 1).padStart(2, "0")}`,
      status: "done",
      priority: "low",
      due_date: day((i % 28) + 1),
    })),
  );

  await signIn(page, ownerAccount());
  const rows = page.getByTestId("task-row");

  // 1. Implicit: numai cele 2 deschise, fara pager, iar selectorul spune "Deschise".
  await page.goto(`/sarcini?${WINDOW}`);
  await expect(page.getByTestId("tasks-filters")).toBeVisible({ timeout: 30_000 });
  await expect(rows).toHaveCount(2, { timeout: 30_000 });
  await expect(page.getByTestId("task-title").filter({ hasText: `${TAG} finalizata` })).toHaveCount(0);
  await expect(page.getByTestId("list-pager")).toHaveCount(0);
  await expect(page.getByTestId("tasks-status")).toHaveValue("");
  // Starea implicita nu este un filtru pus de operator: nu apare "Șterge filtrele" (fereastra
  // de termen este, ea, un filtru, deci se verifica pe adresa fara fereastra mai jos).
  await page.goto("/sarcini");
  await expect(page.getByTestId("tasks-filters")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("tasks-clear")).toHaveCount(0);
  await expect(page.getByTestId("task-title").filter({ hasText: `${TAG} finalizata` })).toHaveCount(0);

  // 2. Finalizate: prima pagina are 50, a doua are 10, adresa poarta pagina=2.
  await page.goto(`/sarcini?${WINDOW}`);
  await expect(page.getByTestId("tasks-filters")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("tasks-status").selectOption("done");
  await expect(page).toHaveURL(/stare=done/, { timeout: 30_000 });
  await expect(rows).toHaveCount(50, { timeout: 30_000 });
  await expect(page.getByTestId("pager-label")).toHaveText("Pagina 1 din 2");
  await expect(page.getByTestId("pager-range")).toHaveText(`Afișate 1-50 din ${DONE_COUNT}`);
  await expect(page.getByTestId("pager-prev")).toBeDisabled();

  await page.getByTestId("pager-next").click();
  await expect(page).toHaveURL(/[?&]pagina=2(&|$)/, { timeout: 30_000 });
  await expect(page.getByTestId("pager-label")).toHaveText("Pagina 2 din 2", { timeout: 30_000 });
  await expect(rows).toHaveCount(DONE_COUNT - 50, { timeout: 30_000 });
  await expect(page.getByTestId("pager-next")).toBeDisabled();

  // O alta stare intoarce lista la pagina 1.
  await page.getByTestId("tasks-status").selectOption("cancelled");
  await expect(page).not.toHaveURL(/pagina=/, { timeout: 30_000 });

  // 3. "Toate stările" aduce tot, fara pager: 2 deschise si 60 finalizate.
  await page.goto(`/sarcini?${WINDOW}&stare=toate`);
  await expect(page.getByTestId("tasks-filters")).toBeVisible({ timeout: 30_000 });
  await expect(rows).toHaveCount(2 + DONE_COUNT, { timeout: 30_000 });
  await expect(page.getByTestId("list-pager")).toHaveCount(0);

  // 4. Textele nu poarta liniuta lunga (em dash sau en dash).
  const body = await page.getByTestId("tasks-filters").innerText();
  expect(body).not.toContain(String.fromCharCode(0x2013));
  expect(body).not.toContain(String.fromCharCode(0x2014));
});
