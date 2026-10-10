import { expect, test } from "@playwright/test";
import { managerAccount, ownerAccount, type TestAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// CARDUL P3-255. Migratia 0076 i-a dat managerului de cont dreptul sa creeze un
// client, ca sa poata adauga cumparatorul de la tejghea (P3-147). Limita la patru
// campuri (denumire, tip, IDNO, telefon) statea insa numai in aplicatie, in
// createWalkInClient. Cu jetonul managerului, un POST direct pe /rest/v1/clients
// putea scrie etapa, responsabilul, notele, active = false si orice alta coloana.
//
// Migratia 0079 pune limita pe tabela insasi, printr-un trigger BEFORE INSERT.
// Aici se trimit exact cererile construite de mana pe care le descrie defectul, cu
// jetonul unui cont adevarat, si martorii lor: cele patru campuri, forma exacta pe
// care o trimite calea de la tejghea, calea de la tejghea prin ecran, si
// administratorul cu toate coloanele.
//
// Ruleaza pe stiva locala din CI, niciodata pe productie. Datele de test nu se
// sterg: fiecare client poarta eticheta rularii.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const TAG = `TEST-P3255-${RUN}`;

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error(
      "clients-insert-manager-columns.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL, " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY si SUPABASE_SERVICE_ROLE_KEY. In CI sunt exportate de " +
        "pasul 'Export local Supabase credentials'. Local: supabase status -o env.",
    );
  }
  return { origin: new URL(url).origin, anon, service };
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

type Rest = { status: number; ok: boolean; rows: Record<string, unknown>[]; text: string };

async function rest(path: string, headers: Record<string, string>, method = "GET", body?: unknown): Promise<Rest> {
  const response = await fetch(`${env().origin}/rest/v1/${path}`, {
    method,
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text().catch(() => "");
  let rows: Record<string, unknown>[] = [];
  try {
    const parsed = JSON.parse(text);
    rows = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    rows = [];
  }
  return { status: response.status, ok: response.ok, rows, text };
}

const asService = (path: string) =>
  rest(path, { apikey: env().service, Authorization: `Bearer ${env().service}` });
const asUser = (token: string, path: string, method: string, body?: unknown) =>
  rest(path, { apikey: env().anon, Authorization: `Bearer ${token}` }, method, body);

/** Randurile cu acest nume, citite cu cheia de serviciu, ca o citire refuzata sa
 *  nu para un rand lipsa. */
async function clientsNamed(name: string): Promise<Record<string, unknown>[]> {
  const stored = await asService(
    `clients?select=id,name,stage,active,notes,owner_id,source&name=eq.${encodeURIComponent(name)}`,
  );
  expect(stored.ok, `clientii nu s-au putut citi: ${stored.text}`).toBe(true);
  return stored.rows;
}

/** Ce trimite createWalkInClient pentru managerul de cont, coloana cu coloana:
 *  validate() din lib/data/client-actions.ts face din caseta goala null, iar
 *  etapa `client` se scrie in insert (P3-172). */
function walkInBody(name: string) {
  return {
    name,
    type: "individual",
    fiscal_code: null,
    address: null,
    phone: "069 000 255",
    email: null,
    notes: null,
    active: true,
    stage: "client",
  };
}

test.describe("P3-255, tabela clients: managerul de cont scrie numai cele patru campuri", () => {
  test.describe.configure({ timeout: 120_000 });

  test("managerul: o inserare cu denumire, tip, IDNO si telefon se scrie", async () => {
    const token = await accessToken(managerAccount());
    const name = `${TAG} patru campuri`;
    const fiscal = `9${Date.now().toString().slice(-12)}`;
    const inserted = await asUser(token, "clients?select=id,stage", "POST", {
      name,
      type: "company",
      fiscal_code: fiscal,
      phone: "069 000 256",
    });
    expect(inserted.ok, `cele patru campuri au fost refuzate: ${inserted.text}`).toBe(true);
    const rows = await clientsNamed(name);
    expect(rows, "exact un client").toHaveLength(1);
    expect(rows[0]!.stage, "etapa implicita").toBe("cold");
    expect(rows[0]!.active).toBe(true);
  });

  test("managerul: forma exacta a caii de la tejghea se scrie, cu etapa client", async () => {
    const token = await accessToken(managerAccount());
    const name = `${TAG} forma tejghea`;
    const inserted = await asUser(token, "clients?select=id", "POST", walkInBody(name));
    expect(inserted.ok, `forma caii de la tejghea a fost refuzata: ${inserted.text}`).toBe(true);
    const rows = await clientsNamed(name);
    expect(rows, "exact un client").toHaveLength(1);
    expect(rows[0]!.stage).toBe("client");
  });

  const REFUSED: { column: string; value: (managerId: string) => unknown }[] = [
    { column: "stage", value: () => "quoted" },
    { column: "owner_id", value: (managerId) => managerId },
    { column: "notes", value: () => "nota scrisa direct" },
    { column: "active", value: () => false },
    { column: "source", value: () => "recomandare" },
  ];

  for (const bad of REFUSED) {
    test(`managerul: o inserare directa cu ${bad.column} este refuzata`, async () => {
      const token = await accessToken(managerAccount());
      const managerId = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8"))
        .sub as string;
      const name = `${TAG} refuzat ${bad.column}`;
      const inserted = await asUser(token, "clients?select=id", "POST", {
        name,
        type: "company",
        [bad.column]: bad.value(managerId),
      });
      expect(inserted.ok, `managerul a scris ${bad.column}: ${inserted.text}`).toBe(false);
      expect(inserted.text, "eroarea poarta codul triggerului").toContain("P0001");
      expect(inserted.text, "eroarea numeste coloana").toContain(bad.column);
      expect(inserted.text, "eroarea este in romana").toContain("Managerul de cont");
      expect(await clientsNamed(name), "niciun rand ramas").toHaveLength(0);
    });
  }

  test("administratorul: o inserare cu toate coloanele se scrie in continuare", async () => {
    const token = await accessToken(ownerAccount());
    const ownerId = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8"))
      .sub as string;
    const name = `${TAG} administrator`;
    const inserted = await asUser(token, "clients?select=id", "POST", {
      name,
      type: "company",
      phone: "069 000 257",
      address: "Chișinău",
      email: "p3-255@rc-inventory.local",
      notes: "nota administratorului",
      active: false,
      stage: "quoted",
      source: "recomandare",
      interest: "acoperiș",
      owner_id: ownerId,
      next_action: "sun",
      next_action_at: "2026-12-01",
    });
    expect(inserted.ok, `administratorul a fost refuzat: ${inserted.text}`).toBe(true);
    const rows = await clientsNamed(name);
    expect(rows, "exact un client").toHaveLength(1);
    expect(rows[0]!.stage).toBe("quoted");
    expect(rows[0]!.active).toBe(false);
    expect(rows[0]!.owner_id).toBe(ownerId);
    expect(rows[0]!.notes).toBe("nota administratorului");
  });

  test("managerul: calea de la tejghea din ecran creeaza clientul, cu etapa client", async ({ page }) => {
    const name = `${TAG} ecran tejghea`;
    await signIn(page, managerAccount());
    await page.goto("/iesiri");
    await expect(page.getByTestId("outbound-form")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("issue-mode-direct_client").check();
    await expect(page.getByTestId("field-pickup-date")).toBeVisible({ timeout: 25_000 });

    await page.getByTestId("client-create-open").click();
    await expect(page.getByTestId("client-create-form")).toBeVisible();
    await page.getByTestId("client-create-name").fill(name);
    await page.getByTestId("client-create-type").selectOption("individual");
    await page.getByTestId("client-create-phone").fill("069 000 258");
    await page.getByTestId("client-create-save").click();

    await expect(page.getByTestId("client-create-form")).toHaveCount(0, { timeout: 25_000 });
    await expect(page.getByTestId("client-create-error")).toHaveCount(0);
    await expect(page.getByTestId("field-client").locator("input")).toHaveValue(name);

    const rows = await clientsNamed(name);
    expect(rows, "exact un client creat din ecran").toHaveLength(1);
    expect(rows[0]!.stage, "cumparatorul de la tejghea este client").toBe("client");
    expect(rows[0]!.active).toBe(true);
  });
});
