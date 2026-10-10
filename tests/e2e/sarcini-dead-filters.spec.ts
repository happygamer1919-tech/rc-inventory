import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { ownerAccount, managerAccount, type TestAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// sarcini-dead-filters.spec - fixes the bug where:
// 1. An inactive assignee filter stays in URL and shows no UI message
// 2. A ?sarcina=<id> param from the Azi link is never removed from URL

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error("This spec needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY");
  }
  return { origin: new URL(url).origin, anon, service };
}

function serviceHeaders() {
  return { apikey: env().service, Authorization: `Bearer ${env().service}` };
}

async function rest(
  path: string,
  init: { method?: string; headers: Record<string, string>; body?: unknown } = {
    headers: {},
  },
) {
  const response = await fetch(`${env().origin}/rest/v1/${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...init.headers,
      "Content-Type": "application/json",
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
  return {
    status: response.status,
    ok: response.ok,
    rows,
    text,
  };
}

const asService = (path: string, init: Omit<Parameters<typeof rest>[1], "headers"> = {}) =>
  rest(path, { ...init, headers: serviceHeaders() });

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

async function profileIdOf(email: string): Promise<string> {
  const result = await asService(`profiles?select=id&email=eq.${encodeURIComponent(email)}&limit=1`);
  expect(result.ok, `failed to get profile for ${email}: ${result.text}`).toBe(true);
  expect(result.rows.length, `profile not found for ${email}`).toBe(1);
  return String(result.rows[0]!.id);
}

async function createTask(token: string, row: Record<string, unknown>) {
  const { origin, anon } = env();
  const response = await fetch(`${origin}/rest/v1/tasks?select=id,title`, {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });
  const body = (await response.json()) as Record<string, unknown>[];
  expect(response.ok, `task creation failed: ${JSON.stringify(body)}`).toBe(true);
  return String(body[0]!.id);
}

// The manager account is shared with other specs: whatever a test deactivates is put back
// after it, pass or fail, so a later spec can still sign in with it.
const deactivated: string[] = [];

test.afterEach(async () => {
  for (const profileId of deactivated.splice(0)) {
    await asService(`profiles?id=eq.${profileId}`, { method: "PATCH", body: { active: true } });
  }
});

async function deactivateProfile(profileId: string) {
  deactivated.push(profileId);
  const result = await asService(`profiles?id=eq.${profileId}`, {
    method: "PATCH",
    body: { active: false },
  });
  expect(result.ok, `failed to deactivate profile: ${result.text}`).toBe(true);
}

async function createClient(): Promise<string> {
  const result = await rest(`clients?select=id`, {
    method: "POST",
    headers: { ...serviceHeaders(), Prefer: "return=representation" },
    body: { name: `TEST sarcini-dead-filters ${RUN}`, active: true },
  });
  expect(result.ok, `failed to create client: ${result.text}`).toBe(true);
  return String(result.rows[0]!.id);
}

test("sarcini: o legatura la un responsabil dezactivat arata butonul Șterge filtrele", async ({
  page,
}) => {
  test.setTimeout(120_000);

  const ownerProfile = await profileIdOf(ownerAccount().email);
  const managerProfile = await profileIdOf(managerAccount().email);
  const ownerToken = await accessToken(ownerAccount());
  const clientId = await createClient();

  const taskId = await createTask(ownerToken, {
    title: `TEST sarcini-dead-filters inactive ${RUN}`,
    status: "todo",
    priority: "medium",
    assignee_id: managerProfile,
    due_date: "2033-03-15",
    entity_type: "client",
    entity_id: clientId,
  });

  // Deactivate the profile
  await deactivateProfile(managerProfile);

  await signIn(page, ownerAccount());

  // Navigate with the inactive assignee filter
  await page.goto(`/sarcini?responsabil=${managerProfile}`);
  await expect(page.getByTestId("tasks-filters")).toBeVisible({ timeout: 30_000 });

  // The inactive assignee option should appear
  const assigneeSelect = page.getByTestId("tasks-assignee");
  await expect(assigneeSelect).toBeVisible();

  // The "Șterge filtrele" button should appear because there's an active filter
  const clearButton = page.getByTestId("tasks-clear");
  await expect(clearButton).toBeVisible();

  // Click "Șterge filtrele" to remove the filter
  await clearButton.click();

  // URL should no longer have the responsabil param
  await page.waitForURL("/sarcini", { timeout: 10_000 });
  expect(page.url()).not.toContain("responsabil");
});

test("sarcini: dupa schimbarea unui filtru, un responsabil mort nu se duce mai departe", async ({
  page,
}) => {
  test.setTimeout(120_000);

  const managerProfile = await profileIdOf(managerAccount().email);
  const ownerToken = await accessToken(ownerAccount());
  const clientId = await createClient();

  await createTask(ownerToken, {
    title: `TEST sarcini-dead-filters change-filter ${RUN}`,
    status: "todo",
    priority: "medium",
    assignee_id: managerProfile,
    entity_type: "client",
    entity_id: clientId,
  });

  // Deactivate the profile
  await deactivateProfile(managerProfile);

  await signIn(page, ownerAccount());

  // Navigate with the inactive assignee filter
  await page.goto(`/sarcini?responsabil=${managerProfile}`);
  await expect(page.getByTestId("tasks-filters")).toBeVisible({ timeout: 30_000 });

  // Change another filter (status)
  const statusSelect = page.getByTestId("tasks-status");
  await statusSelect.selectOption("in_progress");

  // Wait for navigation
  await page.waitForURL(/stare=in_progress/, { timeout: 10_000 });

  // URL should no longer have the responsabil param, but should have the status param
  const url = page.url();
  expect(url).not.toContain("responsabil");
  expect(url).toContain("stare=in_progress");
});

test("sarcini: o legatura de pe Azi cu ?sarcina=<id> se sterge din adresa cand se inchide formularul", async ({
  page,
}) => {
  test.setTimeout(120_000);

  const ownerProfile = await profileIdOf(ownerAccount().email);
  const ownerToken = await accessToken(ownerAccount());
  const clientId = await createClient();

  const taskId = await createTask(ownerToken, {
    title: `TEST sarcini-dead-filters form-close ${RUN}`,
    status: "todo",
    priority: "medium",
    assignee_id: ownerProfile,
    entity_type: "client",
    entity_id: clientId,
  });

  await signIn(page, ownerAccount());

  // Navigate with ?sarcina=<id> as if coming from the Azi link
  await page.goto(`/sarcini?sarcina=${taskId}`);
  await expect(page.getByTestId("tasks-filters")).toBeVisible({ timeout: 30_000 });

  // The task form should open
  await expect(page.getByTestId("task-form")).toBeVisible({ timeout: 10_000 });

  // The URL should have the sarcina param
  expect(page.url()).toContain(`sarcina=${taskId}`);

  // Close the form (click outside or the close button if available)
  // The form closes when pressing Escape
  await page.keyboard.press("Escape");

  // Wait for form to close
  await expect(page.getByTestId("task-form")).toHaveCount(0, { timeout: 10_000 });

  // URL should no longer have the sarcina param
  await page.waitForURL("/sarcini", { timeout: 10_000 });
  expect(page.url()).not.toContain("sarcina");

  // Reload the page - the form should not reopen
  await page.reload();
  await expect(page.getByTestId("tasks-filters")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("task-form")).toHaveCount(0, { timeout: 10_000 });
});
