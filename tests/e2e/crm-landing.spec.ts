import { expect, request, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { LOGIN_PATH, signIn } from "./support/auth";
import { ALL_ROUTES } from "@/lib/nav";

// crm-landing.spec - linia de acceptanta a cardului P3-46.
//
// O SINGURA INTRARE CRM IN MENIU, IN LOCUL LUI CLIENTI SI PROIECTE, deschide un
// ecran cu trei carduri mari si colorate. Fiecare clauza numeste linia din lista
// de acceptanta a predarii proprietarului, partea 4.8, pe care o dovedeste.
//
// tests/e2e/cross-links.spec.ts NU SE ATINGE. El trece nemodificat si acesta este
// dovada ca nimic nu s-a rupt; cazurile noi despre adresele vechi stau aici.
//
// VALORILE ASTEPTATE SUNT SCRISE AICI, NU IMPORTATE: etichetele, culorile, titlurile
// si ordinea din meniu. Singura exceptie este ALL_ROUTES, fiindca clauza 5 cere
// chiar lista pe care o parcurge tests/e2e/headers.spec.ts, nu o copie a ei.
//
// ETAPA UNUI RAND SE CITESTE DIN BAZA, prin PostgREST cu jetonul administratorului,
// nu de pe ecran: vederea Clienți nu are coloana de etapa, iar ecranul poate arata
// orice i s-a dat.
//
// DATELE DE TEST NU SE STERG NICIODATA. Fiecare rand poarta prefixul TEST si un
// sufix unic pe rulare, iar fiecare caz isi cauta randurile dupa acel sufix.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

/** Proiectul semanat de scripts/seed-test-crm.mjs, acelasi ca in cross-links.spec. */
const SEED_PROJECT = "TEST Șantier E2E";

/** Cele trei carduri ale ecranului CRM, in ordine, fiecare cu culoarea lui. */
const CARDS = [
  { label: "Clienți", colour: "green" },
  { label: "Leaduri", colour: "amber" },
  { label: "Proiecte", colour: "blue" },
] as const;

type Stage = "cold" | "nurture" | "follow_up" | "quoted" | "client";

// ---------------------------------------------------------------------------
// Legatura directa la baza, ca administratorul
// ---------------------------------------------------------------------------

type OwnerRest = {
  api: APIRequestContext;
  headers: Record<string, string>;
};

async function ownerRest(): Promise<OwnerRest> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  expect(url, "P3-46 are nevoie de NEXT_PUBLIC_SUPABASE_URL").not.toBe("");
  expect(anonKey, "P3-46 are nevoie de NEXT_PUBLIC_SUPABASE_ANON_KEY").not.toBe("");

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

async function restGet<T>(rest: OwnerRest, path: string): Promise<T> {
  const response = await rest.api.get(path, { headers: rest.headers });
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as T;
}

/** Numarul TOTAL de clienti activi, din antetul Content-Range. */
async function activeClientCount(rest: OwnerRest): Promise<number> {
  const response = await rest.api.get("/rest/v1/clients?select=id&active=eq.true&limit=1", {
    headers: { ...rest.headers, Prefer: "count=exact" },
  });
  // 206 este raspunsul corect cand limit=1 nu acopera tot numarul; vezi leaduri.spec.
  expect([200, 206], await response.text()).toContain(response.status());
  const range = response.headers()["content-range"] ?? "";
  const total = Number(range.split("/")[1]);
  expect(Number.isFinite(total), `Content-Range fara total: ${range}`).toBe(true);
  return total;
}

/** Etapa stocata a fiecarui id cerut. */
async function storedStages(rest: OwnerRest, ids: string[]): Promise<Map<string, Stage>> {
  const rows = await restGet<{ id: string; stage: Stage }[]>(
    rest,
    `/rest/v1/clients?select=id,stage&id=in.(${ids.join(",")})`,
  );
  expect(rows).toHaveLength(ids.length);
  return new Map(rows.map((r) => [r.id, r.stage]));
}

/**
 * Creeaza un lead si un client, cu etapa mutata prin public.set_client_stage,
 * functia pe care o foloseste si aplicatia. Intoarce id-urile dupa denumire.
 */
async function createFixture(
  rest: OwnerRest,
  rows: { name: string; stage: Stage }[],
): Promise<Record<string, string>> {
  const created = await rest.api.post("/rest/v1/clients", {
    headers: { ...rest.headers, Prefer: "return=representation" },
    data: rows.map((r) => ({ name: r.name, active: true })),
  });
  expect(created.status(), await created.text()).toBe(201);
  const stored = (await created.json()) as { id: string; name: string }[];
  expect(stored).toHaveLength(rows.length);

  const ids: Record<string, string> = {};
  for (const row of stored) ids[row.name] = row.id;

  for (const row of rows) {
    // Un rand nou este deja `cold`, din valoarea implicita a coloanei.
    if (row.stage === "cold") continue;
    const moved = await rest.api.post("/rest/v1/rpc/set_client_stage", {
      headers: rest.headers,
      data: { p_client_id: ids[row.name], p_stage: row.stage, p_follow_up_date: null },
    });
    expect(moved.status(), await moved.text()).toBe(200);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Ecranul
// ---------------------------------------------------------------------------

/** Legaturile din meniul lateral, fara logo, care sta in afara lui <nav>. */
function sidebarLinks(page: Page): Locator {
  return page.locator("aside nav a");
}

function crmCard(page: Page, label: string): Locator {
  return page
    .getByTestId("crm-card")
    .filter({ has: page.getByTestId("crm-card-label").getByText(label, { exact: true }) });
}

/** Titlul din bara de sus: primul text din <header>, inaintea lui "/ Rapid Construct". */
function topbarTitle(page: Page): Locator {
  return page.locator("header").first().locator("span").first();
}

async function rowIds(page: Page): Promise<string[]> {
  return page
    .getByTestId("client-row")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-id") ?? ""));
}

/**
 * Adresa pe care a aterizat un card, cu o cautare adaugata. Filtrul este al
 * cardului, neatins; cautarea doar restrange lista la randurile acestui caz.
 */
function withSearch(page: Page, q: string): string {
  const url = new URL(page.url());
  url.searchParams.set("q", q);
  return `${url.pathname}${url.search}`;
}

const sorted = (ids: string[]) => [...ids].sort();

// ---------------------------------------------------------------------------

test.describe("Ecranul CRM (P3-46)", () => {
  test.describe.configure({ timeout: 180_000 });

  test("P3-46 (1): meniul are o singură intrare CRM în locul lui Clienți și Proiecte, iar ea deschide trei carduri colorate, în ordine", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());

    const links = sidebarLinks(page);
    await expect(links.first()).toBeVisible({ timeout: 20_000 });
    const labels = (await links.allInnerTexts()).map((t) => t.trim());
    const hrefs = await links.evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));

    // EXACT O INTRARE CRM, si nicio intrare nu mai duce direct la cele doua liste.
    expect(labels.filter((l) => l === "CRM"), `meniul: ${labels.join(", ")}`).toHaveLength(1);
    expect(labels).not.toContain("Clienți");
    expect(labels).not.toContain("Proiecte");
    for (const href of hrefs) {
      expect(href, "o intrare din meniu duce direct la /clienti").not.toMatch(/^\/clienti([/?#]|$)/);
      expect(href, "o intrare din meniu duce direct la /proiecte").not.toMatch(/^\/proiecte([/?#]|$)/);
    }

    // IN LOCUL LOR: dupa ultima intrare din Intrări si inaintea primei din Stoc,
    // exact unde stateau Clienți si Proiecte.
    //
    // P3-91, goal G46: Azi este prima intrare a aceluiasi grup, chiar inaintea lui
    // CRM, deci intre Adăugare manuală si CRM sta acum Azi si nimic altceva.
    const crm = labels.indexOf("CRM");
    expect(labels[crm - 1]).toBe("Azi");
    expect(labels[crm - 2]).toBe("Adăugare manuală");
    expect(labels[crm + 1]).toBe("Inventar");

    await links.nth(crm).click();
    await expect(page).toHaveURL(/\/crm$/, { timeout: 20_000 });
    await expect(links.nth(crm)).toHaveAttribute("aria-current", "page");

    // TREI CARDURI, IN ORDINE, fiecare cu culoarea langa eticheta.
    const cards = page.getByTestId("crm-card");
    await expect(cards).toHaveCount(3, { timeout: 20_000 });
    await expect(cards.getByTestId("crm-card-label")).toHaveText(CARDS.map((c) => c.label));

    const painted: string[] = [];
    for (const [i, expected] of CARDS.entries()) {
      // Culoarea si eticheta stau in acelasi rand al cardului, una langa alta.
      const title = cards.nth(i).getByTestId("crm-card-title");
      await expect(title.getByTestId("crm-card-label")).toHaveText(expected.label);
      const colour = title.getByTestId("crm-card-colour");
      await expect(colour).toBeVisible();
      await expect(colour).toHaveAttribute("data-colour", expected.colour);

      // SI ESTE CHIAR PICTATA, nu doar numita intr-un atribut.
      const background = await colour.evaluate((e) => getComputedStyle(e).backgroundColor);
      expect(background, `culoarea cardului ${expected.label}`).not.toBe("rgba(0, 0, 0, 0)");
      painted.push(background);
    }
    expect(new Set(painted).size, "doua carduri au aceeasi culoare").toBe(3);
  });

  test("P3-46 (2): Clienți ajunge la clienții de la etapa Client, Leaduri la restul, Proiecte la /proiecte neschimbat", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await signIn(page, ownerAccount());
    const rest = await ownerRest();

    const tag = `TEST CRM Destinatii ${RUN}`;
    const leadName = `${tag} lead`;
    const clientName = `${tag} client`;
    const ids = await createFixture(rest, [
      { name: leadName, stage: "nurture" },
      { name: clientName, stage: "client" },
    ]);

    // CLIENTI. Pagina pe care aterizeaza cardul are randuri, fiindca fixture-ul are
    // un client, si fiecare rand de pe ea este stocat la etapa `client`.
    await page.goto("/crm");
    await crmCard(page, "Clienți").click();
    await expect(page).toHaveURL(/\/clienti\?/, { timeout: 20_000 });
    await expect(page.getByTestId("clients-filters")).toBeVisible({ timeout: 20_000 });
    const clientPage = await rowIds(page);
    expect(clientPage.length, "vederea Clienți a aterizat pe o lista goala").toBeGreaterThan(0);
    for (const [id, stage] of await storedStages(rest, clientPage)) {
      expect(stage, `randul ${id} din Clienți`).toBe("client");
    }
    // Pe fixture: acelasi filtru, restrans la randurile cazului, arata clientul si
    // nu arata leadul.
    await page.goto(withSearch(page, tag));
    await expect(page.getByTestId("client-row")).toHaveCount(1, { timeout: 20_000 });
    expect(await rowIds(page)).toEqual([ids[clientName]]);

    // LEADURI. Niciun rand de pe pagina nu este stocat la etapa `client`.
    await page.goto("/crm");
    await crmCard(page, "Leaduri").click();
    await expect(page).toHaveURL(/\/clienti\?/, { timeout: 20_000 });
    await expect(page.getByTestId("clients-filters")).toBeVisible({ timeout: 20_000 });
    const leadPage = await rowIds(page);
    expect(leadPage.length, "vederea Leaduri a aterizat pe o lista goala").toBeGreaterThan(0);
    for (const [id, stage] of await storedStages(rest, leadPage)) {
      expect(stage, `randul ${id} din Leaduri`).not.toBe("client");
    }
    await page.goto(withSearch(page, tag));
    await expect(page.getByTestId("client-row")).toHaveCount(1, { timeout: 20_000 });
    expect(await rowIds(page)).toEqual([ids[leadName]]);

    // PROIECTE, NESCHIMBAT: /proiecte fara niciun parametru, cu ecranul de azi.
    await page.goto("/crm");
    await crmCard(page, "Proiecte").click();
    await expect(page).toHaveURL(/\/proiecte$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Proiecte", exact: true })).toBeVisible({
      timeout: 20_000,
    });

    await rest.api.dispose();
  });

  test("P3-46 (3): adresele de azi răspund cu același ecran, fără redirectare, cu CRM marcat în meniu", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await signIn(page, ownerAccount());
    const rest = await ownerRest();

    const tag = `TEST CRM Adrese ${RUN}`;
    const leadName = `${tag} lead`;
    const clientName = `${tag} client`;
    const ids = await createFixture(rest, [
      { name: leadName, stage: "cold" },
      { name: clientName, stage: "client" },
    ]);

    const [project] = await restGet<{ id: string }[]>(
      rest,
      `/rest/v1/projects?select=id&name=eq.${encodeURIComponent(SEED_PROJECT)}&limit=1`,
    );
    expect(project, `proiectul semanat ${SEED_PROJECT} lipseste`).toBeDefined();
    const projectId = project!.id;

    const screens: { path: string; heading: string; ready: string }[] = [
      { path: "/clienti", heading: "Clienți", ready: "clients-filters" },
      { path: `/clienti/${ids[clientName]}`, heading: clientName, ready: "client-detail" },
      { path: "/proiecte", heading: "Proiecte", ready: "project-new" },
      { path: `/proiecte/${projectId}`, heading: SEED_PROJECT, ready: "project-detail" },
      { path: `/proiecte/${projectId}?fila=comparatie`, heading: SEED_PROJECT, ready: "panel-comparatie" },
      { path: `/proiecte/${projectId}?fila=deviz`, heading: SEED_PROJECT, ready: "panel-deviz" },
    ];

    for (const s of screens) {
      const response = await page.goto(s.path);
      expect(response?.status(), `${s.path} nu a raspuns 200`).toBe(200);
      // FARA REDIRECTARE SI FARA BUCLA: adresa finala este chiar cea ceruta.
      const landed = new URL(page.url());
      expect(`${landed.pathname}${landed.search}`, `${s.path} a fost redirectat`).toBe(s.path);
      await expect(page.getByRole("heading", { level: 1, name: s.heading, exact: true })).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByTestId(s.ready)).toBeVisible({ timeout: 25_000 });

      // Ecranul este al grupului CRM, deci intrarea CRM ramane marcata in meniu.
      const crm = sidebarLinks(page).filter({ hasText: /^CRM$/ });
      await expect(crm).toHaveCount(1);
      await expect(crm).toHaveAttribute("aria-current", "page");
    }

    // /clienti FARA PARAMETRU LISTEAZA IN CONTINUARE FIECARE CLIENT ACTIV, lead sau
    // client: numarul din antetul listei este numarul stocat, si pe fixture apar
    // amandoua randurile.
    const total = await activeClientCount(rest);
    await page.goto("/clienti");
    await expect(page.getByText(`${total} clienți`, { exact: true })).toBeVisible({ timeout: 20_000 });
    await page.goto(`/clienti?q=${encodeURIComponent(tag)}`);
    await expect(page.getByTestId("client-row")).toHaveCount(2, { timeout: 20_000 });
    expect(sorted(await rowIds(page))).toEqual(sorted([ids[leadName]!, ids[clientName]!]));

    await rest.api.dispose();
  });

  test("P3-46 (4): titlul din bara de sus rămâne Clienți și Proiecte pe listele de azi, iar pe ecranul nou este CRM", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());

    const titles: [string, string][] = [
      ["/crm", "CRM"],
      ["/clienti", "Clienți"],
      ["/clienti?vedere=leaduri", "Leaduri"],
      ["/proiecte", "Proiecte"],
    ];
    for (const [path, title] of titles) {
      await page.goto(path);
      await expect(topbarTitle(page), `titlul pe ${path}`).toHaveText(title, { timeout: 20_000 });
    }
  });

  test("P3-46 (5): lista de rute din headers.spec acoperă ecranul CRM și în continuare /clienti și /proiecte", async () => {
    expect(ALL_ROUTES).toContain("/crm");
    expect(ALL_ROUTES).toContain("/clienti");
    expect(ALL_ROUTES).toContain("/proiecte");
    // Nicio ruta de doua ori: headers.spec ar vizita-o de doua ori si nu ar spune.
    expect(new Set(ALL_ROUTES).size).toBe(ALL_ROUTES.length);
  });

  test("P3-46 (6): ecranul CRM cere autentificare, ca orice alt ecran", async ({ page }) => {
    await page.goto("/crm");
    await expect(page).toHaveURL(new RegExp(`${LOGIN_PATH}$`), { timeout: 20_000 });
    await expect(page.getByTestId("login-form")).toBeVisible();
    await expect(page.getByTestId("crm-card")).toHaveCount(0);

    // Redirectarea era pentru sesiune, nu un ecran lipsa: autentificat, aceeasi
    // adresa arata cele trei carduri.
    await signIn(page, ownerAccount());
    await page.goto("/crm");
    await expect(page).toHaveURL(/\/crm$/);
    await expect(page.getByTestId("crm-card")).toHaveCount(3, { timeout: 20_000 });
  });
});
