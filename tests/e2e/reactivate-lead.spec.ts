import { expect, request, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// reactivate-lead.spec - linia de acceptanta a cardului P3-66.
//
// Un lead sau un client dezactivat se gaseste si se reactiveaza de pe fisa lui si
// din starea goala a listei, fara casuta de la capatul formularului Modifică. Cele
// patru clauze ale cardului, in ordine:
//   (1) un lead dezactivat din formular dispare din vederea Leaduri pe Activi;
//   (2) starea goala de pe Activi ofera butonul spre Inactivi, si leadul apare;
//   (3) pe fisa lui, Reactivează sta in antetul cardului langa Dezactivat, si
//       apasat il intoarce activ;
//   (4) pe o fisa activa acelasi buton spune Dezactivează, iar dus-intors merge.
//
// STAREA SE CITESTE DIN RANDUL STOCAT, NU DE PE ECRAN, prin PostgREST, cu jetonul
// administratorului, ca in leaduri.spec. Ecranul poate arata o stare pe care baza
// nu a primit-o niciodata; randul nu.
//
// DATELE DE TEST NU SE STERG NICIODATA. Fiecare rand poarta prefixul TEST si un
// sufix unic pe rulare, iar fiecare caz isi cauta randul dupa denumirea lui.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

/** Denumire unica pe rulare, ca doua rulari sa nu se gaseasca una pe alta. */
function recordName(tag: string): string {
  return `TEST Reactivare ${tag} ${RUN}`;
}

// ---------------------------------------------------------------------------
// Legatura directa la baza, ca administratorul
// ---------------------------------------------------------------------------

type OwnerRest = { api: APIRequestContext; headers: Record<string, string> };

async function ownerRest(): Promise<OwnerRest> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  expect(url, "P3-66 are nevoie de NEXT_PUBLIC_SUPABASE_URL").not.toBe("");
  expect(anonKey, "P3-66 are nevoie de NEXT_PUBLIC_SUPABASE_ANON_KEY").not.toBe("");

  const api = await request.newContext({ baseURL: url });
  const owner = ownerAccount();
  const token = await api.post("/auth/v1/token?grant_type=password", {
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    data: { email: owner.email, password: owner.password },
  });
  expect(token.ok()).toBe(true);
  const body = (await token.json()) as { access_token: string };

  return {
    api,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${body.access_token}`,
      "Content-Type": "application/json",
    },
  };
}

/** Starea stocata a randului. */
async function storedActive(rest: OwnerRest, id: string): Promise<boolean> {
  const response = await rest.api.get(`/rest/v1/clients?id=eq.${id}&select=active`, {
    headers: rest.headers,
  });
  expect(response.status(), await response.text()).toBe(200);
  const rows = (await response.json()) as { active: boolean }[];
  expect(rows).toHaveLength(1);
  return rows[0]!.active;
}

/** Un rand nou, cu etapa ceruta prin public.set_client_stage, ca in aplicatie. */
async function createRecord(
  rest: OwnerRest,
  opts: { name: string; stage: "cold" | "client"; active: boolean },
): Promise<string> {
  const created = await rest.api.post("/rest/v1/clients", {
    headers: { ...rest.headers, Prefer: "return=representation" },
    data: { name: opts.name, active: opts.active },
  });
  expect(created.status(), await created.text()).toBe(201);
  const [row] = (await created.json()) as { id: string }[];
  const id = row!.id;

  if (opts.stage !== "cold") {
    const moved = await rest.api.post("/rest/v1/rpc/set_client_stage", {
      headers: rest.headers,
      data: { p_client_id: id, p_stage: opts.stage, p_follow_up_date: null },
    });
    expect(moved.status(), await moved.text()).toBe(200);
  }
  return id;
}

// ---------------------------------------------------------------------------
// Ecranul
// ---------------------------------------------------------------------------

function listUrl(params: Record<string, string>): string {
  return `/clienti?${new URLSearchParams(params).toString()}`;
}

function rowFor(page: Page, name: string): Locator {
  return page.locator(`[data-testid="client-row"][data-name="${name}"]`);
}

/** Antetul cardului Date de identificare: blocul care tine si butonul, si indiciul. */
function identityHeader(page: Page): Locator {
  return page
    .locator("div", { has: page.getByRole("heading", { name: "Date de identificare" }) })
    .filter({ has: page.getByTestId("client-active-toggle") })
    .last();
}

test.describe("Reactivarea unui lead sau client", () => {
  test.describe.configure({ timeout: 120_000 });

  test("un lead dezactivat se găsește din starea goală și se reactivează de pe fișa lui", async ({
    page,
  }) => {
    const rest = await ownerRest();
    await signIn(page, ownerAccount());

    const name = recordName("Lead");
    const id = await createRecord(rest, { name, stage: "cold", active: true });

    // (1) DEZACTIVAT PE CALEA DE PANA ACUM, casuta din Modifică, care ramane.
    await page.goto(`/clienti/${id}`);
    await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("client-edit").click();
    await expect(page.getByTestId("client-form")).toBeVisible();
    await page.getByTestId("field-client-active").uncheck();
    await page.getByTestId("client-submit").click();
    await expect(page.getByTestId("client-form")).toHaveCount(0, { timeout: 20_000 });
    await expect.poll(() => storedActive(rest, id), { timeout: 15_000 }).toBe(false);

    await page.goto(listUrl({ vedere: "leaduri", q: name }));
    await expect(page.getByTestId("clients-status")).toHaveValue("active");
    await expect(rowFor(page, name)).toHaveCount(0, { timeout: 15_000 });

    // (2) STAREA GOALA DE PE ACTIVI spune de ce lipseste si duce la Inactivi.
    await expect(page.getByText("Leadurile dezactivate nu apar aici, ci la filtrul Inactivi.")).toBeVisible();
    const showInactive = page.getByTestId("clients-show-inactive");
    await expect(showInactive).toHaveText("Arată inactivii");
    await showInactive.click();
    await expect(page).toHaveURL(/stare=inactive/, { timeout: 15_000 });
    await expect(page.getByTestId("clients-status")).toHaveValue("inactive");
    await expect(rowFor(page, name)).toHaveCount(1, { timeout: 15_000 });
    await expect(rowFor(page, name)).toContainText("Inactiv");

    // (3) PE FISA, Reactivează sta in acelasi antet cu indiciul Dezactivat.
    await rowFor(page, name).getByTestId("client-link").click();
    await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });
    const toggle = page.getByTestId("client-active-toggle");
    await expect(toggle).toHaveText("Reactivează");
    const header = identityHeader(page);
    await expect(header).toContainText("Dezactivat");
    await expect(header.getByTestId("client-active-toggle")).toHaveCount(1);

    await toggle.click();
    await expect(page.getByTestId("client-active-notice")).toContainText("Reactivat", {
      timeout: 20_000,
    });
    await expect.poll(() => storedActive(rest, id), { timeout: 15_000 }).toBe(true);
    await expect(page.getByTestId("client-active-toggle")).toHaveText("Dezactivează", {
      timeout: 20_000,
    });
    await expect(identityHeader(page)).not.toContainText("Dezactivat");

    // Si este inapoi in vederea Leaduri, pe filtrul implicit Activi.
    await page.goto(listUrl({ vedere: "leaduri", q: name }));
    await expect(rowFor(page, name)).toHaveCount(1, { timeout: 15_000 });
    await expect(rowFor(page, name)).toContainText("Activ");
    await expect(page.getByTestId("clients-show-inactive")).toHaveCount(0);
  });

  test("vederea Clienți oferă același buton, iar filtrul Inactivi nu îl oferă", async ({ page }) => {
    const rest = await ownerRest();
    await signIn(page, ownerAccount());

    const name = recordName("Client");
    await createRecord(rest, { name, stage: "client", active: false });

    await page.goto(listUrl({ vedere: "clienti", q: name }));
    await expect(rowFor(page, name)).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText("Clienții dezactivați nu apar aici, ci la filtrul Inactivi.")).toBeVisible();
    await page.getByTestId("clients-show-inactive").click();
    await expect(page).toHaveURL(/stare=inactive/, { timeout: 15_000 });
    await expect(page).toHaveURL(/vedere=clienti/);
    await expect(rowFor(page, name)).toHaveCount(1, { timeout: 15_000 });

    // Pe Inactivi, o lista goala nu trimite nicaieri: acolo nu lipseste nimeni ascuns.
    await page.goto(listUrl({ vedere: "clienti", stare: "inactive", q: `${name} inexistent` }));
    await expect(page.getByText("Niciun client pentru filtrele alese")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("clients-show-inactive")).toHaveCount(0);
  });

  test("pe o fișă activă butonul spune Dezactivează, iar dus-întors funcționează", async ({
    page,
  }) => {
    const rest = await ownerRest();
    await signIn(page, ownerAccount());

    const name = recordName("Dus-intors");
    const id = await createRecord(rest, { name, stage: "cold", active: true });

    await page.goto(`/clienti/${id}`);
    await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });
    const toggle = page.getByTestId("client-active-toggle");
    await expect(toggle).toHaveText("Dezactivează");
    await expect(identityHeader(page)).not.toContainText("Dezactivat");

    // (4) Dus: dezactivat.
    await toggle.click();
    await expect(page.getByTestId("client-active-notice")).toContainText("Dezactivat", {
      timeout: 20_000,
    });
    await expect.poll(() => storedActive(rest, id), { timeout: 15_000 }).toBe(false);
    await expect(toggle).toHaveText("Reactivează", { timeout: 20_000 });
    await expect(identityHeader(page)).toContainText("Dezactivat");

    // Intors: reactivat, de pe acelasi buton.
    await toggle.click();
    await expect(page.getByTestId("client-active-notice")).toContainText("Reactivat", {
      timeout: 20_000,
    });
    await expect.poll(() => storedActive(rest, id), { timeout: 15_000 }).toBe(true);
    await expect(toggle).toHaveText("Dezactivează", { timeout: 20_000 });
  });
});
