import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// lead-follow-up-date-cleared.spec - linia de acceptanta a cardului P3-88, goal G43.
//
// Proprietarul, 2026-09-22: "when you move a lead from De reluat to În cultivare or
// Ofertat, the date is not cleared and it says it is late." Din migratia 0057,
// plecarea din De reluat fara o data noua sterge data, iar lista marcheaza
// Întârziat numai la De reluat.
//
// SE CITESTE DIN RANDUL STOCAT, NU DE PE ECRAN, prin PostgREST, cu jetonul
// administratorului, ca in clients.spec si leaduri.spec. Mutarile se fac din
// formularul Modifică de pe fisa, acolo unde ecranul le poate face; cazul (3) nu
// poate, fiindca formularul arata campul de data numai la De reluat, deci trece
// prin aceeasi functie pe care o cheama aplicatia.
//
// DATELE DE TEST NU SE STERG NICIODATA. Fiecare rand poarta prefixul TEST si un
// sufix unic pe rulare.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

type Stage = "cold" | "nurture" | "follow_up" | "quoted" | "client";

const FOLLOW_UP_REQUIRED = "Pentru etapa De reluat trebuie completată data de reluare.";

function leadName(tag: string): string {
  return `TEST G43 ${tag} ${RUN}`;
}

// ---------------------------------------------------------------------------
// Legatura directa la baza, ca administratorul
// ---------------------------------------------------------------------------

type OwnerRest = { api: APIRequestContext; headers: Record<string, string> };

async function ownerRest(): Promise<OwnerRest> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  expect(url, "P3-88 are nevoie de NEXT_PUBLIC_SUPABASE_URL").not.toBe("");
  expect(anonKey, "P3-88 are nevoie de NEXT_PUBLIC_SUPABASE_ANON_KEY").not.toBe("");

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

type Stored = { stage: Stage; follow_up_date: string | null };

async function stored(rest: OwnerRest, id: string): Promise<Stored> {
  const response = await rest.api.get(`/rest/v1/clients?id=eq.${id}&select=stage,follow_up_date`, {
    headers: rest.headers,
  });
  expect(response.status(), await response.text()).toBe(200);
  const rows = (await response.json()) as Stored[];
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

async function historyCount(rest: OwnerRest, id: string): Promise<number> {
  const response = await rest.api.get(
    `/rest/v1/status_history?entity_type=eq.client&entity_id=eq.${id}&select=id`,
    { headers: rest.headers },
  );
  expect(response.status(), await response.text()).toBe(200);
  return ((await response.json()) as unknown[]).length;
}

/** public.set_client_stage, cu trei parametri, exact cum o cheama aplicatia. */
async function setStage(rest: OwnerRest, id: string, stage: Stage, date: string | null) {
  const moved = await rest.api.post("/rest/v1/rpc/set_client_stage", {
    headers: rest.headers,
    data: { p_client_id: id, p_stage: stage, p_follow_up_date: date },
  });
  expect(moved.status(), await moved.text()).toBe(200);
}

/** Un lead nou, dus la etapa ceruta prin functie, cu randul lui de istoric. */
async function createLead(
  rest: OwnerRest,
  name: string,
  stage: Stage,
  date: string | null,
): Promise<string> {
  const created = await rest.api.post("/rest/v1/clients", {
    headers: { ...rest.headers, Prefer: "return=representation" },
    data: { name, active: true },
  });
  expect(created.status(), await created.text()).toBe(201);
  const id = ((await created.json()) as { id: string }[])[0]!.id;
  if (stage !== "cold" || date) await setStage(rest, id, stage, date);
  return id;
}

/** Ziua de azi IN CHISINAU, `YYYY-MM-DD`, deplasata cu un numar de zile. */
function chisinauDay(offsetDays: number): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Chisinau",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + offsetDays)).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` cum il arata ecranul, `DD.MM.YYYY`. */
function onScreen(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

// ---------------------------------------------------------------------------
// Ecranul
// ---------------------------------------------------------------------------

async function openEdit(page: Page, id: string) {
  await page.goto(`/clienti/${id}`);
  await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });
  await page.getByTestId("client-edit").click();
  await expect(page.getByTestId("client-form")).toBeVisible();
}

/** Muta etapa din formularul Modifică, fara sa atinga data. */
async function saveStage(page: Page, id: string, stage: Stage) {
  await openEdit(page, id);
  await page.getByTestId("field-client-stage").selectOption(stage);
  await page.getByTestId("client-submit").click();
  await expect(page.getByTestId("client-form")).toHaveCount(0, { timeout: 20_000 });
}

function leaduriRow(page: Page, name: string) {
  return page.locator(`[data-testid="client-row"][data-name="${name}"]`);
}

async function openLeaduri(page: Page, name: string) {
  await page.goto(`/clienti?${new URLSearchParams({ vedere: "leaduri", q: name }).toString()}`);
  await expect(leaduriRow(page, name)).toHaveCount(1, { timeout: 20_000 });
}

// ---------------------------------------------------------------------------

test.describe("Leaduri, data de reluare la plecarea din De reluat (P3-88)", () => {
  test.describe.configure({ timeout: 120_000 });

  test("G43: plecarea din De reluat în În cultivare, fără dată nouă, șterge data și scoate Întârziat", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const rest = await ownerRest();
    const name = leadName("Pleaca");
    const past = chisinauDay(-5);
    const id = await createLead(rest, name, "follow_up", past);

    // PREMISA: inainte de mutare randul este intarziat, deci afirmatia de dupa
    // mutare deosebeste o data stearsa de un ecran care nu arata niciodata eticheta.
    await openLeaduri(page, name);
    await expect(leaduriRow(page, name).getByTestId("row-overdue")).toHaveCount(1);
    await expect(leaduriRow(page, name)).toContainText(onScreen(past));

    // DIN FORMULAR, FARA DATA TASTATA.
    await saveStage(page, id, "nurture");
    await expect.poll(async () => stored(rest, id)).toEqual({ stage: "nurture", follow_up_date: null });

    await openLeaduri(page, name);
    await expect(leaduriRow(page, name).getByTestId("row-overdue")).toHaveCount(0);
    await expect(leaduriRow(page, name)).not.toContainText(onScreen(past));

    await rest.api.dispose();
  });

  test("G43: același lead, întors la De reluat fără dată, este refuzat în română și rândul rămâne neschimbat", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const rest = await ownerRest();
    const id = await createLead(rest, leadName("Intoarcere"), "follow_up", chisinauDay(-5));

    // Plecarea din De reluat, din formular, ca in cazul de mai sus.
    await saveStage(page, id, "nurture");
    await expect.poll(async () => stored(rest, id)).toEqual({ stage: "nurture", follow_up_date: null });

    await openEdit(page, id);
    await page.getByTestId("field-client-stage").selectOption("follow_up");
    const date = page.getByTestId("field-client-follow-up");
    await expect(date).toBeVisible();
    await expect(date).toHaveValue("");
    await page.getByTestId("client-submit").click();
    await expect(page.getByTestId("form-error")).toHaveText(FOLLOW_UP_REQUIRED, { timeout: 20_000 });
    expect(await stored(rest, id)).toEqual({ stage: "nurture", follow_up_date: null });

    await rest.api.dispose();
  });

  test("G43: plecarea din De reluat în Ofertat cu o dată nouă, dată în aceeași salvare, păstrează data nouă", async () => {
    const rest = await ownerRest();
    const id = await createLead(rest, leadName("Data noua"), "follow_up", chisinauDay(-5));

    // Prin functie: formularul Modifică nu arata campul de data la Ofertat.
    const fresh = chisinauDay(20);
    await setStage(rest, id, "quoted", fresh);
    expect(await stored(rest, id)).toEqual({ stage: "quoted", follow_up_date: fresh });

    await rest.api.dispose();
  });

  test("G43: un lead fără dată, mutat între două etape care nu sunt De reluat, rămâne fără dată", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const rest = await ownerRest();
    const id = await createLead(rest, leadName("Fara data"), "cold", null);

    await saveStage(page, id, "nurture");
    await expect.poll(async () => stored(rest, id)).toEqual({ stage: "nurture", follow_up_date: null });
    await saveStage(page, id, "quoted");
    await expect.poll(async () => stored(rest, id)).toEqual({ stage: "quoted", follow_up_date: null });

    await rest.api.dispose();
  });

  test("G43: De reluat salvat din nou la De reluat, fără dată nouă, păstrează data și nu scrie istoric", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const rest = await ownerRest();
    const kept = chisinauDay(7);
    const id = await createLead(rest, leadName("Aceeasi etapa"), "follow_up", kept);
    const before = await historyCount(rest, id);

    // Prin functie, cu data null: aceeasi etapa nu este o plecare.
    await setStage(rest, id, "follow_up", null);
    expect(await stored(rest, id)).toEqual({ stage: "follow_up", follow_up_date: kept });

    // Si din formular, salvat fara nicio schimbare de etapa sau de data.
    await openEdit(page, id);
    await page.getByTestId("client-submit").click();
    await expect(page.getByTestId("client-form")).toHaveCount(0, { timeout: 20_000 });
    await expect.poll(async () => stored(rest, id)).toEqual({ stage: "follow_up", follow_up_date: kept });

    expect(await historyCount(rest, id)).toBe(before);

    await rest.api.dispose();
  });
});
