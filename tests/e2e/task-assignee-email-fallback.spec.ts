import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { managerAccount, ownerAccount, type TestAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// task-assignee-email-fallback.spec - acceptanta cardului P3-165
//
// Ce se scrie la Responsabil, in Sarcini (lista), in panoul Sarcini de pe fisa unui
// client si in sectiunea Azi:
//
// (a) un coleg cu full_name completat se arata prin acel nume;
// (b) un coleg cu full_name gol se arata prin email;
// (c) o sarcina fara responsabil arata "Nealocată".
//
// CAZUL (b) SE CITESTE CA ADMINISTRATOR. Functia list_team_members() (migratia 0072)
// pune emailul in locul numelui lipsa numai pentru administrator; un manager de cont
// primeste null si ecranul scrie "Fără nume", ca emailul unui coleg sa nu ajunga la
// el. De aceea cazurile (a) si (b) se deschid cu contul de administrator.
//
// Cazurile (a) si (b) au nevoie de o stiva Supabase reala (conturi si profiluri
// scrise cu cheia de serviciu) si ruleaza numai in CI. Conturile si profilurile
// poarta prefixul TEST si sufixul RUN si NU se sterg; sarcinile raman pe loc.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const TAG = `TEST-P3165-${RUN}`;

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error(
      "task-assignee-email-fallback.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY " +
        "si SUPABASE_SERVICE_ROLE_KEY. In CI sunt exportate de pasul 'Export local Supabase credentials'.",
    );
  }
  return { origin: new URL(url).origin, anon, service };
}

const serviceHeaders = () => ({ apikey: env().service, Authorization: `Bearer ${env().service}` });

async function accessToken(account: TestAccount): Promise<string> {
  const response = await fetch(`${env().origin}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env().anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: string };
  if (!response.ok || !body.access_token) throw new Error(`autentificarea API a raspuns ${response.status}`);
  return body.access_token;
}

/** Un coleg nou, activ, cu numele cerut (sau gol), pe care nu il citeste niciun alt spec. */
async function newColleague(fullName: string | null): Promise<{ id: string; email: string }> {
  const email = `p3-165-${RUN}-${randomUUID().slice(0, 8)}@rc-inventory.local`;
  const created = await fetch(`${env().origin}/auth/v1/admin/users`, {
    method: "POST",
    headers: { ...serviceHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: `p3-165-${randomUUID()}`, email_confirm: true }),
  });
  const body = (await created.json().catch(() => ({}))) as { id?: string };
  expect(created.ok && Boolean(body.id), "contul de test nu a putut fi creat").toBe(true);
  const id = String(body.id);

  const profile = await fetch(`${env().origin}/rest/v1/profiles?on_conflict=id`, {
    method: "POST",
    headers: {
      ...serviceHeaders(),
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify([{ id, email, role: "account_manager", full_name: fullName, active: true }]),
  });
  expect(profile.ok, `profilul contului de test nu a putut fi scris: ${profile.status}`).toBe(true);
  return { id, email };
}

/** Un client nou, dus la etapa "client" prin functia aplicatiei, ca fisa lui sa aiba panoul Sarcini. */
async function newClient(ownerToken: string, name: string): Promise<string> {
  const created = await fetch(`${env().origin}/rest/v1/clients?select=id`, {
    method: "POST",
    headers: { ...serviceHeaders(), "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ name, active: true }),
  });
  const rows = (await created.json().catch(() => [])) as Array<{ id?: string }>;
  expect(created.ok && Boolean(rows[0]?.id), `clientul de test nu a putut fi scris: ${created.status}`).toBe(true);
  const id = String(rows[0]!.id);

  const staged = await fetch(`${env().origin}/rest/v1/rpc/set_client_stage`, {
    method: "POST",
    headers: { apikey: env().anon, Authorization: `Bearer ${ownerToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_client_id: id, p_stage: "client", p_follow_up_date: null }),
  });
  expect(staged.ok, `etapa clientului nu a putut fi scrisa: ${staged.status}`).toBe(true);
  return id;
}

/** O sarcina deschisa, cu termenul azi, legata de client, scrisa cu jetonul administratorului. */
async function newTask(
  ownerToken: string,
  title: string,
  clientId: string,
  assigneeId: string,
): Promise<string> {
  const created = await fetch(`${env().origin}/rest/v1/tasks?select=id`, {
    method: "POST",
    headers: {
      apikey: env().anon,
      Authorization: `Bearer ${ownerToken}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      title,
      status: "todo",
      priority: "medium",
      due_date: chisinauDay(),
      assignee_id: assigneeId,
      entity_type: "client",
      entity_id: clientId,
    }),
  });
  const rows = (await created.json().catch(() => [])) as Array<{ id?: string }>;
  expect(created.ok && Boolean(rows[0]?.id), `sarcina de test nu a putut fi scrisa: ${created.status}`).toBe(true);
  return String(rows[0]!.id);
}

/** Ziua de azi IN CHISINAU, `YYYY-MM-DD`, ca sectiunea Azi. */
function chisinauDay(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Chisinau",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Responsabilul sarcinii, citit in toate cele trei locuri unde se scrie. */
async function expectAssigneeEverywhere(page: Page, taskId: string, clientId: string, expected: string) {
  // 1. Sarcini (lista), filtrata pe ziua de azi ca sa nu depinda de alte randuri.
  const day = chisinauDay();
  await page.goto(`/sarcini?de_la=${day}&pana_la=${day}`);
  await expect(page.getByTestId("tasks-filters")).toBeVisible({ timeout: 30_000 });
  const listRow = page.locator(`[data-testid="task-row"][data-id="${taskId}"]`);
  await expect(listRow).toHaveCount(1, { timeout: 30_000 });
  await expect(listRow.getByTestId("task-assignee"), "Responsabil in lista Sarcini").toHaveText(expected);

  // 2. Panoul Sarcini de pe fisa clientului.
  await page.goto(`/clienti/${clientId}`);
  const panel = page.getByTestId("panel-sarcini");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  const panelRow = panel.locator(`[data-testid="task-row"][data-id="${taskId}"]`);
  await expect(panelRow).toHaveCount(1, { timeout: 30_000 });
  await expect(panelRow.getByTestId("task-assignee"), "Responsabil in panoul de pe fisa").toHaveText(expected);

  // 3. Sectiunea Azi: sarcinile deschise cu termenul azi.
  await page.goto("/azi");
  const aziRow = page.locator(`[data-testid="azi-tasks"] [data-testid="azi-task-row"][data-id="${taskId}"]`);
  await expect(aziRow).toHaveCount(1, { timeout: 30_000 });
  await expect(aziRow, "Responsabil pe Azi").toContainText(expected);
}

test.describe("Task assignee email fallback display", () => {
  test("(a) a colleague with a full name shows the name in the list, the panel and Azi", async ({ page }) => {
    test.setTimeout(300_000);
    const ownerToken = await accessToken(ownerAccount());
    const colleague = await newColleague(`Coleg ${TAG}`);
    const clientId = await newClient(ownerToken, `${TAG} client a`);
    const taskId = await newTask(ownerToken, `${TAG} cu nume`, clientId, colleague.id);

    await signIn(page, ownerAccount());
    await expectAssigneeEverywhere(page, taskId, clientId, `Coleg ${TAG}`);
  });

  test("(b) a colleague with a blank full name shows the email in the list, the panel and Azi", async ({ page }) => {
    test.setTimeout(300_000);
    const ownerToken = await accessToken(ownerAccount());
    // Nume spatiator, ca sa fie acoperit si cazul "gol dupa taiere", nu numai null.
    const colleague = await newColleague("   ");
    const clientId = await newClient(ownerToken, `${TAG} client b`);
    const taskId = await newTask(ownerToken, `${TAG} fara nume`, clientId, colleague.id);

    await signIn(page, ownerAccount());
    await expectAssigneeEverywhere(page, taskId, clientId, colleague.email);
  });

  test("(c) task with no assignee shows 'Nealocată'", async ({ page }) => {
    await signIn(page, managerAccount());

    // Navigate to tasks list
    await page.goto("/sarcini");
    await page.waitForLoadState("networkidle");

    // Create a new task WITHOUT assigning to anyone
    await page.locator('text="Sarcină nouă"').click();
    await page.waitForSelector('[data-testid="task-form"]');

    const taskTitle = `${TAG} Unassigned`;
    await page.locator('[data-testid="field-task-title"]').fill(taskTitle);
    // Don't set assignee - leave it as default (empty)

    // Save the task
    await page.locator('[data-testid="task-save"]').click();

    // Wait for task to appear in list
    await page.waitForSelector(`text=${taskTitle}`, { timeout: 5000 });

    // Verify unassigned task shows "Nealocată" in the list
    // The row itself, not three levels up from the title: that climb reaches the whole
    // table when it holds only a few tasks, and then matches every row at once.
    const taskRow = page.locator("tr", { hasText: taskTitle });
    const assigneeCell = taskRow.locator('[data-testid="task-assignee"]');

    await expect(assigneeCell).toContainText("Nealocată");
  });
});
