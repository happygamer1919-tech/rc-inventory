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
//
// P3-92, constatarile F16 si F3 ale maturarii de erori din 2026-09-22.
//
// F16 ERA O GAURA DE ACOPERIRE: `stored` citea numai `stage` si `follow_up_date`,
// deci niciun caz de aici nu se uita la a doua data a leadului, `next_action_at`.
// Acum le citeste pe amandoua si fiecare caz de mai jos o afirma. Nicio afirmatie
// veche nu a fost slabita sau scoasa: s-a largit numai ce se citeste.
//
// F3 ERA CHIAR EROAREA PE CARE GAURA A LASAT-O SA TREACA: plecarea din De reluat
// stergea `follow_up_date` si lasa `next_action_at` in urma, iar leadul se intorcea
// pe /azi, intarziat si rosu. Cele trei cazuri G48 de la sfarsitul fisierului sunt
// paza lui, si primul trece prin formularul Lead nou tocmai fiindca numai acolo se
// scrie oglinda: un lead facut prin REST nu o are niciodata.

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

// P3-92, F16. A TREIA COLOANA SE CITESTE MEREU. Cele doua date ale unui lead sunt
// o singura casuta la De reluat, deci un caz care se uita numai la una dintre ele
// nu poate vedea cand se despart.
type Stored = { stage: Stage; follow_up_date: string | null; next_action_at: string | null };

async function stored(rest: OwnerRest, id: string): Promise<Stored> {
  const response = await rest.api.get(
    `/rest/v1/clients?id=eq.${id}&select=stage,follow_up_date,next_action_at`,
    { headers: rest.headers },
  );
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

/** P3-92, F3. Un lead nou DIN FORMULARUL Lead nou, si nu prin REST.
 *
 *  NUMAI ASA SE SCRIE OGLINDA. La De reluat formularul are o singura casuta de
 *  data, iar actiunea scrie acea data si in `next_action_at` ("setting one sets
 *  both", P3-89). Un lead facut prin REST nu trece pe acolo si nu o are, ceea ce
 *  este exact motivul pentru care cazurile de mai sus nu au putut vedea F3. */
async function createLeadFromForm(page: Page, name: string, date: string): Promise<string> {
  await page.goto(`/clienti?${new URLSearchParams({ vedere: "leaduri" }).toString()}`);
  await page.getByTestId("leaduri-new").click();
  await expect(page.getByTestId("leaduri-form")).toBeVisible({ timeout: 25_000 });
  await page.getByTestId("field-leaduri-name").fill(name);
  await page.getByTestId("field-leaduri-stage").selectOption("follow_up");
  await page.getByTestId("field-leaduri-follow-up").fill(onScreen(date));
  await page.getByTestId("leaduri-submit").click();
  await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });
  const match = /\/clienti\/([0-9a-f-]{36})/.exec(page.url());
  expect(match, `nu s-a ajuns pe fisa leadului: ${page.url()}`).not.toBeNull();
  return match![1]!;
}

/** Scrie direct `next_action_at`, ca un pas pus anume la o alta etapa. */
async function setNextActionAt(rest: OwnerRest, id: string, date: string | null) {
  const patched = await rest.api.patch(`/rest/v1/clients?id=eq.${id}`, {
    headers: rest.headers,
    data: { next_action_at: date },
  });
  expect(patched.status(), await patched.text()).toBeLessThan(300);
}

function aziRow(page: Page, id: string) {
  return page.locator(`[data-testid="azi-row"][data-id="${id}"]`);
}

async function openAzi(page: Page) {
  await page.goto("/azi");
  await expect(page.getByRole("heading", { level: 1, name: "Azi", exact: true })).toBeVisible({
    timeout: 25_000,
  });
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
    await expect.poll(async () => stored(rest, id)).toEqual({ stage: "nurture", follow_up_date: null, next_action_at: null });

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
    await expect.poll(async () => stored(rest, id)).toEqual({ stage: "nurture", follow_up_date: null, next_action_at: null });

    await openEdit(page, id);
    await page.getByTestId("field-client-stage").selectOption("follow_up");
    const date = page.getByTestId("field-client-follow-up");
    await expect(date).toBeVisible();
    await expect(date).toHaveValue("");
    await page.getByTestId("client-submit").click();
    await expect(page.getByTestId("form-error")).toHaveText(FOLLOW_UP_REQUIRED, { timeout: 20_000 });
    expect(await stored(rest, id)).toEqual({ stage: "nurture", follow_up_date: null, next_action_at: null });

    await rest.api.dispose();
  });

  test("G43: plecarea din De reluat în Ofertat cu o dată nouă, dată în aceeași salvare, păstrează data nouă", async () => {
    const rest = await ownerRest();
    const id = await createLead(rest, leadName("Data noua"), "follow_up", chisinauDay(-5));

    // Prin functie: formularul Modifică nu arata campul de data la Ofertat.
    const fresh = chisinauDay(20);
    await setStage(rest, id, "quoted", fresh);
    expect(await stored(rest, id)).toEqual({ stage: "quoted", follow_up_date: fresh, next_action_at: null });

    await rest.api.dispose();
  });

  test("G43: un lead fără dată, mutat între două etape care nu sunt De reluat, rămâne fără dată", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const rest = await ownerRest();
    const id = await createLead(rest, leadName("Fara data"), "cold", null);

    await saveStage(page, id, "nurture");
    await expect.poll(async () => stored(rest, id)).toEqual({ stage: "nurture", follow_up_date: null, next_action_at: null });
    await saveStage(page, id, "quoted");
    await expect.poll(async () => stored(rest, id)).toEqual({ stage: "quoted", follow_up_date: null, next_action_at: null });

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
    expect(await stored(rest, id)).toEqual({ stage: "follow_up", follow_up_date: kept, next_action_at: null });

    // Si din formular, salvat fara nicio schimbare de etapa sau de data.
    //
    // P3-92. AICI OGLINDA SE SCRIE, si asta nu este o abatere, este chiar regula
    // lui P3-89: formularul trimite etapa De reluat cu data ei, iar
    // validateNextAction o scrie si in next_action_at ("setting one sets both").
    // Leadul a fost facut prin REST, deci pana la aceasta salvare next_action_at
    // era gol; dupa ea poarta aceeasi zi. Afirmatia pe etapa si pe data de reluare
    // este neatinsa, cuvant cu cuvant, iar cea noua pune un capat exact, nu il
    // slabeste.
    await openEdit(page, id);
    await page.getByTestId("client-submit").click();
    await expect(page.getByTestId("client-form")).toHaveCount(0, { timeout: 20_000 });
    await expect.poll(async () => stored(rest, id)).toEqual({ stage: "follow_up", follow_up_date: kept, next_action_at: kept });

    expect(await historyCount(rest, id)).toBe(before);

    await rest.api.dispose();
  });

  // -------------------------------------------------------------------------
  // P3-92, constatarea F3: cele doua date pleaca impreuna
  // -------------------------------------------------------------------------

  test("G48 F3: un lead facut la De reluat din formular, mutat fara dată nouă, pierde ambele date și nu mai apare pe Azi", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const rest = await ownerRest();
    const name = leadName("F3 oglinda");
    const past = chisinauDay(-4);
    const id = await createLeadFromForm(page, name, past);

    // PREMISA, si ea este jumatate din test: formularul chiar a scris oglinda,
    // iar leadul chiar este pe Azi, intarziat. Fara ea, afirmatiile de dupa mutare
    // nu ar deosebi o stergere de un ecran care nu l-a aratat niciodata.
    await expect
      .poll(async () => stored(rest, id))
      .toEqual({ stage: "follow_up", follow_up_date: past, next_action_at: past });
    await openAzi(page);
    await expect(aziRow(page, id)).toHaveCount(1);
    await expect(aziRow(page, id).getByTestId("azi-overdue")).toHaveText("Întârziat");

    // MUTAREA, din formularul Modifică, fara nicio data tastata.
    await saveStage(page, id, "nurture");
    await expect
      .poll(async () => stored(rest, id))
      .toEqual({ stage: "nurture", follow_up_date: null, next_action_at: null });

    await openAzi(page);
    await expect(aziRow(page, id)).toHaveCount(0);

    await rest.api.dispose();
  });

  test("G48 F3: un pas pus anume la o altă etapă rămâne neatins la o mutare între două etape care nu sunt De reluat", async () => {
    const rest = await ownerRest();
    const own = chisinauDay(30);
    const id = await createLead(rest, leadName("F3 pas propriu"), "nurture", null);
    await setNextActionAt(rest, id, own);

    await setStage(rest, id, "quoted", null);
    expect(await stored(rest, id)).toEqual({
      stage: "quoted",
      follow_up_date: null,
      next_action_at: own,
    });

    await rest.api.dispose();
  });

  test("G48 F3: plecarea din De reluat prin funcție șterge oglinda, dar lasă un pas pus pe altă zi", async () => {
    const rest = await ownerRest();
    const past = chisinauDay(-6);

    // ACEEASI PLECARE, DAR PRIN FUNCTIE SI NU PRIN FORMULAR. Regula sta in
    // set_client_stage, deci orice alt apelant o primeste fara sa o stie: un test
    // care cheama RPC-ul direct, un ecran de actiuni in masa de maine.
    const mirror = await createLead(rest, leadName("F3 rpc oglinda"), "follow_up", past);
    await setNextActionAt(rest, mirror, past);
    await setStage(rest, mirror, "quoted", null);
    expect(await stored(rest, mirror)).toEqual({
      stage: "quoted",
      follow_up_date: null,
      next_action_at: null,
    });

    // SI PAZA: un pas pus pe alta zi nu este oglinda si nu se sterge cu ea.
    const other = chisinauDay(45);
    const kept = await createLead(rest, leadName("F3 rpc pas propriu"), "follow_up", past);
    await setNextActionAt(rest, kept, other);
    await setStage(rest, kept, "quoted", null);
    expect(await stored(rest, kept)).toEqual({
      stage: "quoted",
      follow_up_date: null,
      next_action_at: other,
    });

    await rest.api.dispose();
  });
});
