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
});
