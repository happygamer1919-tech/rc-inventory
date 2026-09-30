import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { chisinauDateOf, chisinauToday } from "@/lib/data/format";
import { invoiceStatusLabel } from "@/lib/data/facturare-types";

// facturare-chisinau-day.spec - linia de acceptanta a cardului P3-115, goal G70, pentru
// constatarile G2 (linia 113), G3 (145), G8 (285) si G14 (401) ale raportului
// docs/reports/2026-09-29-critic-bug-sweep-2.md.
//
// CE DOVEDESTE AICI SI CE SE DOVEDESTE IN ASERTIUNILE MIGRATIEI. Fisierul
// scripts/poc-free/local-db/assertions/0065_invoice_chisinau_day_and_paid_date.sql
// dovedeste ce se poate dovedi intr-o singura sesiune de baza de date: forma functiilor
// inlocuite, ca declansatorul refuza cele doua zile, si, prin mutarea fusului SESIUNII,
// ca ziua pe care o alege baza cand nu i se trimite niciuna este cea de la Chisinau si
// NU cea a serverului. Acela este locul in care cele doua ceasuri se pot deosebi
// decisiv, fiindca `current_date` citeste fusul sesiunii si expresia din 0065 nu.
//
// CE NU POATE DOVEDI ACOLO este aplicatia: daca `cancelInvoice` trimite ziua de la
// Chisinau in loc de un sir gol este TypeScript, si se vede numai prin ecran sau prin
// functia pura. Cazurile de aici sunt acelea.
//
// CUM SE FIXEAZA CEASUL, fiindca este intrebarea pe care cardul cere sa fie raspunsa in
// scris. Nici ceasul masinii, nici cel al bazei nu se ating: niciunul nu se poate muta
// dintr-un test, si un test care ar incerca ar fi un test despre mutarea ceasului.
//
//   CAZUL 1 fixeaza MOMENTUL, nu ceasul: trece instante scrise de mana lui
//   chisinauDateOf, care este chiar functia pe care aplicatia o foloseste. La 22:30 UTC
//   pe 31 decembrie 2026 ziua de la Chisinau este deja 1 ianuarie 2027, deci cele doua
//   zile sunt zile calendaristice DIFERITE si cad in ANI diferiti. Este exact cazul pe
//   care il descrie constatarea, si el este determinist la orice ora a zilei.
//
//   CAZUL 2 arata ca DOUA ZILE DIFERITE DAU DOUA SERII DIFERITE, intreband baza despre
//   fiecare dintre ele. Asta este consecinta: documentul nu poarta doar data greşita, ci
//   ia un numar din seria anului inchis.
//
//   CAZURILE 3 SI 4 merg pe drumurile reale, prin ecran, si cer ca ziua stampilata sa fie
//   cea de la Chisinau citita in Node, in aceeasi clipa. Cand ziua de la Chisinau si cea
//   UTC coincid, aceste cazuri sunt adevarate fara sa fie decisive; jumatatea decisiva
//   este in asertiunile lui 0065, si de aceea cele doua fisiere se citesc impreuna.
//
// FIECARE CAZ ARE PROPRIA SERIE, ca in facturare-data.spec: seria este globala si datele
// de test nu se sterg niciodata, deci doua cazuri pe aceeasi serie ar numara unul peste
// altul si ar depinde si de rularile de ieri. AICI ANUL INTRA IN SERIE, spre deosebire de
// celelalte specificatii de facturare, si trebuie sa intre: fara an, seria nu depinde de
// zi si constatarile G2, G3 si G8 nu ar avea ce sa arate. afterAll pune setarile inapoi pe
// implicitul produsului.
//
// DATELE DE TEST NU SE STERG NICIODATA, conventia P2-07, si nici nu s-ar putea: nu exista
// drept de stergere pe niciuna din cele patru tabele de facturare.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

/** O litera pe caz, ca doua cazuri sa nu ajunga vreodata pe aceeasi serie. */
const CASE = {
  series: "A",
  cancel: "B",
  paidDay: "C",
  backdated: "D",
} as const;

/** Ziua de azi la Chisinau, citita o data pe fisier in Node, cu aceeasi functie pe care o
 *  foloseste si serverul. */
const TODAY = chisinauToday();

/** zz.ll.aaaa, forma pe care o scrie si o citeste casuta de data din P3-49. */
function ro(day: string): string {
  return `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;
}

/** O zi mutata cu `days` zile, pe siruri si pe UTC: un `new Date(sir)` ar fi miezul nopții
 *  UTC, adica ora 2 sau 3 la Chisinau, si ar muta ziua. Aceeasi capcana pe care o descrie
 *  chisinauToday in lib/data/format.ts. */
function shiftDay(day: string, days: number): string {
  const at = new Date(`${day}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error(
      "facturare-chisinau-day.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL, " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY si SUPABASE_SERVICE_ROLE_KEY. In CI sunt exportate de " +
        "pasul 'Export local Supabase credentials'. Local: supabase status -o env.",
    );
  }
  return { origin: new URL(url).origin, anon, service };
}

type Rest = { status: number; ok: boolean; rows: Record<string, unknown>[]; text: string };

let api: APIRequestContext;
let ownerToken = "";

async function rest(
  path: string,
  init: { method?: string; headers: Record<string, string>; body?: unknown },
): Promise<Rest> {
  const response = await api.fetch(`/rest/v1/${path}`, {
    method: init.method ?? "GET",
    headers: { ...init.headers, "Content-Type": "application/json", Prefer: "return=representation" },
    data: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text().catch(() => "");
  let rows: Record<string, unknown>[] = [];
  try {
    const parsed = JSON.parse(text);
    rows = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    rows = [];
  }
  return { status: response.status(), ok: response.ok(), rows, text };
}

const asOwner = (path: string, init: Omit<Parameters<typeof rest>[1], "headers"> = {}) =>
  rest(path, { ...init, headers: { apikey: env().anon, Authorization: `Bearer ${ownerToken}` } });
const asService = (path: string, init: Omit<Parameters<typeof rest>[1], "headers"> = {}) =>
  rest(path, {
    ...init,
    headers: { apikey: env().service, Authorization: `Bearer ${env().service}` },
  });

/** Seria unui caz: prefixul, iar anul il adauga baza. */
function prefixFor(caseLetter: string): string {
  return `TEST-CH${caseLetter}-${RUN}-`;
}

/** Pune prefixul seriei CU anul in numar, cu cheia service_role. */
async function useOwnSeries(caseLetter: string): Promise<string> {
  const prefix = prefixFor(caseLetter);
  const written = await asService("invoice_settings?id=eq.true", {
    method: "PATCH",
    body: { series_prefix: prefix, number_includes_year: true },
  });
  expect(written.ok, `prefixul nu a putut fi pus pe ${prefix}: ${written.text}`).toBe(true);
  return prefix;
}

/** Seria pe care o calculeaza BAZA pentru o zi, prin calea pe care merge si un ecran. */
async function seriesForDay(day: string | null): Promise<string> {
  const asked = await asOwner("rpc/invoice_series_for", { method: "POST", body: { p_on: day } });
  expect(asked.ok, `invoice_series_for a raspuns ${asked.status}: ${asked.text}`).toBe(true);
  return String(asked.rows[0] ?? "");
}

type StoredInvoice = {
  status: string;
  series: string | null;
  number: number | null;
  issueDate: string | null;
  paidAt: string | null;
};

async function readInvoice(id: string): Promise<StoredInvoice> {
  const got = await asOwner(`invoices?select=status,series,number,issue_date,paid_at&id=eq.${id}`);
  expect(got.rows, `exact o factura pentru ${id}`).toHaveLength(1);
  const row = got.rows[0]!;
  return {
    status: String(row.status),
    series: (row.series as string | null) ?? null,
    number: row.number === null ? null : Number(row.number),
    issueDate: (row.issue_date as string | null) ?? null,
    paidAt: (row.paid_at as string | null) ?? null,
  };
}

let clientId = "";
let productId = "";

async function firstCategoryId(): Promise<string> {
  const rows = await asService("categories?select=id&limit=1");
  expect(rows.ok, `categoriile nu au putut fi citite: ${rows.text}`).toBe(true);
  expect(rows.rows.length, "nu exista nicio categorie, deci nu se poate scrie un produs").
    toBeGreaterThan(0);
  return String(rows.rows[0]!.id);
}

/** O ciorna cu o linie, scrisa direct: ce se probeaza aici nu este formularul. */
async function seedDraft(): Promise<string> {
  const created = await asOwner("invoices?select=id", {
    method: "POST",
    body: { client_id: clientId },
  });
  expect(created.ok, `ciorna nu a putut fi creata: ${created.text}`).toBe(true);
  const id = String(created.rows[0]!.id);

  const line = await asOwner("invoice_lines?select=id", {
    method: "POST",
    body: {
      invoice_id: id,
      product_id: productId,
      description: `Linie P3-115 ${RUN}`,
      quantity: 1,
      unit: "pcs",
      unit_price_mdl: 100,
      vat_rate: 20,
    },
  });
  expect(line.ok, `linia nu a putut fi adaugata: ${line.text}`).toBe(true);
  return id;
}

test.describe("Facturare, ziua de la Chișinău și ziua plății", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeAll(async () => {
    const { origin, anon } = env();
    api = await request.newContext({ baseURL: origin });

    const owner = ownerAccount();
    const token = await api.post("/auth/v1/token?grant_type=password", {
      headers: { apikey: anon, "Content-Type": "application/json" },
      data: { email: owner.email, password: owner.password },
    });
    expect(token.ok(), `autentificarea API a raspuns ${token.status()}`).toBe(true);
    ownerToken = ((await token.json()) as { access_token: string }).access_token;

    const client = await asOwner("clients?select=id", {
      method: "POST",
      body: { name: `TEST Client Chisinau ${RUN}`, active: true },
    });
    expect(client.ok, `clientul de test nu a putut fi creat: ${client.text}`).toBe(true);
    clientId = String(client.rows[0]!.id);

    const product = await asService("products?select=id", {
      method: "POST",
      body: {
        sku: `TEST-CH-${RUN}`,
        name: `TEST Produs Chisinau ${RUN}`,
        category_id: await firstCategoryId(),
        unit: "pcs",
        unit_value_mdl: 100,
        active: true,
      },
    });
    expect(product.ok, `produsul de test nu a putut fi creat: ${product.text}`).toBe(true);
    productId = String(product.rows[0]!.id);
  });

  test.afterAll(async () => {
    // Setarile inapoi pe implicitul produsului, ca nicio alta specificatie si nicio rulare
    // urmatoare sa nu porneasca de la o serie de test.
    await asService("invoice_settings?id=eq.true", {
      method: "PATCH",
      body: { series_prefix: "RC-", number_includes_year: true },
    });
    await api.dispose();
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page, ownerAccount());
  });

  // -------------------------------------------------------------------------
  // 1. Ziua de la Chisinau si ziua UTC sunt zile diferite, si se vede pe instantul
  //    pe care raportul il numeste. FARA BAZA DE DATE.
  // -------------------------------------------------------------------------
  test("1. la 22:30 UTC pe 31 decembrie ziua de la Chișinău este deja 1 ianuarie, și cele două cad în ani diferiți", async () => {
    // CEASUL SE FIXEAZA PRIN MOMENT, SI NU PRIN CEAS. Instantul este scris aici, deci
    // cazul este determinist la orice ora a zilei si pe orice masina. `chisinauDateOf`
    // este chiar functia pe care o foloseste aplicatia, scrisa de cardul P3-90 pentru
    // exact aceasta problema.
    const boundary = "2026-12-31T22:30:00Z";
    expect(boundary.slice(0, 10), "ziua UTC a instantului").toBe("2026-12-31");
    expect(chisinauDateOf(boundary), "ziua de la Chisinau a aceluiasi instant").toBe("2027-01-01");
    expect(
      chisinauDateOf(boundary).slice(0, 4),
      "anii celor doua zile sunt diferiti, si de aici vine seria greşită",
    ).not.toBe(boundary.slice(0, 4));

    // IARNA ESTE +2 SI VARA ESTE +3, deci regula nu este o intamplare a unui singur
    // decalaj: la 21:30 UTC pe 30 iunie este deja 1 iulie la Chisinau.
    expect(chisinauDateOf("2027-06-30T21:30:00Z"), "vara, la +3").toBe("2027-07-01");
    expect(chisinauDateOf("2027-06-30T20:30:00Z"), "o ora mai devreme, tot 30 iunie").toBe(
      "2027-06-30",
    );

    // SI SUB PRAG NU SE MUTA NIMIC, care este jumatatea care arata ca functia nu adauga
    // pur si simplu o zi: la 21:30 UTC pe 31 decembrie este 23:30, tot pe 31.
    expect(chisinauDateOf("2026-12-31T21:30:00Z"), "iarna, cu o ora inainte de prag").toBe(
      "2026-12-31",
    );
  });

  // -------------------------------------------------------------------------
  // 2. Doua zile in doi ani sunt doua serii, si o emitere fara nicio zi cade pe ziua
  //    de la Chisinau.
  // -------------------------------------------------------------------------
  test("2. două zile din ani diferiți dau două serii diferite, iar o emitere fără nicio zi cade pe ziua de la Chișinău", async () => {
    const prefix = await useOwnSeries(CASE.series);

    // CONSECINTA, CERUTA BAZEI. Ziua nu decide doar data scrisa pe document: ea decide
    // prin public.invoice_series_for din ce serie legala vine numarul.
    expect(await seriesForDay("2026-12-31"), "31 decembrie 2026").toBe(`${prefix}2026`);
    expect(await seriesForDay("2027-01-01"), "1 ianuarie 2027").toBe(`${prefix}2027`);
    expect(
      await seriesForDay("2026-12-31"),
      "cele doua zile NU dau aceeasi serie, deci diferenta conteaza",
    ).not.toBe(await seriesForDay("2027-01-01"));

    // SI CADEREA BAZEI ESTE ZIUA DE LA CHISINAU. Pana la migratia 0065, `p_on` null cadea
    // pe `current_date`, adica pe ziua UTC a serverului.
    expect(await seriesForDay(null), "seria pentru o zi nespusa").toBe(
      await seriesForDay(TODAY),
    );

    // O EMITERE FARA NICIO ZI, care este chiar drumul pe care mergea anularea unei ciorne.
    const invoiceId = await seedDraft();
    const issued = await asOwner("rpc/issue_invoice", {
      method: "POST",
      body: { p_invoice_id: invoiceId, p_issue_date: null, p_due_date: null },
    });
    expect(issued.ok, `emiterea a raspuns ${issued.status}: ${issued.text}`).toBe(true);

    const stored = await readInvoice(invoiceId);
    expect(stored.issueDate, "ziua stampilata este ziua de la Chisinau").toBe(TODAY);
    expect(stored.series, "si seria este a acelei zile").toBe(`${prefix}${TODAY.slice(0, 4)}`);

    // CA NU ESTE ZIUA SERVERULUI se dovedeste DECISIV in
    // scripts/poc-free/local-db/assertions/0065_invoice_chisinau_day_and_paid_date.sql,
    // secțiunea 3b, care mută fusul SESIUNII intr-o zona unde `current_date` este provabil
    // o alta zi calendaristica si cere ca raspunsul sa rămână cel de la Chisinau. Aici cele
    // doua coincid in cea mai mare parte a zilei, deci asertiunea de mai sus este adevarata
    // fara sa fie decisiva, si asta se scrie in loc sa se pretinda altceva.
  });

  // -------------------------------------------------------------------------
  // 3. Anularea unei ciorne, prin ecran: ziua si seria sunt cele de la Chisinau.
  // -------------------------------------------------------------------------
  test("3. anularea unei ciorne o emite pe ziua de la Chișinău, în seria acelei zile", async ({
    page,
  }) => {
    const prefix = await useOwnSeries(CASE.cancel);
    const invoiceId = await seedDraft();

    // O CIORNA NU ARE NICIO ZI DE EMITERE, care este chiar premisa constatarii G2.
    expect((await readInvoice(invoiceId)).issueDate, "o ciorna nu are zi de emitere").toBeNull();

    await page.goto(`/facturare/${invoiceId}`);
    await expect(page.getByTestId("factura-stare")).toHaveText(invoiceStatusLabel("draft"), {
      timeout: 25_000,
    });

    // Confirmarea spune ca ciorna va primi un numar, care este consecinta pe care
    // operatorul are dreptul sa o stie inainte.
    await page.getByTestId("factura-anuleaza").click();
    await expect(page.getByTestId("factura-anuleaza-confirmare")).toBeVisible();
    const reason = `Anulare de test P3-115 ${RUN}`;
    await page.getByTestId("factura-anuleaza-motiv").fill(reason);
    await page.getByTestId("factura-anuleaza-da").click();
    await expect(page.getByTestId("factura-stare")).toHaveText(invoiceStatusLabel("cancelled"), {
      timeout: 25_000,
    });

    const stored = await readInvoice(invoiceId);
    expect(stored.status, "ciorna este anulata").toBe("cancelled");
    expect(stored.number, "si poarta un numar, fiindca nicio stare peste ciorna nu poate fi fara").
      not.toBeNull();
    // AICI ERA DEFECTUL: `cancelInvoice` emitea cu un sir gol, care devenea null, care cadea
    // pe ziua UTC a serverului.
    expect(stored.issueDate, "ziua de emitere este ziua de la Chisinau").toBe(TODAY);
    expect(stored.series, "si seria este a acelei zile, nu a anului inchis").toBe(
      `${prefix}${TODAY.slice(0, 4)}`,
    );
  });

  // -------------------------------------------------------------------------
  // 4. Ziua plății: nu inainte de ziua emiterii, nu in viitor, si una buna se salveaza.
  // -------------------------------------------------------------------------
  test("4. ziua plății nu poate fi înainte de ziua emiterii și nu poate fi în viitor, iar una bună se salvează", async ({
    page,
  }) => {
    await useOwnSeries(CASE.paidDay);
    const invoiceId = await seedDraft();

    // Emisa CHIAR AZI, ca "ieri" sa fie inainte de ziua emiterii si "mâine" sa fie in
    // viitor: amandoua refuzurile se probeaza pe aceeasi factura.
    const issued = await asOwner("rpc/issue_invoice", {
      method: "POST",
      body: { p_invoice_id: invoiceId, p_issue_date: TODAY, p_due_date: null },
    });
    expect(issued.ok, `emiterea a raspuns ${issued.status}: ${issued.text}`).toBe(true);

    await page.goto(`/facturare/${invoiceId}`);
    await expect(page.getByTestId("factura-stare")).toHaveText(invoiceStatusLabel("issued"), {
      timeout: 25_000,
    });
    await page.getByTestId("factura-platita").click();
    await expect(page.getByTestId("factura-platita-confirmare")).toBeVisible();

    // Casuta se deschide pe ziua de azi, ceea ce era deja corect.
    const box = page.getByTestId("factura-platita-data");
    await expect(box).toHaveValue(ro(TODAY));

    // --- IERI: INAINTE DE ZIUA EMITERII, REFUZAT CU PROPOZITIA ROMANEASCA ----
    await box.fill(ro(shiftDay(TODAY, -1)));
    await page.getByTestId("factura-platita-da").click();
    const error = page.getByTestId("factura-eroare");
    await expect(error, "ecranul spune de ce nu").toBeVisible({ timeout: 20_000 });
    await expect(error).toContainText("înainte de ziua emiterii");
    await expect(error, "si spune care este ziua emiterii").toContainText(ro(TODAY));
    // SI NIMIC NU S-A SCRIS.
    let stored = await readInvoice(invoiceId);
    expect(stored.status, "factura a rămas emisa").toBe("issued");
    expect(stored.paidAt, "si nu are nicio zi de plata").toBeNull();

    // --- MAINE: IN VIITOR, REFUZAT --------------------------------------------
    await box.fill(ro(shiftDay(TODAY, 1)));
    await page.getByTestId("factura-platita-da").click();
    await expect(error).toBeVisible({ timeout: 20_000 });
    await expect(error).toContainText("în viitor");
    stored = await readInvoice(invoiceId);
    expect(stored.status, "factura a rămas emisa si dupa a doua incercare").toBe("issued");
    expect(stored.paidAt).toBeNull();

    // --- AZI: SE SALVEAZA, care este martorul ---------------------------------
    // Fara el, cele doua refuzuri ar trece si daca ecranul ar refuza orice zi.
    await box.fill(ro(TODAY));
    await page.getByTestId("factura-platita-da").click();
    await expect(page.getByTestId("factura-stare")).toHaveText(invoiceStatusLabel("paid"), {
      timeout: 25_000,
    });
    stored = await readInvoice(invoiceId);
    expect(stored.status, "factura este plătită").toBe("paid");
    expect(stored.paidAt, "si ziua plății este scrisa").not.toBeNull();
    expect(
      chisinauDateOf(stored.paidAt!),
      "ziua plății, citita la Chisinau, este ziua pe care a ales-o operatorul",
    ).toBe(TODAY);

    // --- SI BAZA REFUZA ACELEASI DOUA ZILE, fara nicio pagina in cale ---------
    // Ecranul este o politete; garantia este declansatorul din migratia 0065. Cererea merge
    // direct la PostgREST, pe o factura noua, fiindca cea de mai sus este deja plătită.
    const second = await seedDraft();
    const issuedSecond = await asOwner("rpc/issue_invoice", {
      method: "POST",
      body: { p_invoice_id: second, p_issue_date: TODAY, p_due_date: null },
    });
    expect(issuedSecond.ok, `emiterea a raspuns ${issuedSecond.status}`).toBe(true);

    for (const [what, at] of [
      ["inainte de ziua emiterii", `${shiftDay(TODAY, -1)}T12:00:00Z`],
      ["in viitor", `${shiftDay(TODAY, 2)}T12:00:00Z`],
    ] as const) {
      const refused = await asOwner(`invoices?id=eq.${second}`, {
        method: "PATCH",
        body: { status: "paid", paid_at: at },
      });
      expect(refused.ok, `baza a ACCEPTAT o zi de plata ${what}: ${refused.text}`).toBe(false);
      expect((await readInvoice(second)).status, `factura nu s-a mișcat (${what})`).toBe("issued");
    }
  });

  // -------------------------------------------------------------------------
  // 5. G8: o factura antedatata intr-un alt an nu mai arata un numar din seria de azi.
  // -------------------------------------------------------------------------
  test("5. cu data de emitere mutată în alt an, confirmarea nu mai numește niciun număr", async ({
    page,
  }) => {
    const prefix = await useOwnSeries(CASE.backdated);

    // O ciorna scrisa de mana, ca sa existe casuta Data emiterii pe ecran.
    const invoiceId = await seedDraft();
    await page.goto(`/facturare/${invoiceId}/modifica`);
    await expect(page.getByTestId("factura-editor")).toBeVisible({ timeout: 25_000 });

    const box = page.getByTestId("factura-editor-data-emiterii");
    await expect(box, "casuta se deschide pe ziua de la Chisinau").toHaveValue(ro(TODAY));

    // --- PE ZIUA DE AZI: CONFIRMAREA NUMESTE UN NUMAR, din seria de azi -------
    await page.getByTestId("factura-editor-emite").click();
    const ask = page.getByTestId("factura-editor-emite-confirmare");
    await expect(ask).toBeVisible();
    const thisYear = `${prefix}${TODAY.slice(0, 4)}`;
    await expect(ask, "numarul numit este din seria zilei alese").toContainText(thisYear);
    // SI NU ESTE DAT CA FAPT, care este cealalta jumatate a constatarii G8.
    await expect(ask).toContainText("dacă nimeni nu emite înaintea ta");

    // --- MUTATA IN ALT AN: NICIUN NUMAR NU MAI ESTE NUMIT --------------------
    // AICI ERA DEFECTUL: prezicerea era facuta intotdeauna pentru seria de AZI, deci o
    // factură antedatata arata un numar din contorul unui an si primea unul din contorul
    // altuia. Ecranul calculeaza acum seria zilei alese si, cand nu mai este cea prezisa, nu
    // numeste niciun numar: raportul insusi spune ca a renunța la numar este reparatia
    // acceptabila, si amandoua ecranele aveau deja ramura pentru un numar lipsa.
    const otherYear = `${Number(TODAY.slice(0, 4)) - 1}-12-15`;
    await page.getByTestId("factura-editor-emite-renunta").click();
    await box.fill(ro(otherYear));
    await page.getByTestId("factura-editor-emite").click();
    await expect(ask).toBeVisible();
    await expect(ask, "niciun numar din seria anului curent").not.toContainText(thisYear);
    await expect(ask, "si niciun numar deloc, nici din seria anului ales").not.toContainText(
      `${prefix}${otherYear.slice(0, 4)}`,
    );
    // Propozitia rămâne insa completa si spune ce se intampla.
    await expect(ask).toContainText("numărul următor din serie");
    await expect(ask).toContainText("nu se mai poate modifica");

    // --- SI NUMARUL CHIAR ALOCAT ESTE DIN SERIA ZILEI ALESE -----------------
    await page.getByTestId("factura-editor-emite-da").click();
    await expect(page).toHaveURL(/\/facturare\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    const stored = await readInvoice(invoiceId);
    expect(stored.status, "factura este emisa").toBe("issued");
    expect(stored.issueDate, "pe ziua aleasa").toBe(otherYear);
    expect(stored.series, "in seria acelei zile, pe care baza o calculeaza").toBe(
      `${prefix}${otherYear.slice(0, 4)}`,
    );
  });
});
