import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { ownerAccount, managerAccount, type TestAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// P3-270: a Sarcini link filtered on a switched-off colleague keeps the filter, shows
// the "Responsabil inactiv" option selected, and carries it through other filter changes
// until Șterge filtrele. An id that belongs to no profile at all is still dropped.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error(
      "This spec needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return { origin: new URL(url).origin, anon, service };
}

async function asService(
  path: string,
  init: { method?: string; body?: unknown; prefer?: string } = {},
) {
  const { origin, service } = env();
  const response = await fetch(`${origin}/rest/v1/${path}`, {
    method: init.method ?? "GET",
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      "Content-Type": "application/json",
      ...(init.prefer ? { Prefer: init.prefer } : {}),
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
  return { ok: response.ok, rows, text };
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

async function profileIdOf(email: string): Promise<string> {
  const result = await asService(`profiles?select=id&email=eq.${encodeURIComponent(email)}&limit=1`);
  expect(result.ok, `profile read failed: ${result.text}`).toBe(true);
  expect(result.rows.length, `profile not found for ${email}`).toBe(1);
  return String(result.rows[0]!.id);
}

async function createTask(token: string, row: Record<string, unknown>) {
  const { origin, anon } = env();
  const response = await fetch(`${origin}/rest/v1/tasks?select=id`, {
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

async function createClient(): Promise<string> {
  const result = await asService("clients?select=id", {
    method: "POST",
    prefer: "return=representation",
    body: { name: `TEST sarcini-inactive-filter ${RUN}`, active: true },
  });
  expect(result.ok, `client creation failed: ${result.text}`).toBe(true);
  return String(result.rows[0]!.id);
}

// The manager account is shared with other specs: it is put back after every test.
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
  expect(result.ok, `deactivation failed: ${result.text}`).toBe(true);
}

test("sarcini: filtrul pe un coleg dezactivat ramane, se duce mai departe si se sterge cu Șterge filtrele", async ({
  page,
}) => {
  test.setTimeout(150_000);

  const ownerProfile = await profileIdOf(ownerAccount().email);
  const managerProfile = await profileIdOf(managerAccount().email);
  const ownerToken = await accessToken(ownerAccount());
  const clientId = await createClient();

  const inactiveTitle = `TEST sarcini-inactive-filter inactive ${RUN}`;
  const ownTitle = `TEST sarcini-inactive-filter owner ${RUN}`;
  await createTask(ownerToken, {
    title: inactiveTitle,
    status: "todo",
    priority: "medium",
    assignee_id: managerProfile,
    entity_type: "client",
    entity_id: clientId,
  });
  await createTask(ownerToken, {
    title: ownTitle,
    status: "todo",
    priority: "medium",
    assignee_id: ownerProfile,
    entity_type: "client",
    entity_id: clientId,
  });
  await deactivateProfile(managerProfile);

  await signIn(page, ownerAccount());

  // (a) the id stays in the address, the list is filtered, the option shows selected.
  await page.goto(`/sarcini?responsabil=${managerProfile}`);
  await expect(page.getByTestId("tasks-filters")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("tasks-assignee").locator("option:checked")).toHaveText(
    "Responsabil inactiv",
  );
  await expect(page.getByTestId("task-title").filter({ hasText: inactiveTitle })).toHaveCount(1);
  await expect(page.getByTestId("task-title").filter({ hasText: ownTitle })).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("responsabil")).toBe(managerProfile);

  // (b) another filter changes, the colleague stays.
  await page.getByTestId("tasks-priority").selectOption("medium");
  await page.waitForURL(/urgenta=medium/, { timeout: 10_000 });
  expect(new URL(page.url()).searchParams.get("responsabil")).toBe(managerProfile);
  await expect(page.getByTestId("task-title").filter({ hasText: inactiveTitle })).toHaveCount(1);
  await expect(page.getByTestId("task-title").filter({ hasText: ownTitle })).toHaveCount(0);

  // (c) Șterge filtrele removes it.
  await page.getByTestId("tasks-clear").click();
  await page.waitForURL((url) => !url.searchParams.has("responsabil"), { timeout: 10_000 });
  expect(page.url()).not.toContain("responsabil");
});

test("sarcini: un id de responsabil fara niciun profil se scoate din adresa si lista nu e filtrata", async ({
  page,
}) => {
  test.setTimeout(120_000);

  const ownerProfile = await profileIdOf(ownerAccount().email);
  const ownerToken = await accessToken(ownerAccount());
  const clientId = await createClient();
  const title = `TEST sarcini-inactive-filter unknown ${RUN}`;
  await createTask(ownerToken, {
    title,
    status: "todo",
    priority: "medium",
    assignee_id: ownerProfile,
    entity_type: "client",
    entity_id: clientId,
  });

  await signIn(page, ownerAccount());
  await page.goto(`/sarcini?responsabil=${randomUUID()}`);
  await expect(page.getByTestId("tasks-filters")).toBeVisible({ timeout: 30_000 });

  // (d) the dead id is dropped and the list shows everything again.
  await page.waitForURL((url) => !url.searchParams.has("responsabil"), { timeout: 15_000 });
  await expect(page.getByTestId("task-title").filter({ hasText: title })).toHaveCount(1, {
    timeout: 15_000,
  });
});
