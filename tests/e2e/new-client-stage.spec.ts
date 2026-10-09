import { expect, test } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// new-client-stage.spec - linia de acceptanta a cardului P3-198.
//
// Un client adaugat cu Client nou pe ecranul Clienti porneste la etapa client, ca
// sa apara de indata in lista de cumparatori de la vanzarea directa (P3-196). Un
// lead existent isi pastreaza etapa la editare.
//
// DATELE DE TEST NU SE STERG NICIODATA: randurile poarta prefixul TEST si
// sfarsesc dezactivate (conventia P2-07).

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const TAG = `TEST-P3198-${RUN}`;

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    throw new Error(
      "new-client-stage.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL si SUPABASE_SERVICE_ROLE_KEY. " +
        "In CI sunt exportate de pasul 'Export local Supabase credentials'.",
    );
  }
  return { origin: new URL(url).origin, service };
}

async function asService(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ ok: boolean; text: string; rows: Record<string, unknown>[] }> {
  const { origin, service } = env();
  const response = await fetch(`${origin}/rest/v1/${path}`, {
    method: init.method ?? "GET",
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
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

async function storedClient(name: string): Promise<Record<string, unknown>> {
  const found = await asService(
    `clients?select=id,stage,active&name=eq.${encodeURIComponent(name)}`,
  );
  expect(found.ok, `clientul ${name} s-a citit: ${found.text}`).toBe(true);
  expect(found.rows.length, `clientul ${name} exista o data`).toBe(1);
  return found.rows[0]!;
}

async function deactivate(id: unknown) {
  await asService(`clients?id=eq.${String(id)}`, { method: "PATCH", body: { active: false } });
}

test.describe("P3-198: etapa unui client nou", () => {
  test.describe.configure({ timeout: 120_000 });

  test("P3-198: un client nou de pe ecranul Clienti porneste la etapa client", async ({ page }) => {
    const name = `${TAG} nou`;
    await signIn(page, ownerAccount());
    await page.goto("/clienti");
    await page.getByTestId("client-new").click();
    await expect(page.getByTestId("client-form")).toBeVisible();
    await expect(page.getByTestId("field-client-stage")).toHaveValue("client");
    await page.getByTestId("field-client-name").fill(name);
    await page.getByTestId("client-submit").click();
    await expect(page).toHaveURL(/\/clienti\/[0-9a-f-]{36}/, { timeout: 30_000 });

    const stored = await storedClient(name);
    expect(stored.stage).toBe("client");
    await deactivate(stored.id);
  });

  test("P3-198: clientul nou apare in lista de cumparatori de la vanzarea directa", async ({
    page,
  }) => {
    const name = `${TAG} cumparator`;
    await signIn(page, ownerAccount());
    await page.goto("/clienti");
    await page.getByTestId("client-new").click();
    await expect(page.getByTestId("client-form")).toBeVisible();
    await page.getByTestId("field-client-name").fill(name);
    await page.getByTestId("client-submit").click();
    await expect(page).toHaveURL(/\/clienti\/[0-9a-f-]{36}/, { timeout: 30_000 });

    await page.goto("/iesiri");
    await expect(page.getByTestId("outbound-form")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("issue-mode-direct_client").check();
    await expect(page.getByTestId("field-pickup-date")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("field-client").locator("input").fill(name);
    await expect(page.locator("[data-rc-combo-list]")).toBeVisible();
    const items = await page.locator("[data-rc-combo-list] li button").allTextContents();
    expect(items.some((text) => text.includes(name)), "clientul nou apare").toBe(true);

    const stored = await storedClient(name);
    await deactivate(stored.id);
  });

  test("P3-198: editarea unui lead existent nu ii schimba etapa", async ({ page }) => {
    const name = `${TAG} lead`;
    const created = await asService("clients?select=id", {
      method: "POST",
      body: { name, type: "company", stage: "cold" },
    });
    expect(created.ok, `leadul s-a creat: ${created.text}`).toBe(true);
    const id = String(created.rows[0]!.id);

    await signIn(page, ownerAccount());
    await page.goto(`/clienti/${id}`);
    await page.getByTestId("client-edit").click();
    await expect(page.getByTestId("client-form")).toBeVisible();
    await expect(page.getByTestId("field-client-stage")).toHaveValue("cold");
    await page.getByTestId("field-client-notes").fill(`${TAG} nota`);
    await page.getByTestId("client-submit").click();
    await expect(page.getByTestId("client-form")).toBeHidden({ timeout: 30_000 });

    const stored = await storedClient(name);
    expect(stored.stage).toBe("cold");
    await deactivate(id);
  });
});
