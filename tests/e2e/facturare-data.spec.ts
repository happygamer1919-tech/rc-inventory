import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { managerAccount, ownerAccount, type TestAccount } from "./support/accounts";

// facturare-data.spec - linia de acceptanta a cardului P3-108, goal G65 partea 1,
// jumatatea care are nevoie de o baza de date reala.
//
// CE DOVEDESTE AICI SI NU IN ASERTIUNI. Fisierul
// scripts/poc-free/local-db/assertions/0063_invoices.sql dovedeste tot ce se poate
// dovedi intr-o singura sesiune psql: forma, restrictiile, numerele consecutive,
// regula ciornei, pretul ingheat si cine are voie. Ce NU poate dovedi este
// SIMULTANEITATEA: doi operatori care apasa Emite in aceeasi clipa sunt doua
// sesiuni de baza de date, iar o singura sesiune nu poate fi doua. Cazul 2 de mai
// jos trimite CINCI apeluri PostgREST in paralel, adica cinci sesiuni, si acela
// este singurul loc din acest card unde blocajul este chiar pus la incercare.
//
// Restul cazurilor repeta pe stiva reala, prin PostgREST si cu jetoane adevarate,
// refuzurile pe care asertiunile le arata pe un postgres gol. Nu este o dublare
// degeaba: un refuz care vine dintr-un declansator se vede altfel prin PostgREST
// (un 4xx cu mesaj) decat intr-un bloc plpgsql, iar ecranele partilor 2 si 3 vor
// vedea exact forma de aici.
//
// FIECARE CAZ ARE PROPRIA SERIE. public.issue_invoice calculeaza seria din setari,
// iar seria este globala, deci doua cazuri care ar folosi aceeasi serie ar numara
// unul peste altul si ar depinde si de rularile de ieri, fiindca datele de test nu
// se sterg niciodata. Inainte de fiecare caz prefixul seriei este pus pe o valoare
// proprie cazului si rularii, cu cheia service_role, si anul este scos din numar ca
// seria sa fie exact prefixul. Aceasta este exact regula pe care o numeste P3-101:
// o valoare pe care logica o CAUTA in toata tabela are nevoie de unicitate pe
// rulare SI pe caz. afterAll pune prefixul inapoi pe RC-.
//
// DATELE DE TEST NU SE STERG NICIODATA, conventia P2-07, si nici nu s-ar putea:
// nu exista drept de stergere pe niciuna din cele patru tabele. Facturile create
// aici rama pe loc, cele anulate rama anulate.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

/** O cifra pe caz, ca doua cazuri sa nu ajunga vreodata pe aceeasi serie. */
const CASE = {
  numbering: "1",
  concurrent: "2",
  draftOnly: "3",
  frozenPrice: "4",
  access: "5",
  // P3-111, goal G67. Cazurile 6 pana la 9 sunt gaurile pe care raportul
  // docs/reports/2026-09-29-critic-bug-sweep-2.md le-a gasit: G1 si G16 (starea si
  // stampilele), G5 (o singura factura vie pe Iesire) si G6 (o salvare care cade nu
  // lasa nimic in urma). Gaura de acoperire G9, doua emiteri simultane ale ACELEIASI
  // ciorne, este pusa in cazul 2, lângă proba lui, si nu intr-un caz nou: este acelasi
  // blocaj, pe o singura factura in loc de cinci.
  pipeline: "6",
  stamps: "7",
  perIssue: "8",
  atomic: "9",
} as const;

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error(
      "facturare-data.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY si " +
        "SUPABASE_SERVICE_ROLE_KEY. In CI sunt exportate de pasul 'Export local Supabase credentials'. " +
        "Local: supabase status -o env.",
    );
  }
  return { origin: new URL(url).origin, anon, service };
}

function serviceHeaders() {
  const { service } = env();
  return { apikey: service, Authorization: `Bearer ${service}` };
}

function userHeaders(token: string) {
  return { apikey: env().anon, Authorization: `Bearer ${token}` };
}

/** Jetonul unui cont, exact cel pe care il are un browser autentificat. */
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

/* ----------------------------------------------- API-ul bazei de date -- */

type Rest = { status: number; ok: boolean; rows: Record<string, unknown>[]; text: string };

async function rest(
  path: string,
  init: { method?: string; headers: Record<string, string>; body?: unknown } = { headers: {} },
): Promise<Rest> {
  const response = await fetch(`${env().origin}/rest/v1/${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...init.headers,
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
  return { status: response.status, ok: response.ok, rows, text };
}

const asService = (path: string, init: Omit<Parameters<typeof rest>[1], "headers"> = {}) =>
  rest(path, { ...init, headers: serviceHeaders() });
const asUser = (token: string, path: string, init: Omit<Parameters<typeof rest>[1], "headers"> = {}) =>
  rest(path, { ...init, headers: userHeaders(token) });

/* ----------------------------------------------------------- setarile -- */

/** Pune prefixul seriei, cu cheia service_role: ce se probeaza aici este
 *  numerotarea si nu ecranul de setari, care are propria specificatie. */
async function setSeriesPrefix(prefix: string, withYear: boolean): Promise<void> {
  const written = await asService("invoice_settings?id=eq.true", {
    method: "PATCH",
    body: { series_prefix: prefix, number_includes_year: withYear },
  });
  expect(written.ok, `prefixul seriei nu a putut fi pus pe ${prefix}: ${written.text}`).toBe(true);
}

/** Seria unica a unui caz. Anul este scos din numar, deci seria ESTE prefixul. */
function seriesFor(caseDigit: string): string {
  return `TEST-F${caseDigit}-${RUN}-`;
}

/** Pune seria cazului si verifica ce serie calculeaza BAZA pentru ea.
 *
 *  Intrebarea merge cu jetonul unui cont, nu cu cheia service_role: migratia
 *  acorda execute pe public.invoice_series_for lui authenticated si il revoca de
 *  la public, deci calea probata aici este chiar calea pe care va merge un ecran. */
async function useOwnSeries(caseDigit: string, token: string): Promise<string> {
  const series = seriesFor(caseDigit);
  await setSeriesPrefix(series, false);
  const asked = await asUser(token, "rpc/invoice_series_for", {
    method: "POST",
    body: { p_on: "2026-06-01" },
  });
  expect(asked.ok, `invoice_series_for a raspuns ${asked.status}: ${asked.text}`).toBe(true);
  expect(String(asked.rows[0] ?? ""), "seria calculata de baza este chiar prefixul").toBe(series);
  return series;
}

/* ----------------------------------------------------------- fixturi -- */

let clientId = "";
let projectId = "";
let categoryId = "";

/** O categorie care exista deja, ca sa se poata scrie un produs de test.
 *
 *  DEPINDE DE STARE VIE SI SPUNE ASTA TARE. Migratia 0049 incarca optzeci de
 *  materiale, deci exista categorii; daca vreodata nu exista, cazul cade cu
 *  propoziția de mai jos si nu cu o eroare de cheie straina de nedescifrat. */
async function anyCategoryId(): Promise<string> {
  const rows = await asService("categories?select=id&limit=1");
  expect(rows.ok, `categoriile nu au putut fi citite: ${rows.text}`).toBe(true);
  expect(
    rows.rows.length,
    "nu exista nicio categorie in baza, deci nu se poate scrie un produs de test",
  ).toBeGreaterThan(0);
  return String(rows.rows[0]!.id);
}

async function newInvoice(token: string, extra: Record<string, unknown> = {}): Promise<string> {
  const created = await asUser(token, "invoices?select=id", {
    method: "POST",
    body: { client_id: clientId, project_id: projectId, ...extra },
  });
  expect(created.ok, `ciorna nu a putut fi creata: ${created.status} ${created.text}`).toBe(true);
  return String(created.rows[0]!.id);
}

async function addLine(
  token: string,
  invoiceId: string,
  line: Record<string, unknown>,
): Promise<Rest> {
  return asUser(token, "invoice_lines?select=id", {
    method: "POST",
    body: {
      invoice_id: invoiceId,
      quantity: 1,
      unit: "pcs",
      unit_price_mdl: 10,
      vat_rate: 20,
      description: "Linie de test",
      ...line,
    },
  });
}

async function issue(token: string, invoiceId: string, on = "2026-06-01"): Promise<Rest> {
  return asUser(token, "rpc/issue_invoice", {
    method: "POST",
    body: { p_invoice_id: invoiceId, p_issue_date: on, p_due_date: null },
  });
}

/* --------------------------------------------- P3-111, cardul G67 -- */

/** O linie in forma pe care o citeste public.save_invoice_draft din migratia 0064. */
function rpcLine(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "",
    product_id: null,
    description: "Linie de test P3-111",
    unit: "pcs",
    quantity: 1,
    unit_price_mdl: 10,
    vat_rate: 20,
    ...extra,
  };
}

/** public.save_invoice_draft, chemata exact cum o cheama saveInvoiceDraft. */
async function saveDraft(token: string, body: Record<string, unknown>): Promise<Rest> {
  return asUser(token, "rpc/save_invoice_draft", {
    method: "POST",
    body: {
      p_invoice_id: null,
      p_project_id: null,
      p_outbound_issue_id: null,
      p_due_date: null,
      p_notes: null,
      ...body,
    },
  });
}

/** Contorul unei serii, adica numarul pe care il va lua urmatoarea emitere. */
async function counterOf(token: string, series: string): Promise<number> {
  const got = await asUser(
    token,
    `invoice_number_series?select=next_number&series=eq.${encodeURIComponent(series)}`,
  );
  expect(got.rows, `contorul seriei ${series} este citibil`).toHaveLength(1);
  return Number(got.rows[0]!.next_number);
}

/** O Iesire scrisa direct, fiindca ce se probeaza aici este indexul de pe partea
 *  facturii si nu lantul de stoc al unei iesiri reale. Referinta are un prefix
 *  propriu, `IES-TEST-`, si nu formatul aplicatiei `IES-AAAA-NNNN`: o referinta de
 *  test in formatul acela ar muta numaratorul aplicatiei. */
async function newOutboundIssue(label: string): Promise<string> {
  const created = await asService("outbound_issues?select=id", {
    method: "POST",
    body: { reference: `IES-TEST-P3-111-${RUN}-${label}`, project_id: projectId },
  });
  expect(created.ok, `iesirea de test nu a putut fi creata: ${created.text}`).toBe(true);
  return String(created.rows[0]!.id);
}

/** Un client propriu unui caz, cand cazul numara randurile unui client. */
async function newClient(token: string, label: string): Promise<string> {
  const created = await asUser(token, "clients?select=id", {
    method: "POST",
    body: { name: `TEST Facturare P3-111 ${label} ${RUN}` },
  });
  expect(created.ok, `clientul de test nu a putut fi creat: ${created.text}`).toBe(true);
  return String(created.rows[0]!.id);
}

/** Cate facturi are un client acum. */
async function invoiceCount(token: string, forClient: string): Promise<number> {
  const got = await asUser(token, `invoices?select=id&client_id=eq.${forClient}`);
  expect(got.ok, `facturile clientului nu au putut fi citite: ${got.text}`).toBe(true);
  return got.rows.length;
}

/** Id-ul de auth al unui cont, citit din profiles cu cheia service_role: cazul 7 are
 *  nevoie de el ca sa scrie paid_by cat timp coloana este inca null. */
async function profileIdOf(email: string): Promise<string> {
  const got = await asService(`profiles?select=id&email=eq.${encodeURIComponent(email)}`);
  expect(got.rows, `profilul ${email} exista`).toHaveLength(1);
  return String(got.rows[0]!.id);
}

async function readInvoice(token: string, invoiceId: string): Promise<Record<string, unknown>> {
  const got = await asUser(
    token,
    `invoices?select=id,series,number,status,total_mdl,subtotal_mdl,vat_total_mdl,notes,issued_at,cancelled_at,cancel_reason&id=eq.${invoiceId}`,
  );
  expect(got.ok, `factura nu a putut fi citita: ${got.text}`).toBe(true);
  expect(got.rows, `exact o factura pentru ${invoiceId}`).toHaveLength(1);
  return got.rows[0]!;
}

function numberOf(row: Record<string, unknown>): number {
  return Number(row.number);
}

test.describe("Facturare, partea 1: numerotarea, regula ciornei, prețul înghețat și accesul", () => {
  test.describe.configure({ timeout: 240_000 });

  test.beforeAll(async () => {
    const ownerToken = await accessToken(ownerAccount());
    const client = await asUser(ownerToken, "clients?select=id", {
      method: "POST",
      body: { name: `TEST Facturare ${RUN}` },
    });
    expect(client.ok, `clientul de test nu a putut fi creat: ${client.text}`).toBe(true);
    clientId = String(client.rows[0]!.id);

    const project = await asUser(ownerToken, "projects?select=id", {
      method: "POST",
      body: { client_id: clientId, name: `TEST Șantier Facturare ${RUN}` },
    });
    expect(project.ok, `proiectul de test nu a putut fi creat: ${project.text}`).toBe(true);
    projectId = String(project.rows[0]!.id);

    categoryId = await anyCategoryId();
  });

  test.afterAll(async () => {
    // Prefixul inapoi pe implicitul cardului, ca nicio alta specificatie si nicio
    // rulare urmatoare sa nu porneasca de la o serie de test.
    await setSeriesPrefix("RC-", true);
  });

  test("1. numerele unei serii curg unul după altul, nu se repetă, iar o factură anulată își păstrează numărul", async () => {
    const token = await accessToken(ownerAccount());
    const series = await useOwnSeries(CASE.numbering, token);

    const a = await newInvoice(token);
    const b = await newInvoice(token);
    const c = await newInvoice(token);
    for (const id of [a, b, c]) {
      const line = await addLine(token, id, { quantity: 2, unit_price_mdl: 50 });
      expect(line.ok, `linia nu a putut fi adaugata pe ciorna: ${line.text}`).toBe(true);
    }

    // O ciorna nu are numar: numarul se da numai la Emite.
    expect((await readInvoice(token, a)).number, "o ciornă nu are număr").toBeNull();

    // --- DOUA FACTURI IN ACEEASI SERIE PRIMESC NUMERE CONSECUTIVE ------------
    const issuedA = await issue(token, a);
    expect(issuedA.ok, `prima emitere a raspuns ${issuedA.status}: ${issuedA.text}`).toBe(true);
    const issuedB = await issue(token, b);
    expect(issuedB.ok, `a doua emitere a raspuns ${issuedB.status}: ${issuedB.text}`).toBe(true);

    const rowA = await readInvoice(token, a);
    const rowB = await readInvoice(token, b);
    expect(rowA.series, "seria primei facturi").toBe(series);
    expect(numberOf(rowA), "prima factură a unei serii noi este numărul 1").toBe(1);
    expect(numberOf(rowB), "a doua factură este numărul 2").toBe(2);
    expect(rowA.status).toBe("issued");
    expect(rowA.issued_at, "issued_at este completat de baza de date").not.toBeNull();
    // 2 x 50 = 100, plus 20 la sută, este 120.
    expect(Number(rowA.total_mdl), "totalul calculat de declanșator").toBe(120);

    // --- A DOUA EMITERE A ACELEIASI FACTURI ESTE REFUZATA -------------------
    const again = await issue(token, a);
    expect(again.ok, "o factură deja emisă a fost emisă a doua oară").toBe(false);
    expect(numberOf(await readInvoice(token, a)), "numărul nu s-a schimbat").toBe(1);

    // --- O FACTURA ANULATA ISI PASTREAZA NUMARUL ---------------------------
    const cancelled = await asUser(token, `invoices?id=eq.${b}`, {
      method: "PATCH",
      body: { status: "cancelled", cancel_reason: `Anulată de testul ${RUN}` },
    });
    expect(cancelled.ok, `anularea a raspuns ${cancelled.status}: ${cancelled.text}`).toBe(true);
    const cancelledRow = await readInvoice(token, b);
    expect(numberOf(cancelledRow), "o factură anulată își păstrează numărul").toBe(2);
    expect(cancelledRow.cancelled_at, "cancelled_at este completat").not.toBeNull();
    expect(cancelledRow.issued_at, "anularea nu șterge data emiterii").not.toBeNull();

    // --- SI URMATOAREA EMITERE NU IL REFOLOSESTE --------------------------
    const issuedC = await issue(token, c);
    expect(issuedC.ok, `a treia emitere a raspuns ${issuedC.status}: ${issuedC.text}`).toBe(true);
    expect(
      numberOf(await readInvoice(token, c)),
      "numărul 2 este anulat, deci următoarea factură este 3 și nu 2",
    ).toBe(3);

    // --- CONTORUL SPUNE CE A DAT, SI NIMENI NU IL POATE MUTA -------------
    const counter = await asUser(token, `invoice_number_series?select=next_number&series=eq.${encodeURIComponent(series)}`);
    expect(counter.rows, "contorul seriei este citibil").toHaveLength(1);
    expect(Number(counter.rows[0]!.next_number), "contorul stă pe 4").toBe(4);

    const moved = await asUser(token, `invoice_number_series?series=eq.${encodeURIComponent(series)}`, {
      method: "PATCH",
      body: { next_number: 900 },
    });
    expect(moved.ok, "un cont autentificat a mutat contorul seriei").toBe(false);
    const after = await asUser(token, `invoice_number_series?select=next_number&series=eq.${encodeURIComponent(series)}`);
    expect(Number(after.rows[0]!.next_number), "contorul nu s-a mișcat").toBe(4);
  });

  test("2. cinci emiteri în același moment primesc cinci numere diferite și consecutive", async () => {
    const token = await accessToken(ownerAccount());
    const series = await useOwnSeries(CASE.concurrent, token);

    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const id = await newInvoice(token);
      const line = await addLine(token, id, { quantity: 1, unit_price_mdl: 10 });
      expect(line.ok, `linia nu a putut fi adaugata: ${line.text}`).toBe(true);
      ids.push(id);
    }

    // CINCI APELURI IN PARALEL, deci cinci sesiuni de baza de date. Asta este
    // proba pe care o singura sesiune psql nu o poate da. Daca numarul ar fi
    // calculat citind maximul si adunand unu, fie doua apeluri ar primi acelasi
    // numar si al doilea ar cadea pe restrictia de unicitate, fie ar reusi si ar
    // da acelasi numar de doua ori. Ambele se vad mai jos.
    const results = await Promise.all(ids.map((id) => issue(token, id)));

    const failed = results.filter((r) => !r.ok);
    expect(
      failed.map((r) => `${r.status} ${r.text}`).join(" | "),
      "toate cele cinci emiteri simultane au reușit",
    ).toBe("");

    const numbers: number[] = [];
    for (const id of ids) {
      const row = await readInvoice(token, id);
      expect(row.series, "fiecare factură a căzut în seria cazului").toBe(series);
      numbers.push(numberOf(row));
    }

    expect(new Set(numbers).size, `cinci numere distincte, primite ${numbers.join(",")}`).toBe(5);
    expect(
      [...numbers].sort((x, y) => x - y),
      `cinci numere consecutive de la 1, primite ${numbers.join(",")}`,
    ).toEqual([1, 2, 3, 4, 5]);

    const counter = await asUser(token, `invoice_number_series?select=next_number&series=eq.${encodeURIComponent(series)}`);
    expect(Number(counter.rows[0]!.next_number), "contorul a avansat exact de cinci ori").toBe(6);

    // --- SI ACELASI LUCRU PE O SINGURA CIORNA: DUBLUL CLIC -----------------
    // P3-111, goal G67, gaura de acoperire G9. Cele cinci apeluri de mai sus dovedesc
    // ca cinci ciorne DIFERITE primesc cinci numere diferite. Ce nu dovedea nimic pana
    // acum este ACEEASI ciorna emisa de doua ori in aceeasi clipa, adica dublul clic:
    // cel care pierde INCREMENTEAZA contorul, apoi cade pe `update ... where status =
    // 'draft'`, si incrementul trebuie sa se intoarca odata cu tranzactia lui. Aceea
    // este chiar afirmatia pentru care a fost aleasa o coloana contor si nu o secventa,
    // fiindca nextval nu se intoarce niciodata, si ea se citea pana acum numai din
    // antetul migratiei.
    const one = await newInvoice(token);
    const onlyLine = await addLine(token, one, { quantity: 1, unit_price_mdl: 10 });
    expect(onlyLine.ok, `linia nu a putut fi adaugata: ${onlyLine.text}`).toBe(true);

    const before = await counterOf(token, series);
    expect(before, "contorul inainte de dublul clic").toBe(6);

    const both = await Promise.all([issue(token, one), issue(token, one)]);
    const won = both.filter((r) => r.ok);
    const lost = both.filter((r) => !r.ok);
    expect(
      won.length,
      `exact o emitere a reușit, primite ${both.map((r) => r.status).join(",")}`,
    ).toBe(1);
    expect(lost.length, "exact o emitere a fost refuzată").toBe(1);

    const onlyRow = await readInvoice(token, one);
    expect(onlyRow.status, "factura este emisă").toBe("issued");
    expect(numberOf(onlyRow), "factura poartă numărul 6, adică unul singur").toBe(6);

    expect(
      await counterOf(token, series),
      "contorul a avansat cu EXACT unu: incrementul celui care a pierdut s-a întors cu tranzacția lui",
    ).toBe(7);

    // Si nicio a doua factura nu a aparut cu numarul 6.
    const sixes = await asUser(
      token,
      `invoices?select=id&series=eq.${encodeURIComponent(series)}&number=eq.6`,
    );
    expect(sixes.rows, "numărul 6 este pe exact o factură").toHaveLength(1);
  });

  test("3. baza refuză o modificare pe o factură emisă, plătită sau anulată, și pe liniile ei", async () => {
    const token = await accessToken(managerAccount());
    await useOwnSeries(CASE.draftOnly, token);

    for (const target of ["issued", "paid", "cancelled"] as const) {
      const id = await newInvoice(token);
      const line = await addLine(token, id, { quantity: 2, unit_price_mdl: 40 });
      expect(line.ok, `linia nu a putut fi adaugata pe ciorna: ${line.text}`).toBe(true);
      const lineId = String(line.rows[0]!.id);

      // MARTORUL: cat timp este ciorna, totul se schimba. Un declansator care ar
      // refuza orice ar trece fiecare refuz de mai jos si ar fi greșit.
      const draftEdit = await asUser(token, `invoices?id=eq.${id}`, {
        method: "PATCH",
        body: { notes: "o notă pe ciornă" },
      });
      expect(draftEdit.ok, `o ciornă se editează liber: ${draftEdit.text}`).toBe(true);
      const draftLine = await asUser(token, `invoice_lines?id=eq.${lineId}`, {
        method: "PATCH",
        body: { quantity: 3 },
      });
      expect(draftLine.ok, `linia unei ciorne se editează liber: ${draftLine.text}`).toBe(true);

      const issued = await issue(token, id);
      expect(issued.ok, `emiterea a raspuns ${issued.status}: ${issued.text}`).toBe(true);
      if (target !== "issued") {
        const moved = await asUser(token, `invoices?id=eq.${id}`, {
          method: "PATCH",
          body:
            target === "cancelled"
              ? { status: "cancelled", cancel_reason: "motiv de test" }
              : { status: "paid" },
        });
        expect(moved.ok, `trecerea la ${target} a raspuns ${moved.status}: ${moved.text}`).toBe(true);
      }
      expect((await readInvoice(token, id)).status, `factura este ${target}`).toBe(target);

      const before = await readInvoice(token, id);

      // --- FIECARE MODIFICARE ESTE REFUZATA, DE BAZA, FARA NICIUN ECRAN -----
      for (const [what, body] of [
        ["nota", { notes: "altă notă" }],
        ["proiectul", { project_id: null }],
        ["numărul", { number: 9999 }],
        ["totalul", { total_mdl: 1 }],
      ] as const) {
        const refused = await asUser(token, `invoices?id=eq.${id}`, { method: "PATCH", body });
        expect(refused.ok, `${what} unei facturi ${target} a fost SCHIMBAT`).toBe(false);
        expect(refused.text, `refuzul explică în română de ce (${what}, ${target})`).toContain(
          "nu mai este ciorna",
        );
      }

      // --- SI COLOANA PE CARE ACEST CAZ NU O INCERCA NICIODATA ---------------
      // P3-111, goal G67, gaura de acoperire G10 si defectul G1. Acest caz proba
      // inghetarea PENTRU COLOANELE PE CARE CINEVA S-A GANDIT SA LE SCRIE, iar
      // `{"status":"draft"}` nu era una din ele. Era permis, si o data ce randul
      // redevenea ciornă declansatorul se intorcea inainte sa compare orice, deci
      // deschidea din nou exact cele patru coloane pe care acest caz le-a inchis mai
      // sus, plus numarul, seria, clientul, datele si liniile.
      const backToDraft = await asUser(token, `invoices?id=eq.${id}`, {
        method: "PATCH",
        body: { status: "draft" },
      });
      expect(backToDraft.ok, `o factură ${target} a fost împinsă înapoi la ciornă`).toBe(false);
      expect(backToDraft.text, `refuzul explică în română de ce (starea, ${target})`).toContain(
        "nu se mai intoarce niciodata la ciorna",
      );
      expect(
        (await readInvoice(token, id)).status,
        `factura a rămas ${target} după refuz`,
      ).toBe(target);

      for (const [what, body] of [
        ["cantitatea", { quantity: 99 }],
        ["prețul", { unit_price_mdl: 1 }],
      ] as const) {
        const refused = await asUser(token, `invoice_lines?id=eq.${lineId}`, { method: "PATCH", body });
        expect(refused.ok, `${what} unei linii de factură ${target} a fost SCHIMBAT`).toBe(false);
        expect(refused.text, `refuzul explică în română de ce (${what}, ${target})`).toContain(
          "nu mai este ciorna",
        );
      }

      // JUMATATEA MAI MARE: o linie NOUA pe o factura care nu mai este ciorna.
      const added = await addLine(token, id, { description: "Linie strecurată" });
      expect(added.ok, `o linie a fost ADĂUGATĂ pe o factură ${target}`).toBe(false);
      expect(added.text, "refuzul adăugării explică în română de ce").toContain("nu mai este ciorna");

      // Nimic nu s-a mișcat.
      const after = await readInvoice(token, id);
      expect(after.notes, "nota a rămas cea de dinainte").toBe(before.notes);
      expect(Number(after.total_mdl), "totalul a rămas cel de dinainte").toBe(Number(before.total_mdl));
      expect(numberOf(after), "numărul a rămas cel de dinainte").toBe(numberOf(before));

      // CE RAMANE POSIBIL DUPA CIORNA, ca declansatorul sa nu fie un perete.
      if (target === "issued") {
        const paid = await asUser(token, `invoices?id=eq.${id}`, {
          method: "PATCH",
          body: { status: "paid" },
        });
        expect(paid.ok, `o factură emisă poate fi marcată plătită: ${paid.text}`).toBe(true);
      }
    }
  });

  test("4. prețul de pe o linie nu se schimbă când se schimbă prețul din catalog", async () => {
    const token = await accessToken(ownerAccount());
    await useOwnSeries(CASE.frozenPrice, token);

    // UN PRODUS PROPRIU CAZULUI, fiindca acest caz MUTA un preț de catalog si nu
    // are voie sa mute preturile pe care le verifica alte specificatii.
    // active: false, ca inventarul, tabloul de bord si fiecare formular care
    // alege un produs sa numere exact ce numarau: linia are nevoie de randul
    // produsului, nu de vizibilitatea lui.
    const sku = `TEST-FACT-PRET-${RUN}`;
    const product = await asService("products?select=id", {
      method: "POST",
      body: {
        sku,
        name: `TEST Produs facturare ${RUN}`,
        category_id: categoryId,
        unit: "pcs",
        unit_value_mdl: 100,
        active: false,
      },
    });
    expect(product.ok, `produsul de test nu a putut fi creat: ${product.text}`).toBe(true);
    const productId = String(product.rows[0]!.id);

    const id = await newInvoice(token);
    const line = await addLine(token, id, {
      product_id: productId,
      description: null,
      quantity: 4,
      unit_price_mdl: 100,
      vat_rate: 20,
    });
    expect(line.ok, `linia nu a putut fi adaugata: ${line.text}`).toBe(true);
    const lineId = String(line.rows[0]!.id);

    const issued = await issue(token, id, "2026-03-01");
    expect(issued.ok, `emiterea a raspuns ${issued.status}: ${issued.text}`).toBe(true);
    // 4 x 100 = 400, plus 20 la sută, este 480.
    expect(Number((await readInvoice(token, id)).total_mdl), "totalul la emitere").toBe(480);

    // CATALOGUL SE MUTA.
    const moved = await asService(`products?id=eq.${productId}`, {
      method: "PATCH",
      body: { unit_value_mdl: 130 },
    });
    expect(moved.ok, `prețul din catalog nu a putut fi mutat: ${moved.text}`).toBe(true);
    const catalogue = await asService(`products?select=unit_value_mdl&id=eq.${productId}`);
    expect(
      Number(catalogue.rows[0]!.unit_value_mdl),
      "prețul din catalog s-a mutat, altfel acest caz nu dovedește nimic",
    ).toBe(130);

    // SI LINIA NU.
    const frozen = await asUser(token, `invoice_lines?select=unit_price_mdl,line_total_mdl&id=eq.${lineId}`);
    expect(Number(frozen.rows[0]!.unit_price_mdl), "prețul de pe linie a rămas cel din martie").toBe(100);
    expect(Number(frozen.rows[0]!.line_total_mdl), "totalul liniei a rămas cel din martie").toBe(480);
    expect(Number((await readInvoice(token, id)).total_mdl), "totalul facturii a rămas 480").toBe(480);
  });

  test("5. un operator activ scrie, un cont fără profil activ nu, și nimeni nu poate șterge", async () => {
    const ownerToken = await accessToken(ownerAccount());
    await useOwnSeries(CASE.access, ownerToken);

    // --- UN OPERATOR ACTIV SCRIE SI EMITE ---------------------------------
    const operatorToken = await accessToken(managerAccount());
    const id = await newInvoice(operatorToken);
    const line = await addLine(operatorToken, id, { quantity: 1, unit_price_mdl: 25 });
    expect(line.ok, `un operator activ nu a putut adăuga o linie: ${line.text}`).toBe(true);
    const issued = await issue(operatorToken, id);
    expect(issued.ok, `un operator activ nu a putut emite: ${issued.status} ${issued.text}`).toBe(true);
    expect(numberOf(await readInvoice(operatorToken, id)), "operatorul a primit numărul 1").toBe(1);

    // --- UN CONT DEZACTIVAT NU CITESTE SI NU SCRIE -------------------------
    // Contul este nou si este dezactivat dupa ce primeste jetonul, ca in
    // active-profile-table-reads.spec: conturile comune de test nu se
    // dezactiveaza niciodata, fiindca alte specificatii se autentifica cu ele.
    const email = `p3-108-${RUN}-${randomUUID().slice(0, 8)}@rc-inventory.local`;
    const password = `p3-108-${randomUUID()}`;
    const created = await fetch(`${env().origin}/auth/v1/admin/users`, {
      method: "POST",
      headers: { ...serviceHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    const createdBody = (await created.json().catch(() => ({}))) as { id?: string };
    expect(created.ok && Boolean(createdBody.id), "contul de test nu a putut fi creat").toBe(true);
    const secondId = String(createdBody.id);

    const profile = await asService("profiles?on_conflict=id", {
      method: "POST",
      body: [{ id: secondId, email, role: "account_manager", full_name: "Test P3-108", active: true }],
    });
    expect(profile.ok, `profilul contului de test nu a putut fi scris: ${profile.text}`).toBe(true);

    const secondToken = await accessToken({ email, password, label: "operator P3-108" });
    // Martorul: cat timp este activ, citeste facturile.
    const witness = await asUser(secondToken, `invoices?select=id&id=eq.${id}`);
    expect(witness.rows, "profil activ: contul citește factura").toHaveLength(1);

    const off = await asService(`profiles?id=eq.${secondId}`, { method: "PATCH", body: { active: false } });
    expect(off.ok, `profilul nu a putut fi dezactivat: ${off.text}`).toBe(true);

    // Un refuz de CITIRE este un set gol si nu o eroare: securitatea pe rand
    // filtreaza randuri. Aceeasi distinctie pe care o scrie migratia 0055.
    const blindRead = await asUser(secondToken, `invoices?select=id&id=eq.${id}`);
    expect(blindRead.status, "profil dezactivat: citirea răspunde tot 200").toBe(200);
    expect(blindRead.rows, "profil dezactivat: nicio factură").toEqual([]);
    const blindSettings = await asUser(secondToken, "invoice_settings?select=series_prefix");
    expect(blindSettings.rows, "profil dezactivat: nicio setare").toEqual([]);

    const blindWrite = await asUser(secondToken, "invoices?select=id", {
      method: "POST",
      body: { client_id: clientId },
    });
    expect(blindWrite.ok, "un cont dezactivat a SCRIS o factură").toBe(false);

    const blindIssue = await issue(secondToken, id);
    expect(blindIssue.ok, "un cont dezactivat a ajuns la issue_invoice").toBe(false);

    // --- NIMENI NESEMNAT NU AJUNGE LA NIMIC -------------------------------
    const anonRead = await rest("invoices?select=id&limit=1", { headers: { apikey: env().anon } });
    expect(anonRead.ok, "un vizitator nesemnat a CITIT facturile").toBe(false);
    const anonIssue = await rest("rpc/issue_invoice", {
      method: "POST",
      headers: { apikey: env().anon },
      body: { p_invoice_id: id, p_issue_date: "2026-06-01", p_due_date: null },
    });
    expect(anonIssue.ok, "un vizitator nesemnat a ajuns la issue_invoice").toBe(false);

    // --- SI NIMENI NU POATE STERGE, NICI ADMINISTRATORUL ------------------
    // Administratorul este rolul cel mai puternic al acestei aplicatii, deci daca
    // el nu poate sterge, nimeni din aplicatie nu poate.
    const before = await asService("invoices?select=id");
    expect(before.rows.length, "exista facturi de incercat sa fie sterse").toBeGreaterThan(0);

    // Fiecare tabela cu filtrul care prinde fiecare rand al ei. Contorul are cheia
    // pe serie si setarile pe un boolean, deci nu toate au o coloana id.
    const everyRow: Array<[string, string]> = [
      ["invoices", "id=not.is.null"],
      ["invoice_lines", "id=not.is.null"],
      ["invoice_settings", "id=eq.true"],
      ["invoice_number_series", "series=not.is.null"],
    ];
    for (const [table, filter] of everyRow) {
      const deleted = await asUser(ownerToken, `${table}?${filter}`, { method: "DELETE" });
      // Un DELETE fara drept este refuzat; un DELETE care ar trece prin drept dar
      // nu prin politica ar raspunde 200 si ar sterge zero randuri, deci se
      // verifica si raspunsul si numarul de randuri de dupa.
      if (deleted.ok) {
        expect(deleted.rows, `${table}: administratorul a ȘTERS rânduri`).toEqual([]);
      }
    }
    const settingsLeft = await asService("invoice_settings?select=series_prefix");
    expect(settingsLeft.rows, "randul de setari este tot acolo").toHaveLength(1);
    const afterDeletes = await asService("invoices?select=id");
    expect(
      afterDeletes.rows.length,
      "numărul de facturi nu s-a schimbat după cele patru ștergeri încercate",
    ).toBe(before.rows.length);
  });

  // =========================================================================
  // P3-111, goal G67. Cazurile 6 pana la 9.
  // =========================================================================

  test("6. o factură nu se mai întoarce la ciornă, și pipeline-ul are exact trei treceri legale", async () => {
    const token = await accessToken(ownerAccount());
    await useOwnSeries(CASE.pipeline, token);

    // Ce este legal a fost CITIT si nu ales: raportul de proiectare spune despre o
    // factura Platita "download the PDF, email it. Nothing else.", iar partea 3 a
    // livrat exact asta, in lib/data/facturare-detail-types.ts, care nu ofera nicio
    // actiune nici pe platita nici pe anulata. Deci:
    //
    //   ciorna -> emisa      public.issue_invoice
    //   emisa  -> platita    markInvoicePaid
    //   emisa  -> anulata    cancelInvoice
    //
    // si nimic altceva, inclusiv platita -> anulata, care este o restituire si o
    // decizie de contabilitate.

    /** O ciorna cu o linie, gata de emis. */
    const draftWithLine = async (): Promise<string> => {
      const id = await newInvoice(token);
      const line = await addLine(token, id, { quantity: 1, unit_price_mdl: 10 });
      expect(line.ok, `linia nu a putut fi adaugata: ${line.text}`).toBe(true);
      return id;
    };

    const move = async (id: string, body: Record<string, unknown>): Promise<Rest> =>
      asUser(token, `invoices?id=eq.${id}`, { method: "PATCH", body });

    // --- CELE TREI TRECERI LEGALE MERG, deci pipeline-ul nu este un perete ---
    const toPaid = await draftWithLine();
    expect((await issue(token, toPaid)).ok, "ciornă la emisă a fost refuzată").toBe(true);
    expect((await move(toPaid, { status: "paid" })).ok, "emisă la plătită a fost refuzată").toBe(true);
    expect((await readInvoice(token, toPaid)).status).toBe("paid");

    const toCancelled = await draftWithLine();
    expect((await issue(token, toCancelled)).ok, "ciornă la emisă a fost refuzată").toBe(true);
    expect(
      (await move(toCancelled, { status: "cancelled", cancel_reason: `motiv ${RUN}` })).ok,
      "emisă la anulată a fost refuzată",
    ).toBe(true);
    expect((await readInvoice(token, toCancelled)).status).toBe("cancelled");

    // --- SI FIECARE ALTA TRECERE ESTE REFUZATA -----------------------------
    const issued = await draftWithLine();
    expect((await issue(token, issued)).ok, "emiterea a fost refuzată").toBe(true);

    const draft = await draftWithLine();

    const illegal: Array<[string, string, Record<string, unknown>, string]> = [
      ["emisă", issued, { status: "draft" }, "issued"],
      ["plătită", toPaid, { status: "draft" }, "paid"],
      ["anulată", toCancelled, { status: "draft" }, "cancelled"],
      ["plătită la anulată", toPaid, { status: "cancelled", cancel_reason: "restituire" }, "paid"],
      ["anulată la plătită", toCancelled, { status: "paid" }, "cancelled"],
      ["anulată la emisă", toCancelled, { status: "issued" }, "cancelled"],
      ["ciornă direct la plătită", draft, { status: "paid" }, "draft"],
      ["ciornă direct la anulată", draft, { status: "cancelled", cancel_reason: "motiv" }, "draft"],
    ];

    for (const [what, id, body, stays] of illegal) {
      const refused = await move(id, body);
      expect(refused.ok, `trecerea "${what}" a fost ACCEPTATĂ`).toBe(false);
      expect(refused.text, `refuzul explică în română de ce ("${what}")`).toContain(
        "nu poate trece de la",
      );
      expect((await readInvoice(token, id)).status, `după "${what}" starea a rămas ${stays}`).toBe(
        stays,
      );
    }

    // MARTORUL, ca declansatorul sa nu fie un perete: o ciornă se editează liber si o
    // factura anulata isi mai poate corecta motivul, exact cum 0063 a permis dinadins.
    expect(
      (await asUser(token, `invoices?id=eq.${draft}`, { method: "PATCH", body: { notes: "o notă" } })).ok,
      "o ciornă nu se mai editează",
    ).toBe(true);
    expect(
      (await move(toCancelled, { cancel_reason: `motiv rescris ${RUN}` })).ok,
      "motivul anulării nu se mai poate corecta",
    ).toBe(true);
  });

  test("7. cele șase coloane de audit se scriu o singură dată și nu se mai rescriu", async () => {
    const token = await accessToken(ownerAccount());
    await useOwnSeries(CASE.stamps, token);
    const ownerId = await profileIdOf(ownerAccount().email);
    const otherId = await profileIdOf(managerAccount().email);

    const stamps = async (id: string): Promise<Record<string, unknown>> => {
      const got = await asUser(
        token,
        `invoices?select=issued_at,issued_by,paid_at,paid_by,cancelled_at,cancelled_by&id=eq.${id}`,
      );
      expect(got.rows, `exact o factură pentru ${id}`).toHaveLength(1);
      return got.rows[0]!;
    };
    const patch = async (id: string, body: Record<string, unknown>): Promise<Rest> =>
      asUser(token, `invoices?id=eq.${id}`, { method: "PATCH", body });

    const withLine = async (): Promise<string> => {
      const id = await newInvoice(token);
      const line = await addLine(token, id, { quantity: 1, unit_price_mdl: 10 });
      expect(line.ok, `linia nu a putut fi adaugata: ${line.text}`).toBe(true);
      return id;
    };

    // --- EMISA: issued_at SI issued_by SUNT SCRISE DE BAZA, O DATA ----------
    const paidOne = await withLine();
    expect((await issue(token, paidOne)).ok, "emiterea a fost refuzată").toBe(true);
    const afterIssue = await stamps(paidOne);
    // MARTORUL PRIMEI JUMATATI: cat timp erau null, au fost scrise.
    expect(afterIssue.issued_at, "issued_at a fost scris la emitere").not.toBeNull();
    expect(afterIssue.issued_by, "issued_by a fost scris la emitere").not.toBeNull();

    for (const [what, body] of [
      ["issued_at", { issued_at: "2019-01-01T00:00:00Z" }],
      ["issued_by", { issued_by: otherId }],
    ] as const) {
      const refused = await patch(paidOne, body);
      expect(refused.ok, `${what} a fost REscris pe o factură emisă`).toBe(false);
      expect(refused.text, `refuzul explică în română de ce (${what})`).toContain(
        "se scriu o singura data",
      );
    }
    expect((await stamps(paidOne)).issued_at, "issued_at nu s-a mișcat").toBe(afterIssue.issued_at);
    expect((await stamps(paidOne)).issued_by, "issued_by nu s-a mișcat").toBe(afterIssue.issued_by);

    // --- PLATITA: paid_at SI paid_by SE SCRIU CAT TIMP SUNT NULL ------------
    // Aceasta este calea pe care merge markInvoicePaid: el trimite ziua aleasa la
    // amiaza UTC si contul care a apasat, iar invoices_stamp_status le lasa in pace
    // fiindca nu mai sunt null. Este si martorul jumatatii "scrisa cat timp este null".
    const chosen = "2026-06-10T12:00:00Z";
    const marked = await patch(paidOne, { status: "paid", paid_at: chosen, paid_by: ownerId });
    expect(marked.ok, `marcarea ca plătită a fost refuzată: ${marked.text}`).toBe(true);
    const afterPaid = await stamps(paidOne);
    expect(
      new Date(String(afterPaid.paid_at)).toISOString(),
      "ziua pe care a ales-o operatorul a fost păstrată",
    ).toBe(new Date(chosen).toISOString());
    expect(afterPaid.paid_by, "contul care a apăsat a fost păstrat").toBe(ownerId);

    for (const [what, body] of [
      ["paid_at", { paid_at: "2031-01-01T12:00:00Z" }],
      ["paid_by", { paid_by: otherId }],
    ] as const) {
      const refused = await patch(paidOne, body);
      expect(refused.ok, `${what} a fost REscris pe o factură plătită`).toBe(false);
      expect(refused.text, `refuzul explică în română de ce (${what})`).toContain(
        "se scriu o singura data",
      );
    }
    expect((await stamps(paidOne)).paid_at, "paid_at nu s-a mișcat").toBe(afterPaid.paid_at);
    expect((await stamps(paidOne)).paid_by, "paid_by nu s-a mișcat").toBe(afterPaid.paid_by);

    // --- ANULATA: cancelled_at SI cancelled_by, ACEEASI REGULA -------------
    const cancelledOne = await withLine();
    expect((await issue(token, cancelledOne)).ok, "emiterea a fost refuzată").toBe(true);
    const cancelled = await patch(cancelledOne, {
      status: "cancelled",
      cancel_reason: `motiv ${RUN}`,
    });
    expect(cancelled.ok, `anularea a fost refuzată: ${cancelled.text}`).toBe(true);
    const afterCancel = await stamps(cancelledOne);
    expect(afterCancel.cancelled_at, "cancelled_at a fost scris la anulare").not.toBeNull();
    expect(afterCancel.cancelled_by, "cancelled_by a fost scris la anulare").not.toBeNull();

    for (const [what, body] of [
      ["cancelled_at", { cancelled_at: "2019-01-01T00:00:00Z" }],
      ["cancelled_by", { cancelled_by: otherId }],
    ] as const) {
      const refused = await patch(cancelledOne, body);
      expect(refused.ok, `${what} a fost REscris pe o factură anulată`).toBe(false);
      expect(refused.text, `refuzul explică în română de ce (${what})`).toContain(
        "se scriu o singura data",
      );
    }
    expect((await stamps(cancelledOne)).cancelled_at, "cancelled_at nu s-a mișcat").toBe(
      afterCancel.cancelled_at,
    );

    // SI ANULAREA NU A STERS DATA EMITERII, care este exact ce spune 0063: o factura
    // anulata care a fost emisa pe 3 a fost totusi emisa pe 3.
    expect((await stamps(cancelledOne)).issued_at, "anularea nu șterge data emiterii").not.toBeNull();
  });

  test("8. o ieșire nu poate avea două facturi neanulate, și una anulată nu o blochează", async () => {
    const token = await accessToken(ownerAccount());
    await useOwnSeries(CASE.perIssue, token);
    const iesire = await newOutboundIssue("A");
    const other = await newOutboundIssue("B");

    const forIssue = async (id: string): Promise<Rest> =>
      asUser(token, `invoices?select=id,status&outbound_issue_id=eq.${id}`);

    // --- PRIMA FACTURA A IESIRII ------------------------------------------
    const first = await saveDraft(token, {
      p_client_id: clientId,
      p_lines: [rpcLine()],
      p_outbound_issue_id: iesire,
    });
    expect(first.ok, `prima factura a iesirii a fost refuzata: ${first.status} ${first.text}`).toBe(
      true,
    );
    const firstId = String(first.rows[0]);
    expect(firstId, "save_invoice_draft a întors un id").toMatch(/^[0-9a-f-]{36}$/i);

    // --- A DOUA ESTE REFUZATA DE BAZA, NU DE ECRAN ------------------------
    // Inainte de cardul P3-111 raspunsul la "exista deja o factura" era un SELECT in
    // getIssueInvoiceability, iar calea de scriere insera fara sa mai intrebe. Doua
    // file deschise pe /facturare/nou?iesire=X reuseau amandoua, si NICIUNA din cele
    // doua facturi nu putea fi stearsa.
    const second = await saveDraft(token, {
      p_client_id: clientId,
      p_lines: [rpcLine()],
      p_outbound_issue_id: iesire,
    });
    expect(second.ok, "o A DOUA factură a fost scrisă pentru aceeași ieșire").toBe(false);
    expect(
      second.text,
      "refuzul vine de la indexul parțial și îl numește, deci ecranul poate traduce exact acest caz",
    ).toContain("invoices_one_live_per_outbound_issue");

    const afterSecond = await forIssue(iesire);
    expect(afterSecond.rows, "ieșirea poartă exact o factură").toHaveLength(1);

    // --- O ALTA IESIRE NU ESTE ATINSA ------------------------------------
    const onOther = await saveDraft(token, {
      p_client_id: clientId,
      p_lines: [rpcLine()],
      p_outbound_issue_id: other,
    });
    expect(onOther.ok, `o altă ieșire a fost blocată: ${onOther.text}`).toBe(true);

    // --- SI O FACTURA FARA IESIRE NU ESTE ATINSA DELOC -------------------
    for (const attempt of [1, 2]) {
      const manual = await saveDraft(token, { p_client_id: clientId, p_lines: [rpcLine()] });
      expect(manual.ok, `factura manuală ${attempt} a fost refuzată: ${manual.text}`).toBe(true);
    }

    // --- O FACTURA ANULATA NU BLOCHEAZA IESIREA PENTRU TOTDEAUNA ---------
    // A anula inseamna a emite intai, fiindca invoices_numbered_past_draft refuza orice
    // stare peste ciorna fara numar. NIMIC NU SE STERGE: factura anulata isi pastreaza
    // numarul si rămâne pe lista.
    expect((await issue(token, firstId)).ok, "emiterea primei facturi a fost refuzată").toBe(true);
    const cancel = await asUser(token, `invoices?id=eq.${firstId}`, {
      method: "PATCH",
      body: { status: "cancelled", cancel_reason: `motiv ${RUN}` },
    });
    expect(cancel.ok, `anularea a fost refuzată: ${cancel.text}`).toBe(true);

    const third = await saveDraft(token, {
      p_client_id: clientId,
      p_lines: [rpcLine()],
      p_outbound_issue_id: iesire,
    });
    expect(
      third.ok,
      `o ieșire a cărei singură factură a fost anulată nu a putut fi facturată din nou: ${third.text}`,
    ).toBe(true);

    const atEnd = await forIssue(iesire);
    expect(atEnd.rows, "ieșirea poartă acum două facturi, una anulată și una vie").toHaveLength(2);
    expect(
      atEnd.rows.filter((r) => r.status !== "cancelled"),
      "exact o factură vie pe ieșire",
    ).toHaveLength(1);
    expect(
      numberOf(await readInvoice(token, firstId)),
      "factura anulată își păstrează numărul",
    ).toBe(1);
  });

  test("9. o salvare care cade pe o linie nu lasă nicio factură în urmă", async () => {
    const token = await accessToken(ownerAccount());
    await useOwnSeries(CASE.atomic, token);

    // UN CLIENT PROPRIU CAZULUI, fiindca acest caz NUMARA facturile unui client si
    // datele de test nu se sterg niciodata.
    const mine = await newClient(token, "atomic");
    expect(await invoiceCount(token, mine), "clientul nou nu are nicio factură").toBe(0);

    // --- O LINIE PE CARE BAZA TREBUIE SA O REFUZE ------------------------
    // Cantitatea zero cade pe invoice_lines_quantity_positive din 0063. Inainte de
    // cardul P3-111 antetul se scria in prima cerere si liniile in a doua, deci un refuz
    // aici lasa o factura fara numar si fara linii, pe lista lunii, pe care NIMENI nu o
    // putea scoate: public.invoices nu are nici drept de stergere nici politica de
    // stergere pentru niciun rol, administratorul inclus.
    const bad = await saveDraft(token, {
      p_client_id: mine,
      p_lines: [rpcLine({ quantity: 0 })],
    });
    expect(bad.ok, "o linie cu cantitatea zero a fost ACCEPTATĂ").toBe(false);
    expect(
      await invoiceCount(token, mine),
      "salvarea a căzut și NU a lăsat nicio factură în urmă",
    ).toBe(0);

    // --- SI A DOUA LINIE DINTR-O PERECHE, care este chiar forma defectului --
    // Prima linie este bună si a doua nu, deci vechea cale ar fi scris antetul, apoi
    // prima linie, si ar fi căzut pe a doua.
    const halfBad = await saveDraft(token, {
      p_client_id: mine,
      p_lines: [rpcLine({ description: "Prima, bună" }), rpcLine({ quantity: -1 })],
    });
    expect(halfBad.ok, "o pereche cu a doua linie greșită a fost ACCEPTATĂ").toBe(false);
    expect(
      await invoiceCount(token, mine),
      "nici perechea pe jumătate bună nu a lăsat nimic în urmă",
    ).toBe(0);

    // --- MARTORUL: cu linii bune, functia SCRIE -------------------------
    // Fara aceasta jumatate cazul ar trece si daca functia nu ar face nimic niciodata.
    const good = await saveDraft(token, {
      p_client_id: mine,
      p_lines: [rpcLine({ description: "Prima" }), rpcLine({ description: "A doua", quantity: 2 })],
    });
    expect(good.ok, `salvarea bună a fost refuzată: ${good.status} ${good.text}`).toBe(true);
    const savedId = String(good.rows[0]);
    expect(await invoiceCount(token, mine), "salvarea bună a scris exact o factură").toBe(1);

    const lines = await asUser(token, `invoice_lines?select=id,sort_order&invoice_id=eq.${savedId}`);
    expect(lines.rows, "amândouă liniile au fost scrise").toHaveLength(2);

    // SI TOTALURILE SUNT ALE DECLANSATORULUI, nu ale apelantului: 1 x 10 plus 2 x 10
    // este 30, plus 20 la sută, este 36.
    const saved = await readInvoice(token, savedId);
    expect(Number(saved.subtotal_mdl), "subtotalul calculat de declanșator").toBe(30);
    expect(Number(saved.total_mdl), "totalul calculat de declanșator").toBe(36);
  });
});
