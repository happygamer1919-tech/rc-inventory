import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";
import { managerAccount, ownerAccount, type TestAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// azi-screen.spec - linia de acceptanta a cardului P3-91, goal G46.
//
// Proprietarul, 2026-09-22: "The 'Azi' screen. New sidebar entry 'Azi' (first in
// the CRM group) and route /azi: one list of leads and clients whose next step
// (G44) or De reluat date is today or overdue, overdue first in red, each row with
// the name, the phone as a tap-to-call link, the next-step text, and one button
// 'Am sunat' that opens the note box (G45) prefilled with the date and clears the
// next step when saved. Empty state: 'Nimic de făcut azi.' Optional filter by
// Responsabil. Named e2e test: a lead due today appears, 'Am sunat' plus a note
// removes it from the list."
//
// LISTA ESTE A INTREGII BAZE DE TEST, nu a acestui fisier: alte spec-uri lasa si
// ele leaduri datorate. Fiecare caz isi cauta deci randurile dupa id, niciodata
// dupa numarul total de randuri sau dupa pozitia absoluta.
//
// PREGATIREA SI CITIREA RANDURILOR STOCATE trec direct prin PostgREST, cu jetonul
// contului; Am sunat se apasa pe ecran, acolo unde il apasa omul.
//
// DATELE DE TEST NU SE STERG NICIODATA. Fiecare rand poarta prefixul TEST si un
// sufix unic pe rulare.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

type Stage = "cold" | "nurture" | "follow_up" | "quoted" | "client";

function leadName(tag: string): string {
  return `TEST G46 ${tag} ${RUN}`;
}

// ---------------------------------------------------------------------------
// Legatura directa la baza, ca un cont anume
// ---------------------------------------------------------------------------

type Rest = { api: APIRequestContext; headers: Record<string, string>; userId: string };

async function restAs(account: TestAccount): Promise<Rest> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  expect(url, "P3-91 are nevoie de NEXT_PUBLIC_SUPABASE_URL").not.toBe("");
  expect(anonKey, "P3-91 are nevoie de NEXT_PUBLIC_SUPABASE_ANON_KEY").not.toBe("");

  const api = await request.newContext({ baseURL: url });
  const token = await api.post("/auth/v1/token?grant_type=password", {
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    data: { email: account.email, password: account.password },
  });
  expect(token.ok()).toBe(true);
  const body = (await token.json()) as { access_token: string; user: { id: string } };

  return {
    api,
    userId: body.user.id,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${body.access_token}`,
      "Content-Type": "application/json",
    },
  };
}

/** public.set_client_stage, cu trei parametri, exact cum o cheama aplicatia. */
async function setStage(rest: Rest, id: string, stage: Stage, date: string | null) {
  const moved = await rest.api.post("/rest/v1/rpc/set_client_stage", {
    headers: rest.headers,
    data: { p_client_id: id, p_stage: stage, p_follow_up_date: date },
  });
  expect(moved.status(), await moved.text()).toBe(200);
}

/** Un lead nou, dus la etapa ceruta prin functie, cu randul lui de istoric. */
async function createLead(
  rest: Rest,
  name: string,
  stage: Stage,
  date: string | null,
  phone: string | null = "069 000 460",
): Promise<string> {
  const created = await rest.api.post("/rest/v1/clients", {
    headers: { ...rest.headers, Prefer: "return=representation" },
    data: { name, active: true, phone },
  });
  expect(created.status(), await created.text()).toBe(201);
  const id = ((await created.json()) as { id: string }[])[0]!.id;
  if (stage !== "cold" || date) await setStage(rest, id, stage, date);
  return id;
}

/** Pregatirea unui rand, direct pe coloane: nu este ce se testeaza. */
async function patchClient(rest: Rest, id: string, data: Record<string, unknown>) {
  const patched = await rest.api.patch(`/rest/v1/clients?id=eq.${id}`, {
    headers: rest.headers,
    data,
  });
  expect(patched.status(), await patched.text()).toBe(204);
}

type Stored = {
  follow_up_date: string | null;
  next_action_at: string | null;
  next_action: string | null;
};

async function stored(rest: Rest, id: string): Promise<Stored> {
  const response = await rest.api.get(
    `/rest/v1/clients?id=eq.${id}&select=follow_up_date,next_action_at,next_action`,
    { headers: rest.headers },
  );
  expect(response.status(), await response.text()).toBe(200);
  const rows = (await response.json()) as Stored[];
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

async function storedNotes(rest: Rest, clientId: string): Promise<{ body: string; created_by: string | null }[]> {
  const response = await rest.api.get(
    `/rest/v1/client_notes?client_id=eq.${clientId}&select=body,created_by&order=created_at.desc`,
    { headers: rest.headers },
  );
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as { body: string; created_by: string | null }[];
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

async function openAzi(page: Page, path = "/azi") {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1, name: "Azi", exact: true })).toBeVisible({
    timeout: 25_000,
  });
}

function row(page: Page, id: string) {
  return page.locator(`[data-testid="azi-row"][data-id="${id}"]`);
}

async function rowIds(page: Page): Promise<string[]> {
  return page.getByTestId("azi-row").evaluateAll((els) => els.map((e) => e.getAttribute("data-id") ?? ""));
}

/** Am sunat pe rand, textul pornit asa cum este, Salvează. */
async function called(page: Page, id: string) {
  await row(page, id).getByTestId("azi-called").click();
  const form = page.locator(`[data-testid="azi-note"][data-id="${id}"]`);
  await expect(form.getByTestId("note-body")).toHaveValue("Am sunat");
  await form.getByTestId("note-save").click();
  await expect(form).toHaveCount(0, { timeout: 20_000 });
}

// ---------------------------------------------------------------------------

test.describe("Ecranul Azi (P3-91)", () => {
  test.describe.configure({ timeout: 150_000 });

  test("G46: un lead cu pasul de azi apare pe Azi, cu numele, pasul și telefonul ca legătură tel:, iar Azi stă în meniu înaintea lui CRM", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const rest = await restAs(ownerAccount());
    const name = leadName("Azi");
    const id = await createLead(rest, name, "nurture", null, "069 000 461");
    await patchClient(rest, id, { next_action_at: chisinauDay(0), next_action: "trimit oferta" });

    // MENIUL: Azi, apoi CRM, in acelasi grup.
    const links = page.locator("aside nav a");
    await expect(links.first()).toBeVisible({ timeout: 20_000 });
    const labels = (await links.allInnerTexts()).map((t) => t.trim());
    expect(labels.indexOf("Azi"), `meniul: ${labels.join(", ")}`).toBeGreaterThanOrEqual(0);
    expect(labels[labels.indexOf("Azi") + 1]).toBe("CRM");
    await links.filter({ hasText: /^Azi$/ }).click();
    await expect(page).toHaveURL(/\/azi$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Azi", exact: true })).toBeVisible({
      timeout: 25_000,
    });

    const r = row(page, id);
    await expect(r).toHaveCount(1, { timeout: 20_000 });
    await expect(r.getByTestId("azi-name")).toHaveText(name);
    await expect(r.getByTestId("azi-next-action")).toHaveText("trimit oferta");
    await expect(r.getByTestId("azi-date")).toHaveText(onScreen(chisinauDay(0)));
    await expect(r.getByTestId("azi-call")).toHaveText("069 000 461");
    await expect(r.getByTestId("azi-call")).toHaveAttribute("href", "tel:069000461");
    // Azi este de facut, nu intarziat.
    await expect(r).toHaveAttribute("data-overdue", "false");
    await expect(r.getByTestId("azi-overdue")).toHaveCount(0);

    await rest.api.dispose();
  });

  test("G46: un lead întârziat stă deasupra unuia de azi și poartă cipul Întârziat", async ({ page }) => {
    await signIn(page, ownerAccount());
    const rest = await restAs(ownerAccount());
    const today = await createLead(rest, leadName("Ordine azi"), "nurture", null);
    const late = await createLead(rest, leadName("Ordine ieri"), "quoted", null);
    await patchClient(rest, today, { next_action_at: chisinauDay(0), next_action: "sun azi" });
    await patchClient(rest, late, { next_action_at: chisinauDay(-1), next_action: "trebuia ieri" });

    await openAzi(page);
    await expect(row(page, late)).toHaveCount(1, { timeout: 20_000 });
    const ids = await rowIds(page);
    expect(ids.indexOf(late)).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf(late)).toBeLessThan(ids.indexOf(today));

    await expect(row(page, late)).toHaveAttribute("data-overdue", "true");
    await expect(row(page, late).getByTestId("azi-overdue")).toHaveText("Întârziat");
    await expect(row(page, late).getByTestId("azi-date")).toHaveText(onScreen(chisinauDay(-1)));
    await expect(row(page, today).getByTestId("azi-overdue")).toHaveCount(0);

    await rest.api.dispose();
  });

  test("G46: un lead cu pasul de mâine nu apare pe Azi", async ({ page }) => {
    await signIn(page, ownerAccount());
    const rest = await restAs(ownerAccount());
    const tomorrow = await createLead(rest, leadName("Maine"), "nurture", null);
    await patchClient(rest, tomorrow, { next_action_at: chisinauDay(1), next_action: "sun mâine" });
    // Si unul De reluat pe maine, fara pas: data de reluare nu este inca datorata.
    const followUp = await createLead(rest, leadName("Maine De reluat"), "follow_up", chisinauDay(1));
    // Un martor de azi, ca lista sa fie sigur incarcata cand se verifica lipsa.
    const witness = await createLead(rest, leadName("Martor"), "nurture", null);
    await patchClient(rest, witness, { next_action_at: chisinauDay(0) });

    await openAzi(page);
    await expect(row(page, witness)).toHaveCount(1, { timeout: 20_000 });
    await expect(row(page, tomorrow)).toHaveCount(0);
    await expect(row(page, followUp)).toHaveCount(0);

    await rest.api.dispose();
  });

  test("G46: Am sunat cu textul pornit și Salvează scoate leadul de pe Azi, scrie nota și șterge pasul", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const rest = await restAs(ownerAccount());
    const id = await createLead(rest, leadName("Am sunat"), "nurture", null);
    await patchClient(rest, id, { next_action_at: chisinauDay(0), next_action: "sun pentru ofertă" });

    await openAzi(page);
    await expect(row(page, id)).toHaveCount(1, { timeout: 20_000 });
    await called(page, id);

    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Azi", exact: true })).toBeVisible({
      timeout: 25_000,
    });
    await expect(row(page, id)).toHaveCount(0, { timeout: 20_000 });

    // Nota este stocata cu textul pornit, de contul care a apasat; pasul este gol.
    expect(await storedNotes(rest, id)).toEqual([{ body: "Am sunat", created_by: rest.userId }]);
    expect(await stored(rest, id)).toMatchObject({ next_action_at: null, next_action: null });

    await rest.api.dispose();
  });

  test("G46: un lead De reluat de azi, fără pas, apare, iar Am sunat îl scoate fără să atingă data de reluare", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const rest = await restAs(ownerAccount());
    const date = chisinauDay(0);
    const id = await createLead(rest, leadName("De reluat"), "follow_up", date);
    expect(await stored(rest, id)).toEqual({ follow_up_date: date, next_action_at: null, next_action: null });

    await openAzi(page);
    const r = row(page, id);
    await expect(r).toHaveCount(1, { timeout: 20_000 });
    await expect(r.getByTestId("azi-next-action")).toHaveText("De reluat");
    await expect(r.getByTestId("azi-date")).toHaveText(onScreen(date));

    // Textul se poate schimba inainte de salvare.
    await r.getByTestId("azi-called").click();
    const form = page.locator(`[data-testid="azi-note"][data-id="${id}"]`);
    await expect(form.getByTestId("note-body")).toHaveValue("Am sunat");
    const body = `Am sunat, revine săptămâna viitoare ${RUN}`;
    await form.getByTestId("note-body").fill(body);
    await form.getByTestId("note-save").click();
    await expect(form).toHaveCount(0, { timeout: 20_000 });

    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Azi", exact: true })).toBeVisible({
      timeout: 25_000,
    });
    await expect(row(page, id)).toHaveCount(0, { timeout: 20_000 });

    // Data de reluare ramane a lui set_client_stage: Am sunat nu o scrie.
    expect(await stored(rest, id)).toEqual({ follow_up_date: date, next_action_at: null, next_action: null });
    expect(await storedNotes(rest, id)).toEqual([{ body, created_by: rest.userId }]);

    await rest.api.dispose();
  });

  test("G46: filtrul Responsabil păstrează rândurile acelui om și le ascunde pe ale altuia", async ({ page }) => {
    await signIn(page, ownerAccount());
    const rest = await restAs(ownerAccount());
    const manager = await restAs(managerAccount());
    const mine = await createLead(rest, leadName("Al meu"), "nurture", null);
    const theirs = await createLead(rest, leadName("Al altuia"), "nurture", null);
    await patchClient(rest, mine, { next_action_at: chisinauDay(0), owner_id: rest.userId });
    await patchClient(rest, theirs, { next_action_at: chisinauDay(0), owner_id: manager.userId });

    await openAzi(page);
    await expect(row(page, mine)).toHaveCount(1, { timeout: 20_000 });
    await expect(row(page, theirs)).toHaveCount(1);

    await page.getByTestId("azi-owner").selectOption(rest.userId);
    await expect(page).toHaveURL(new RegExp(`responsabil=${rest.userId}`), { timeout: 20_000 });
    await expect(row(page, theirs)).toHaveCount(0, { timeout: 20_000 });
    await expect(row(page, mine)).toHaveCount(1);

    await page.getByTestId("azi-owner").selectOption(manager.userId);
    await expect(row(page, mine)).toHaveCount(0, { timeout: 20_000 });
    await expect(row(page, theirs)).toHaveCount(1);

    await page.getByTestId("azi-owner").selectOption("");
    await expect(row(page, mine)).toHaveCount(1, { timeout: 20_000 });
    await expect(row(page, theirs)).toHaveCount(1);

    await manager.api.dispose();
    await rest.api.dispose();
  });

  test("G46: pe telefon, la 390 px, Azi nu derulează lateral și Am sunat este o țintă de 44 px", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, ownerAccount());
    const rest = await restAs(ownerAccount());
    const id = await createLead(rest, leadName("Telefon"), "nurture", null);
    await patchClient(rest, id, { next_action_at: chisinauDay(0), next_action: "sun de pe telefon" });

    await openAzi(page);
    const r = row(page, id);
    await expect(r).toHaveCount(1, { timeout: 20_000 });
    await r.scrollIntoViewIfNeeded();
    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(sideways, "Azi derulează lateral la 390 px").toBeLessThanOrEqual(0);
    const button = await r.getByTestId("azi-called").boundingBox();
    expect(button && button.height >= 44, "Am sunat sub 44 px pe telefon").toBe(true);

    await r.getByTestId("azi-called").click();
    await expect(page.locator(`[data-testid="azi-note"][data-id="${id}"]`).getByTestId("note-body")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("azi-390.png") });

    await rest.api.dispose();
  });
});
