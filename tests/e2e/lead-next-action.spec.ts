import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// lead-next-action.spec - linia de acceptanta a cardului P3-89, goal G44.
//
// Proprietarul, 2026-09-22: "Next step on every lead and client. [...] Shown and
// editable on the lead page and the client page, right under the stage, as
// 'Următorul pas' with a date box and a text box; the Leaduri list shows it and
// sorts by it when set [...] when a lead is in De reluat the two dates are the same
// box: setting one sets both." Numele testului cerut: "set a next step, see it on
// the list, clear it."
//
// SE CITESTE DIN RANDUL STOCAT, NU DE PE ECRAN, prin PostgREST, cu jetonul
// administratorului, ca in lead-follow-up-date-cleared.spec. Scrierile se fac din
// formularul Modifică de pe fisa, acolo unde le face omul; pregatirea randurilor
// trece direct prin PostgREST.
//
// DATELE DE TEST NU SE STERG NICIODATA. Fiecare rand poarta prefixul TEST si un
// sufix unic pe rulare.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

type Stage = "cold" | "nurture" | "follow_up" | "quoted" | "client";

function leadName(tag: string): string {
  return `TEST G44 ${tag} ${RUN}`;
}

// ---------------------------------------------------------------------------
// Legatura directa la baza, ca administratorul
// ---------------------------------------------------------------------------

type OwnerRest = { api: APIRequestContext; headers: Record<string, string> };

async function ownerRest(): Promise<OwnerRest> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  expect(url, "P3-89 are nevoie de NEXT_PUBLIC_SUPABASE_URL").not.toBe("");
  expect(anonKey, "P3-89 are nevoie de NEXT_PUBLIC_SUPABASE_ANON_KEY").not.toBe("");

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

type Stored = {
  stage: Stage;
  follow_up_date: string | null;
  next_action_at: string | null;
  next_action: string | null;
  phone: string | null;
};

async function stored(rest: OwnerRest, id: string): Promise<Stored> {
  const response = await rest.api.get(
    `/rest/v1/clients?id=eq.${id}&select=stage,follow_up_date,next_action_at,next_action,phone`,
    { headers: rest.headers },
  );
  expect(response.status(), await response.text()).toBe(200);
  const rows = (await response.json()) as Stored[];
  expect(rows).toHaveLength(1);
  return rows[0]!;
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
    data: { name, active: true, phone: "069 000 440" },
  });
  expect(created.status(), await created.text()).toBe(201);
  const id = ((await created.json()) as { id: string }[])[0]!.id;
  if (stage !== "cold" || date) await setStage(rest, id, stage, date);
  return id;
}

/** Pregatirea unui pas deja scris, direct pe coloane: nu este ce se testeaza. */
async function seedNextAction(rest: OwnerRest, id: string, at: string | null, text: string | null) {
  const patched = await rest.api.patch(`/rest/v1/clients?id=eq.${id}`, {
    headers: rest.headers,
    data: { next_action_at: at, next_action: text },
  });
  expect(patched.status(), await patched.text()).toBe(204);
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

async function submit(page: Page) {
  await page.getByTestId("client-submit").click();
  await expect(page.getByTestId("client-form")).toHaveCount(0, { timeout: 20_000 });
}

function leaduriRow(page: Page, name: string) {
  return page.locator(`[data-testid="client-row"][data-name="${name}"]`);
}

async function openLeaduri(page: Page, q: string) {
  await page.goto(`/clienti?${new URLSearchParams({ vedere: "leaduri", q }).toString()}`);
  await expect(page.locator('[data-testid="client-row"]').first()).toBeVisible({ timeout: 20_000 });
}

// ---------------------------------------------------------------------------

test.describe("Leaduri, următorul pas (P3-89)", () => {
  test.describe.configure({ timeout: 150_000 });

  test("G44: un pas scris din Modifică, la o etapă care nu este De reluat, se stochează, se vede pe fișă și nu atinge data de reluare", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const rest = await ownerRest();
    // Un lead la În cultivare care poarta deja o data de reluare, pusa la o etapa
    // care nu este De reluat: ea trebuie sa ramana exact cum era.
    const kept = chisinauDay(30);
    const id = await createLead(rest, leadName("Scris"), "nurture", kept);
    const before = await stored(rest, id);
    expect(before).toMatchObject({ stage: "nurture", follow_up_date: kept, next_action_at: null, next_action: null });

    const when = chisinauDay(4);
    await openEdit(page, id);
    // CHIAR SUB ETAPA: blocul urmatorului pas urmeaza campul de etapa.
    const stageBox = await page.getByTestId("field-client-stage").boundingBox();
    const nextBox = await page.getByTestId("client-next-action-fields").boundingBox();
    expect(stageBox && nextBox && nextBox.y > stageBox.y).toBe(true);
    await page.getByTestId("field-client-next-action-at").fill(when);
    await page.getByTestId("field-client-next-action").fill("trimit oferta");
    await submit(page);

    await expect
      .poll(async () => stored(rest, id))
      .toEqual({ ...before, next_action_at: when, next_action: "trimit oferta" });

    await page.reload();
    await expect(page.getByTestId("client-next-action")).toContainText(onScreen(when));
    await expect(page.getByTestId("client-next-action")).toContainText("trimit oferta");

    await rest.api.dispose();
  });

  test("G44: lista Leaduri arată pasul și pune pasul mai devreme înaintea celui mai târziu și a celui fără pas", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const rest = await ownerRest();
    const tag = `TEST G44 Ordine ${RUN}`;
    // Numele sunt in ordinea inversa a datelor, ca ordinea dupa nume sa nu poata
    // trece drept ordinea dupa pas.
    const late = await createLead(rest, `${tag} A tarziu`, "quoted", null);
    const early = await createLead(rest, `${tag} B devreme`, "nurture", null);
    await createLead(rest, `${tag} 0 fara pas`, "cold", null);
    const lateDay = chisinauDay(15);
    const earlyDay = chisinauDay(3);
    await seedNextAction(rest, late, lateDay, "vizită pe șantier");
    await seedNextAction(rest, early, earlyDay, "sun");

    await openLeaduri(page, tag);
    const names = await page.locator('[data-testid="client-row"]').evaluateAll((rows) =>
      rows.map((r) => r.getAttribute("data-name")),
    );
    expect(names).toEqual([`${tag} B devreme`, `${tag} A tarziu`, `${tag} 0 fara pas`]);

    const headers = (await page.locator("thead th").allTextContents()).map((t) => t.trim());
    expect(headers).toContain("Următorul pas");
    await expect(leaduriRow(page, `${tag} B devreme`).getByTestId("row-next-action")).toHaveText(
      `${onScreen(earlyDay)}, sun`,
    );
    await expect(leaduriRow(page, `${tag} A tarziu`).getByTestId("row-next-action")).toHaveText(
      `${onScreen(lateDay)}, vizită pe șantier`,
    );
    await expect(leaduriRow(page, `${tag} 0 fara pas`).getByTestId("row-next-action")).toHaveText("-");

    await rest.api.dispose();
  });

  test("G44: la De reluat o singură căsuță de dată pune aceeași dată în data de reluare și în următorul pas", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const rest = await ownerRest();
    const id = await createLead(rest, leadName("Reluat"), "follow_up", chisinauDay(2));

    const fresh = chisinauDay(9);
    await openEdit(page, id);
    // O SINGURA CASUTA: la De reluat nu exista a doua casuta de data.
    await expect(page.getByTestId("field-client-follow-up")).toBeVisible();
    await expect(page.getByTestId("field-client-next-action-at")).toHaveCount(0);
    await expect(page.getByTestId("field-client-next-action")).toBeVisible();
    await page.getByTestId("field-client-follow-up").fill(fresh);
    await page.getByTestId("field-client-next-action").fill("sun pentru ofertă");
    await submit(page);

    await expect.poll(async () => stored(rest, id)).toMatchObject({
      stage: "follow_up",
      follow_up_date: fresh,
      next_action_at: fresh,
      next_action: "sun pentru ofertă",
    });

    await rest.api.dispose();
  });

  test("G44: golirea datei și a textului șterge pasul, iar leadul rămâne în listă", async ({ page }) => {
    await signIn(page, ownerAccount());
    const rest = await ownerRest();
    const name = leadName("Golit");
    const id = await createLead(rest, name, "quoted", null);
    const when = chisinauDay(6);
    await seedNextAction(rest, id, when, "trimit oferta");

    await openLeaduri(page, name);
    await expect(leaduriRow(page, name).getByTestId("row-next-action")).toHaveText(
      `${onScreen(when)}, trimit oferta`,
    );

    await openEdit(page, id);
    await expect(page.getByTestId("field-client-next-action-at")).toHaveValue(onScreen(when));
    await expect(page.getByTestId("field-client-next-action")).toHaveValue("trimit oferta");
    await page.getByTestId("field-client-next-action-at").fill("");
    await page.getByTestId("field-client-next-action").fill("");
    await submit(page);

    await expect.poll(async () => stored(rest, id)).toMatchObject({
      stage: "quoted",
      next_action_at: null,
      next_action: null,
    });

    await openLeaduri(page, name);
    await expect(leaduriRow(page, name)).toHaveCount(1);
    await expect(leaduriRow(page, name).getByTestId("row-next-action")).toHaveText("-");

    await rest.api.dispose();
  });

  test("G44: o salvare care schimbă numai telefonul lasă pasul exact cum era", async ({ page }) => {
    await signIn(page, ownerAccount());
    const rest = await ownerRest();
    const id = await createLead(rest, leadName("Telefon"), "nurture", null);
    const when = chisinauDay(11);
    await seedNextAction(rest, id, when, "aștept schița");
    const before = await stored(rest, id);

    await openEdit(page, id);
    await page.getByTestId("field-client-phone").fill("069 000 441");
    await submit(page);

    await expect.poll(async () => stored(rest, id)).toEqual({ ...before, phone: "069 000 441" });

    await rest.api.dispose();
  });

  test("G44: pe telefon, la 390 px, data și textul pasului stau una sub alta", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, ownerAccount());
    const rest = await ownerRest();
    const id = await createLead(rest, leadName("Telefon 390"), "nurture", null);

    await openEdit(page, id);
    const date = await page.getByTestId("field-client-next-action-at").boundingBox();
    const text = await page.getByTestId("field-client-next-action").boundingBox();
    expect(date && text).toBeTruthy();
    expect(text!.y).toBeGreaterThan(date!.y + date!.height - 1);
    expect(date!.x + date!.width).toBeLessThanOrEqual(390);
    expect(text!.x + text!.width).toBeLessThanOrEqual(390);

    await rest.api.dispose();
  });
});
