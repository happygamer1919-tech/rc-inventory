import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// leaduri.spec - linia de acceptanta a cardului P3-45.
//
// LEADURI ESTE O VEDERE A LISTEI DE CLIENTI, NU UN ECRAN NOU, si spec-ul acesta
// o testeaza ca atare: fiecare caz deschide /clienti cu un parametru in URL. Este
// totusi un fisier al lui, fiindca vederea este ce se testeaza, la fel cum
// clients.spec si projects.spec sunt cate unul pe ecran.
//
// Fiecare clauza numeste linia din lista de acceptanta a predarii proprietarului,
// partea 4.8, pe care o dovedeste.
//
// VALORILE ASTEPTATE SUNT SCRISE AICI, NU IMPORTATE din lib/data/clients-types:
// un test care importa lucrul pe care il verifica dovedeste doar ca acel lucru este
// egal cu el insusi. Acelasi motiv ca in cazurile P3-43 din clients.spec.
//
// SE CITESTE DIN RANDURILE STOCATE, NU DE PE ECRAN, prin PostgREST, cu jetonul
// administratorului. Ecranul poate arata o valoare pe care baza nu a primit-o
// niciodata; randul nu.
//
// FIXTURILE SE SCRIU PRIN PostgREST SI PRIN public.set_client_stage, nu prin
// formular, in afara cazurilor care testeaza chiar formularul. Etapa unui fixture
// trece prin aceeasi functie pe care o foloseste aplicatia, deci fiecare mutare
// are randul ei de istoric.
//
// DATELE DE TEST NU SE STERG NICIODATA. Fiecare rand de aici poarta prefixul TEST
// si un sufix unic pe rulare, iar fiecare caz isi cauta randurile dupa acel sufix,
// ca randurile altor rulari si ale altor spec-uri sa nu ajunga in afirmatii.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

const STAGES = ["cold", "nurture", "follow_up", "quoted", "client"] as const;
type Stage = (typeof STAGES)[number];

/** Cele patru etape de lead, in ordinea declarata. `client` nu este lead. */
const LEADURI_STAGES = ["cold", "nurture", "follow_up", "quoted"] as const;

const STAGE_LABEL: Record<Stage, string> = {
  cold: "Lead rece",
  nurture: "În cultivare",
  follow_up: "De reluat",
  quoted: "Ofertat",
  client: "Client",
};

const STAGE_COLOUR: Record<Stage, string> = {
  cold: "red",
  nurture: "blue",
  follow_up: "amber",
  quoted: "purple",
  client: "green",
};

const SOURCES = ["recomandare", "telefon", "site", "vizita", "altul"] as const;

/** Cu diacritice, dupa CLAUDE.md sectiunea 11, peste ortografia predarii. */
const SOURCE_LABEL: Record<(typeof SOURCES)[number], string> = {
  recomandare: "Recomandare",
  telefon: "Telefon",
  site: "Site",
  vizita: "Vizită",
  altul: "Altul",
};

const FOLLOW_UP_REQUIRED = "Pentru etapa De reluat trebuie completată data de reluare.";
const NAME_REQUIRED = "Denumirea este obligatorie.";

// ---------------------------------------------------------------------------
// Legatura directa la baza, ca administratorul
// ---------------------------------------------------------------------------

type OwnerRest = {
  api: APIRequestContext;
  headers: Record<string, string>;
  userId: string;
};

async function ownerRest(): Promise<OwnerRest> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  expect(url, "P3-45 are nevoie de NEXT_PUBLIC_SUPABASE_URL").not.toBe("");
  expect(anonKey, "P3-45 are nevoie de NEXT_PUBLIC_SUPABASE_ANON_KEY").not.toBe("");

  const api = await request.newContext({ baseURL: url });
  const owner = ownerAccount();
  const token = await api.post("/auth/v1/token?grant_type=password", {
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    data: { email: owner.email, password: owner.password },
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

async function restGet<T>(rest: OwnerRest, path: string): Promise<T> {
  const response = await rest.api.get(path, { headers: rest.headers });
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as T;
}

/** Numarul TOTAL de randuri din public.clients, din antetul Content-Range. */
async function clientCount(rest: OwnerRest): Promise<number> {
  const response = await rest.api.get("/rest/v1/clients?select=id&limit=1", {
    headers: { ...rest.headers, Prefer: "count=exact" },
  });
  // 206 SI NU 200, si nu este o eroare: PostgREST raspunde "Partial Content" cand
  // intervalul intors nu acopera tot numarul cerut cu count=exact, adica exact
  // cazul unui limit=1. Rularea rosie 34772991914 a cazut aici pe un 206.
  expect([200, 206], await response.text()).toContain(response.status());
  const range = response.headers()["content-range"] ?? "";
  const total = Number(range.split("/")[1]);
  expect(Number.isFinite(total), `Content-Range fara total: ${range}`).toBe(true);
  return total;
}

/** Randurile unui caz, dupa eticheta lui unica, cu etapa si starea stocate. */
async function storedByTag(
  rest: OwnerRest,
  tag: string,
): Promise<{ id: string; name: string; stage: Stage; active: boolean }[]> {
  return restGet(
    rest,
    `/rest/v1/clients?select=id,name,stage,active&name=like.${encodeURIComponent(`${tag} *`)}`,
  );
}

type StoredHistory = {
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  created_at: string;
};

async function storedHistory(rest: OwnerRest, id: string): Promise<StoredHistory[]> {
  return restGet(
    rest,
    `/rest/v1/status_history?entity_type=eq.client&entity_id=eq.${id}` +
      "&select=from_status,to_status,changed_by,created_at&order=created_at.asc",
  );
}

type FixtureRow = { name: string; stage: Stage; date?: string | null; active?: boolean };

/**
 * Creeaza randurile unui caz si le muta la etapa ceruta prin
 * public.set_client_stage, functia pe care o foloseste si aplicatia. Intoarce
 * id-ul fiecarui rand dupa denumire.
 */
async function createFixture(rest: OwnerRest, rows: FixtureRow[]): Promise<Record<string, string>> {
  const created = await rest.api.post("/rest/v1/clients", {
    headers: { ...rest.headers, Prefer: "return=representation" },
    data: rows.map((r) => ({ name: r.name, active: r.active ?? true })),
  });
  expect(created.status(), await created.text()).toBe(201);
  const stored = (await created.json()) as { id: string; name: string }[];
  expect(stored).toHaveLength(rows.length);

  const ids: Record<string, string> = {};
  for (const row of stored) ids[row.name] = row.id;

  for (const row of rows) {
    // Un rand `cold` fara data este exact randul creat; nimic de mutat.
    if (row.stage === "cold" && !row.date) continue;
    const moved = await rest.api.post("/rest/v1/rpc/set_client_stage", {
      headers: rest.headers,
      data: { p_client_id: ids[row.name], p_stage: row.stage, p_follow_up_date: row.date ?? null },
    });
    expect(moved.status(), await moved.text()).toBe(200);
  }
  return ids;
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

// ---------------------------------------------------------------------------
// Ecranul
// ---------------------------------------------------------------------------

function listUrl(params: Record<string, string>): string {
  return `/clienti?${new URLSearchParams(params).toString()}`;
}

async function rowIds(page: Page): Promise<string[]> {
  return page
    .getByTestId("client-row")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-id") ?? ""));
}

async function rowNames(page: Page): Promise<string[]> {
  return page
    .getByTestId("client-row")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-name") ?? ""));
}

/**
 * Id-urile TUTUROR paginilor unei liste, nu doar ale primei. Numarul de pagini se
 * citeste din subsolul de paginare, care lipseste cand exista o singura pagina.
 */
async function collectIds(page: Page, params: Record<string, string>): Promise<string[]> {
  await page.goto(listUrl(params));
  await expect(page.getByTestId("clients-filters")).toBeVisible({ timeout: 20_000 });

  let pages = 1;
  const pagination = page.getByTestId("clients-pagination");
  if ((await pagination.count()) > 0) {
    const match = /Pagina\s+\d+\s+din\s+(\d+)/.exec((await pagination.textContent()) ?? "");
    expect(match, "subsolul de paginare nu spune numarul de pagini").not.toBeNull();
    pages = Number(match![1]);
  }

  const ids: string[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p > 1) {
      await page.goto(listUrl({ ...params, pagina: String(p) }));
      await expect(page.getByTestId("clients-filters")).toBeVisible({ timeout: 20_000 });
    }
    ids.push(...(await rowIds(page)));
  }
  expect(new Set(ids).size, "un id apare pe doua pagini").toBe(ids.length);
  return ids;
}

/** Id-ul clientului abia creat, din ruta de detaliu pe care a ajuns ecranul. */
async function createdClientId(page: Page): Promise<string> {
  await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });
  const match = /\/clienti\/([0-9a-f-]{36})/.exec(page.url());
  expect(match, `nu s-a ajuns pe fisa clientului: ${page.url()}`).not.toBeNull();
  return match![1]!;
}

async function openLeaduriForm(page: Page) {
  await page.goto(listUrl({ vedere: "leaduri" }));
  await page.getByTestId("leaduri-new").click();
  await expect(page.getByTestId("leaduri-form")).toBeVisible();
}

const sorted = (ids: string[]) => [...ids].sort();

// ---------------------------------------------------------------------------

test.describe("Leaduri (P3-45)", () => {
  test.describe.configure({ timeout: 180_000 });

  test("P3-45 (1): formularul de lead creează un client la fiecare dintre cele cinci etape, cu fiecare câmp citit din rândurile stocate", async ({
    page,
  }) => {
    test.setTimeout(420_000);
    await signIn(page, ownerAccount());
    const rest = await ownerRest();

    await openLeaduriForm(page);
    const form = page.getByTestId("leaduri-form");

    // FORMULARUL SE DESCHIDE LA LEAD RECE, iar etapele sunt cele cinci, in ordine.
    const stage = page.getByTestId("field-leaduri-stage");
    await expect(stage).toHaveValue("cold");
    const stageOptions = stage.locator("option");
    await expect(stageOptions).toHaveText(STAGES.map((s) => STAGE_LABEL[s]));
    expect(
      await stageOptions.evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value)),
    ).toEqual([...STAGES]);

    // SURSA OFERA EXACT CELE CINCI TOKENURI, IN ORDINE, fiecare cu eticheta ei
    // romaneasca. Optiunea goala inseamna "nespecificata" si nu este o sursa.
    const sourceOptions = page.getByTestId("field-leaduri-source").locator('option:not([value=""])');
    await expect(sourceOptions).toHaveText(SOURCES.map((s) => SOURCE_LABEL[s]));
    expect(
      await sourceOptions.evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value)),
    ).toEqual([...SOURCES]);

    // DENUMIREA ESTE OBLIGATORIE, refuzata in romana.
    const before = await clientCount(rest);
    await page.getByTestId("leaduri-submit").click();
    await expect(page.getByTestId("form-error")).toHaveText(NAME_REQUIRED, { timeout: 15_000 });
    expect(await clientCount(rest)).toBe(before);
    await form.getByRole("button", { name: "Renunță" }).click();
    await expect(form).toHaveCount(0);

    for (const [i, s] of STAGES.entries()) {
      const v = {
        name: `TEST Formular ${s} ${RUN}`,
        contact: `TEST Persoana ${i} ${RUN}`,
        phone: `069 45${i} 000`,
        email: `leaduri${i}-${RUN}@rc-inventory.local`,
        source: SOURCES[i]!,
        interest: `Acoperiș cu țiglă, varianta ${i}`,
        date: `2026-12-1${i}`,
        notes: `Notă de test ${i}`,
      };

      await openLeaduriForm(page);
      await page.getByTestId("field-leaduri-name").fill(v.name);
      await page.getByTestId("field-leaduri-contact").fill(v.contact);
      await page.getByTestId("field-leaduri-phone").fill(v.phone);
      await page.getByTestId("field-leaduri-email").fill(v.email);
      await page.getByTestId("field-leaduri-source").selectOption(v.source);
      await page.getByTestId("field-leaduri-interest").fill(v.interest);
      await page.getByTestId("field-leaduri-stage").selectOption(s);
      await page.getByTestId("field-leaduri-owner").selectOption(rest.userId);
      await page.getByTestId("field-leaduri-follow-up").fill(v.date);
      await page.getByTestId("field-leaduri-notes").fill(v.notes);
      await page.getByTestId("leaduri-submit").click();

      const id = await createdClientId(page);

      const [row] = await restGet<Record<string, unknown>[]>(
        rest,
        `/rest/v1/clients?id=eq.${id}` +
          "&select=name,phone,email,source,interest,stage,owner_id,follow_up_date,notes",
      );
      expect(row).toEqual({
        name: v.name,
        phone: v.phone,
        email: v.email,
        source: v.source,
        interest: v.interest,
        stage: s,
        owner_id: rest.userId,
        follow_up_date: v.date,
        notes: v.notes,
      });

      // PERSOANA DE CONTACT ESTE UN RAND IN public.contacts, nu o coloana noua.
      const contacts = await restGet<{ name: string }[]>(
        rest,
        `/rest/v1/contacts?client_id=eq.${id}&select=name`,
      );
      expect(contacts).toEqual([{ name: v.contact }]);

      // PRIMUL RAND DE ISTORIC, DE LA NICIO ETAPA LA CEA ALEASA, cu autor si ora.
      // Si la `cold`, unde nu exista nicio mutare de la etapa implicita.
      const history = await storedHistory(rest, id);
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({ from_status: null, to_status: s, changed_by: rest.userId });
      expect(Number.isNaN(Date.parse(history[0]!.created_at))).toBe(false);
    }

    await rest.api.dispose();
  });

  test("P3-45 (2): De reluat fără dată este refuzat și din formularul de lead, fără niciun rând nou", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const rest = await ownerRest();
    const name = `TEST Fara data ${RUN}`;

    const before = await clientCount(rest);

    await openLeaduriForm(page);
    await page.getByTestId("field-leaduri-name").fill(name);
    await page.getByTestId("field-leaduri-stage").selectOption("follow_up");
    await expect(page.getByTestId("field-leaduri-follow-up")).toHaveValue("");
    await page.getByTestId("leaduri-submit").click();

    const error = page.getByTestId("form-error");
    await expect(error).toHaveText(FOLLOW_UP_REQUIRED, { timeout: 20_000 });
    await expect(error).not.toContainText("23514");

    expect(await clientCount(rest)).toBe(before);
    // Dupa denumirea EXACTA: cautarea dupa eticheta cere un sufix dupa ea si nu ar
    // gasi niciodata un rand cu numele acesta, deci ar trece si daca s-ar fi creat.
    expect(
      await restGet<unknown[]>(rest, `/rest/v1/clients?select=id&name=eq.${encodeURIComponent(name)}`),
    ).toHaveLength(0);

    await rest.api.dispose();
  });

  test("P3-45 (3): cele întârziate primele, apoi cele de azi și viitoare, iar cele fără dată la urmă", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const rest = await ownerRest();
    const tag = `TEST Reluare ${RUN}`;

    // DENUMIRILE SUNT IN ORDINEA INVERSA DATELOR, ca o sortare dupa nume sa dea
    // exact opusul. Rândul de azi este datorat, nu intarziat: azi in Chisinau.
    const overdue = `${tag} Z intarziat`;
    const today = `${tag} M azi`;
    const upcoming = `${tag} A viitor`;
    const undated = `${tag} 0 fara data`;
    await createFixture(rest, [
      { name: upcoming, stage: "nurture", date: chisinauDay(10) },
      { name: overdue, stage: "nurture", date: chisinauDay(-10) },
      { name: today, stage: "quoted", date: chisinauDay(0) },
      { name: undated, stage: "cold" },
    ]);

    await page.goto(listUrl({ vedere: "leaduri", q: tag }));
    await expect.poll(() => rowNames(page), { timeout: 20_000 }).toEqual([
      overdue,
      today,
      upcoming,
      undated,
    ]);

    // Numai cel dinainte de azi este marcat intarziat.
    const row = (n: string) => page.locator(`[data-testid="client-row"][data-name="${n}"]`);
    await expect(row(overdue).getByTestId("row-overdue")).toHaveCount(1);
    await expect(row(today).getByTestId("row-overdue")).toHaveCount(0);
    await expect(row(upcoming).getByTestId("row-overdue")).toHaveCount(0);
    await expect(row(undated).getByTestId("row-overdue")).toHaveCount(0);

    // Lista nefiltrata ramane in ordinea de azi, dupa denumire: ordinea dupa data
    // este a vederii Leaduri, nu o schimbare a listei de clienti.
    await page.goto(listUrl({ q: tag }));
    await expect.poll(() => rowNames(page), { timeout: 20_000 }).toEqual([
      undated,
      upcoming,
      today,
      overdue,
    ]);

    await rest.api.dispose();
  });

  test("P3-45 (4): fiecare etapă filtrează la ea însăși, filtrul stă în URL, iar înapoi reface filtrul anterior", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const rest = await ownerRest();
    const tag = `TEST Filtre ${RUN}`;

    const ids = await createFixture(
      rest,
      STAGES.map((s) => ({
        name: `${tag} ${s}`,
        stage: s,
        date: s === "follow_up" ? chisinauDay(5) : null,
      })),
    );
    const idOf = (s: Stage) => ids[`${tag} ${s}`]!;
    const stored = await storedByTag(rest, tag);
    const stageOf = new Map(stored.map((r) => [r.id, r.stage]));

    await page.goto(listUrl({ vedere: "leaduri", q: tag }));

    // PATRU CIPURI, IN ORDINEA ETAPELOR, fiecare cu eticheta si culoarea ei.
    const chips = page.getByTestId("stage-chip");
    await expect(chips).toHaveCount(4, { timeout: 20_000 });
    expect(
      await chips.evaluateAll((els) => els.map((e) => e.getAttribute("data-stage"))),
    ).toEqual([...LEADURI_STAGES]);
    for (const s of LEADURI_STAGES) {
      const chip = page.locator(`[data-testid="stage-chip"][data-stage="${s}"]`);
      await expect(chip.getByTestId("stage-chip-label")).toHaveText(STAGE_LABEL[s]);
      await expect(chip.getByTestId("stage-chip-colour")).toHaveAttribute("data-colour", STAGE_COLOUR[s]);
    }

    // Vederea Leaduri fara etapa: cele patru etape de lead, niciun client.
    await expect
      .poll(async () => sorted(await rowIds(page)), { timeout: 20_000 })
      .toEqual(sorted(LEADURI_STAGES.map(idOf)));

    for (const s of LEADURI_STAGES) {
      await page.locator(`[data-testid="stage-chip"][data-stage="${s}"]`).click();
      await expect(page).toHaveURL(new RegExp(`[?&]etapa=${s}(&|$)`));
      await expect.poll(() => rowIds(page), { timeout: 20_000 }).toEqual([idOf(s)]);
      // Etapa randului se citeste din baza, nu din atributul de pe ecran.
      for (const id of await rowIds(page)) expect(stageOf.get(id)).toBe(s);
    }

    // `client` se atinge prin vederea Clienti a aceluiasi ecran.
    await page.getByTestId("view-clienti").click();
    await expect(page).toHaveURL(/[?&]vedere=clienti(&|$)/);
    await expect.poll(() => rowIds(page), { timeout: 20_000 }).toEqual([idOf("client")]);
    for (const id of await rowIds(page)) expect(stageOf.get(id)).toBe("client");

    // INAPOI REFACE FILTRUL ANTERIOR.
    await page.goto(listUrl({ vedere: "leaduri", q: tag }));
    await page.locator('[data-testid="stage-chip"][data-stage="nurture"]').click();
    await expect(page).toHaveURL(/[?&]etapa=nurture(&|$)/);
    await expect.poll(() => rowIds(page), { timeout: 20_000 }).toEqual([idOf("nurture")]);
    await page.locator('[data-testid="stage-chip"][data-stage="quoted"]').click();
    await expect(page).toHaveURL(/[?&]etapa=quoted(&|$)/);
    await expect.poll(() => rowIds(page), { timeout: 20_000 }).toEqual([idOf("quoted")]);

    await page.goBack();
    await expect(page).toHaveURL(/[?&]etapa=nurture(&|$)/);
    await expect.poll(() => rowIds(page), { timeout: 20_000 }).toEqual([idOf("nurture")]);

    await rest.api.dispose();
  });

  test("P3-45 (5): numărul afișat pentru fiecare etapă este numărul de rânduri stocate, sub aceeași căutare și aceeași stare", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const rest = await ownerRest();
    const tag = `TEST Numere ${RUN}`;

    await createFixture(rest, [
      { name: `${tag} rece 1`, stage: "cold" },
      { name: `${tag} rece 2`, stage: "cold" },
      { name: `${tag} rece inactiv`, stage: "cold", active: false },
      { name: `${tag} cultivare`, stage: "nurture" },
      { name: `${tag} reluat 1`, stage: "follow_up", date: chisinauDay(1) },
      { name: `${tag} reluat 2`, stage: "follow_up", date: chisinauDay(2) },
      { name: `${tag} reluat 3`, stage: "follow_up", date: chisinauDay(3) },
      { name: `${tag} client 1`, stage: "client" },
      { name: `${tag} client 2`, stage: "client", active: false },
    ]);
    const stored = await storedByTag(rest, tag);

    const expected = (activeOnly: boolean) =>
      Object.fromEntries(
        STAGES.map((s) => [
          s,
          String(stored.filter((r) => r.stage === s && (!activeOnly || r.active)).length),
        ]),
      );

    const shown = async () =>
      Object.fromEntries(
        await Promise.all(
          STAGES.map(async (s) => [
            s,
            ((await page
              .locator(`[data-testid="stage-count"][data-stage="${s}"]`)
              .textContent()) ?? "").trim(),
          ]),
        ),
      );

    // Starea implicita este "activi", la fel ca lista.
    await page.goto(listUrl({ vedere: "leaduri", q: tag }));
    await expect.poll(shown, { timeout: 20_000 }).toEqual(expected(true));

    // Numerele nu depind de etapa aleasa: sunt pe etapa, sub aceeasi cautare.
    await page.locator('[data-testid="stage-chip"][data-stage="nurture"]').click();
    await expect(page).toHaveURL(/[?&]etapa=nurture(&|$)/);
    await expect.poll(shown, { timeout: 20_000 }).toEqual(expected(true));

    // Sub filtrul "toate", randurile dezactivate intra si in numere.
    await page.goto(listUrl({ vedere: "leaduri", q: tag, stare: "toate" }));
    await expect.poll(shown, { timeout: 20_000 }).toEqual(expected(false));
    expect(expected(false)).not.toEqual(expected(true));

    await rest.api.dispose();
  });

  test("P3-45 (6): vederile Leaduri și Clienți împart lista fără rest și fără suprapunere, pe toate paginile", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const rest = await ownerRest();
    const tag = `TEST Partitie ${RUN}`;

    // SASE RANDURI PE ETAPA, TREIZECI IN TOTAL: mai mult decat o pagina de 25, ca
    // lista nefiltrata sa aiba doua pagini si cazul sa le citeasca pe amandoua.
    const rows: FixtureRow[] = [];
    for (const s of STAGES) {
      for (let n = 1; n <= 6; n++) {
        rows.push({
          name: `${tag} ${s} ${n}`,
          stage: s,
          date: s === "follow_up" ? chisinauDay(n) : null,
        });
      }
    }
    await createFixture(rest, rows);
    const stored = await storedByTag(rest, tag);
    expect(stored).toHaveLength(30);
    const stageOf = new Map(stored.map((r) => [r.id, r.stage]));

    const all = await collectIds(page, { q: tag });
    const leaduri = await collectIds(page, { vedere: "leaduri", q: tag });
    const clienti = await collectIds(page, { vedere: "clienti", q: tag });

    expect(sorted(all)).toEqual(sorted(stored.map((r) => r.id)));
    expect(leaduri.length).toBe(24);
    expect(clienti.length).toBe(6);

    for (const id of leaduri) expect(stageOf.get(id)).not.toBe("client");
    for (const id of clienti) expect(stageOf.get(id)).toBe("client");

    const inBoth = leaduri.filter((id) => clienti.includes(id));
    expect(inBoth).toEqual([]);
    expect(sorted([...leaduri, ...clienti])).toEqual(sorted(all));

    await rest.api.dispose();
  });

  test("P3-45 (7): conversia este o schimbare de etapă, cu același id, fără rând nou și cu un singur rând de istoric", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const rest = await ownerRest();
    const name = `TEST Conversie ${RUN}`;

    const ids = await createFixture(rest, [{ name, stage: "quoted" }]);
    const id = ids[name]!;

    await page.goto(listUrl({ vedere: "leaduri", q: name }));
    await expect.poll(() => rowIds(page), { timeout: 20_000 }).toEqual([id]);

    const before = await clientCount(rest);
    const historyBefore = await storedHistory(rest, id);

    await page.goto(`/clienti/${id}`);
    await page.getByTestId("client-edit").click();
    await expect(page.getByTestId("client-form")).toBeVisible();
    await page.getByTestId("field-client-stage").selectOption("client");
    await page.getByTestId("client-submit").click();
    await expect(page.getByTestId("client-form")).toHaveCount(0, { timeout: 20_000 });

    await page.goto(listUrl({ vedere: "leaduri", q: name }));
    await expect(page.getByTestId("clients-filters")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("client-row")).toHaveCount(0, { timeout: 20_000 });

    await page.goto(listUrl({ vedere: "clienti", q: name }));
    await expect.poll(() => rowIds(page), { timeout: 20_000 }).toEqual([id]);

    expect(await clientCount(rest)).toBe(before);

    const moves = (await storedHistory(rest, id)).slice(historyBefore.length);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ from_status: "quoted", to_status: "client", changed_by: rest.userId });

    await rest.api.dispose();
  });

  test("P3-45 (8): căutarea după o parte din nume întoarce doar potrivirile, stă în URL și se combină cu etapa", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const rest = await ownerRest();
    const tag = `TEST Cautare ${RUN}`;

    const ids = await createFixture(rest, [
      { name: `${tag} Alfa`, stage: "cold" },
      { name: `${tag} Beta`, stage: "nurture" },
      { name: `${tag} Gama`, stage: "nurture" },
    ]);

    // O parte din nume, fara majuscule. Numele este "TEST Cautare <rulare> Alfa",
    // deci bucata cautata este "<rulare> alfa", in ordinea din nume.
    await page.goto(listUrl({ vedere: "leaduri" }));
    const needle = `${RUN} alfa`;
    await page.getByTestId("clients-search").fill(needle);
    await expect.poll(() => new URL(page.url()).searchParams.get("q"), { timeout: 20_000 }).toBe(needle);
    await expect.poll(() => rowIds(page), { timeout: 20_000 }).toEqual([ids[`${tag} Alfa`]]);

    // Combinata cu o etapa: cautarea ramane, etapa se adauga.
    await page.goto(listUrl({ vedere: "leaduri", q: tag }));
    await page.locator('[data-testid="stage-chip"][data-stage="nurture"]').click();
    await expect(page).toHaveURL(/[?&]etapa=nurture(&|$)/);
    await expect
      .poll(async () => sorted(await rowIds(page)), { timeout: 20_000 })
      .toEqual(sorted([ids[`${tag} Beta`]!, ids[`${tag} Gama`]!]));

    await page.getByTestId("clients-search").fill(`${RUN} beta`);
    await expect.poll(() => new URL(page.url()).searchParams.get("q"), { timeout: 20_000 }).toBe(`${RUN} beta`);
    expect(new URL(page.url()).searchParams.get("etapa")).toBe("nurture");
    await expect.poll(() => rowIds(page), { timeout: 20_000 }).toEqual([ids[`${tag} Beta`]]);

    await rest.api.dispose();
  });
});
