import { expect, test, type Locator, type Page } from "@playwright/test";
import { ownerAccount, type TestAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { invoiceNumberText, invoiceStatusLabel } from "@/lib/data/facturare-types";
import { chisinauToday, formatMoneyExact, formatQty } from "@/lib/data/format";

// facturare-create.spec - linia de acceptanta a cardului P3-110, goal G65 partea 3.
//
// CE ACOPERA, caz cu caz, si in ordinea clauzelor cardului:
//
//   1  o factura facuta DINTR-O IESIRE copiaza clientul, proiectul, liniile,
//      cantitatile si preturile, si o cantitate schimbata cat timp este ciorna muta
//      totalurile
//   2  Emite intreaba INTAI, numeste numarul, apoi baza il aloca; a doua factura din
//      aceeasi serie primeste numarul urmator; o factura emisa nu se mai modifica, si
//      refuzul vine de la BAZA si nu de la ecran
//   3  Marchează plătită cu o zi, si dupa ea nu se mai ofera nicio actiune
//   4  Anulează cere un motiv, il pastreaza, il arata, PASTREAZA NUMARUL, rămâne pe
//      lista, si urmatoarea emitere nu refoloseste numarul anulat
//   5  NU EXISTA NICIO STERGERE: niciun buton in nicio stare, si nicio cale in stratul
//      de date
//   6  butonul "Creează factură" este dezactivat CU MOTIVUL IN ROMANA LANGA EL cand
//      iesirea are o poziție fără preț si cand exista deja o factura pentru ea
//   7  fisa clientului si fisa proiectului isi listeaza fiecare facturile
//   8  "Factură nouă" de pe lista, cu totul ales de mana
//   9  telefonul de 390x844, pe ecranul de creare si pe ecranul facturii
//
// CUM SE IZOLEAZA DE RESTUL BAZEI. DATELE DE TEST NU SE STERG NICIODATA (conventia
// P2-07), si o factura nu se poate sterge deloc, deci tabela poarta facturile fiecarei
// rulari de pana acum. FIECARE CAZ ARE CLIENTUL LUI, si nu doar fiecare rulare: o fila
// de pe fisa unui client listeaza TOATE facturile lui, iar doua cazuri care ar imparti
// un client s-ar numara unul peste altul. Este chiar regula scrisa in KNOWN-FAILURES de
// cardul P3-101: o valoare pe care logica o CAUTA in toata tabela are nevoie de
// unicitate pe rulare SI pe caz.
//
// SERIA ESTE A ACESTEI RULARI. public.issue_invoice calculeaza seria din setari, seria
// este globala, si contorul ei nu se intoarce niciodata. beforeAll pune prefixul pe o
// valoare proprie rularii si scoate anul din numar, ca seria sa fie exact prefixul;
// afterAll il pune inapoi pe RC-. Exact ce fac facturare-data.spec si facturare-list.spec.
// Suita ruleaza cu un singur worker si fara paralelism (playwright.config.ts), deci cele
// trei nu se calca.
//
// NIMIC NU SE STERGE SI NIMIC DIN PRODUCTIE NU SE ATINGE. Fiecare fixtura este scrisa de
// mana prin PostgREST pe stiva locala, cu prefixul TEST in nume.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

const PHONE = { width: 390, height: 844 };
const MIN_TAP = 44;
const MIN_INPUT_FONT = 16;

// FARA CRATIMA LA CAPAT: invoiceNumberText lipeste o cratima intre serie si numar, deci
// un prefix care se termina in cratima ar da doua cratime in numarul scris.
const SERIES = `TEST-C${RUN}`;

const TODAY = chisinauToday();

/** Cota TVA cu care lucreaza fiecare caz, si care este si implicitul produsului. */
const VAT = 20;

/* ------------------------------------------------ API-ul bazei de date -- */

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error(
      "facturare-create.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY si " +
        "SUPABASE_SERVICE_ROLE_KEY. In CI sunt exportate de pasul 'Export local Supabase credentials'. " +
        "Local: supabase status -o env.",
    );
  }
  return { origin: new URL(url).origin, anon, service };
}

type Rest = { status: number; ok: boolean; rows: Record<string, unknown>[]; text: string };

async function rest(
  path: string,
  init: { method?: string; headers: Record<string, string>; body?: unknown },
): Promise<Rest> {
  const response = await fetch(`${env().origin}/rest/v1/${path}`, {
    method: init.method ?? "GET",
    headers: { ...init.headers, "Content-Type": "application/json", Prefer: "return=representation" },
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

async function accessToken(account: TestAccount): Promise<string> {
  const { origin, anon } = env();
  const response = await fetch(`${origin}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: string };
  if (!response.ok || !body.access_token) throw new Error(`autentificarea API a raspuns ${response.status}`);
  return body.access_token;
}

let ownerToken = "";

const asOwner = (path: string, init: Omit<Parameters<typeof rest>[1], "headers"> = {}) =>
  rest(path, { ...init, headers: { apikey: env().anon, Authorization: `Bearer ${ownerToken}` } });
const asService = (path: string, init: Omit<Parameters<typeof rest>[1], "headers"> = {}) =>
  rest(path, { ...init, headers: { apikey: env().service, Authorization: `Bearer ${env().service}` } });

/* ------------------------------------------------------------ fixturi -- */

type Product = { id: string; sku: string; name: string };

let productA: Product;
let productB: Product;

async function firstCategoryId(): Promise<string> {
  const got = await asService("categories?select=id&limit=1");
  expect(got.ok, `categoriile nu au putut fi citite: ${got.text}`).toBe(true);
  expect(got.rows.length, "baza de test are cel putin o categorie").toBeGreaterThan(0);
  return String(got.rows[0]!.id);
}

/**
 * Un produs cu stoc real, prin lantul pe care il foloseste si aplicatia: o comanda de
 * intrare sosita, linia ei, si lotul.
 *
 * STOCUL ESTE O SUMA SI NU O COLOANA (migratia 0004): loturi minus linii de iesire. Un
 * produs fara lot ar face `create_outbound_issue` sa refuze fiecare iesire a acestui
 * fisier cu "Stoc insuficient", si un produs cu stoc NEGATIV ar aparea pe tabloul de
 * bord si in listele de sub prag ale altor specificatii. De aceea lotul este scris, si
 * este scris generos.
 */
async function productWithStock(tag: string, quantity: number): Promise<Product> {
  const sku = `TEST-FC-${tag}-${RUN}`;
  const name = `TEST Produs factura ${tag} ${RUN}`;
  const category = await firstCategoryId();

  const created = await asService("products?select=id", {
    method: "POST",
    body: {
      sku,
      name,
      category_id: category,
      unit: "pcs",
      unit_value_mdl: 10,
      active: true,
    },
  });
  expect(created.ok, `produsul ${sku} nu a putut fi creat: ${created.text}`).toBe(true);
  const id = String(created.rows[0]!.id);

  const order = await asService("inbound_orders?select=id", {
    method: "POST",
    body: {
      reference: `INT-TEST-FC-${RUN}-${tag}`,
      supplier_name: `TEST Furnizor factura ${RUN}`,
      status: "arrived",
      arrived_at: new Date().toISOString(),
    },
  });
  expect(order.ok, `comanda de intrare nu a putut fi creata: ${order.text}`).toBe(true);
  const orderId = String(order.rows[0]!.id);

  const line = await asService("order_lines?select=id", {
    method: "POST",
    body: { inbound_order_id: orderId, product_id: id, quantity },
  });
  expect(line.ok, `linia comenzii nu a putut fi creata: ${line.text}`).toBe(true);

  const batch = await asService("batches?select=id", {
    method: "POST",
    body: {
      product_id: id,
      inbound_order_id: orderId,
      order_line_id: String(line.rows[0]!.id),
      quantity,
    },
  });
  expect(batch.ok, `lotul nu a putut fi creat: ${batch.text}`).toBe(true);

  return { id, sku, name };
}

async function createClientRow(
  label: string,
  // FARA IDNO ESTE O ALEGERE A APELANTULUI, adaugata de cardul P3-115 pentru constatarea
  // G12: cartonasul Client trebuie sa spuna cand IDNO-ul lipsește, si asta nu se poate
  // proba pe un client care are unul. Null si nu sir gol: clients_fiscal_code_unique
  // trateaza null-urile ca distincte, deci doi clienti fara IDNO nu se ciocnesc, in timp
  // ce doua siruri goale ar cadea cu 23505.
  options: { withFiscalCode?: boolean } = {},
): Promise<{ id: string; name: string }> {
  const name = `TEST Client factura ${label} ${RUN}`;
  const created = await asOwner("clients?select=id", {
    method: "POST",
    body: {
      name,
      active: true,
      // IDNO-UL ESTE UNIC PE BAZA, prin clients_fiscal_code_unique din migratia 0013,
      // deci el poarta si eticheta cazului si rularea. O valoare comuna intre doua cazuri
      // face al doilea insert sa cada cu 23505, si cazul acela pare sa fie despre facturi.
      fiscal_code: options.withFiscalCode === false ? null : `IDNO-${label}-${RUN}`,
      address: `Strada Testului ${label}, Chisinau`,
    },
  });
  expect(created.ok, `clientul ${name} nu a putut fi creat: ${created.text}`).toBe(true);
  return { id: String(created.rows[0]!.id), name };
}

async function createProjectRow(clientId: string, label: string): Promise<{ id: string; name: string }> {
  const name = `TEST Santier factura ${label} ${RUN}`;
  const created = await asOwner("projects?select=id", {
    method: "POST",
    body: { client_id: clientId, name },
  });
  expect(created.ok, `proiectul ${name} nu a putut fi creat: ${created.text}`).toBe(true);
  return { id: String(created.rows[0]!.id), name };
}

type IssueLine = { product: Product; quantity: number; price: number | null };

/**
 * O iesire cu liniile ei, prin chiar functia pe care o cheama aplicatia.
 *
 * REFERINTA ARE UN PREFIX PROPRIU, `IES-TEST-...`, si nu formatul aplicatiei
 * `IES-AAAA-NNNN`: nextOutboundReference citeste cea mai mare referinta care se
 * potriveste cu `IES-<anul>-%`, deci o referinta de test in formatul acela ar muta
 * numaratorul aplicatiei si ar rupe specificatiile care il verifica.
 */
async function createIssue(
  projectId: string,
  label: string,
  lines: IssueLine[],
): Promise<{ id: string; reference: string }> {
  const reference = `IES-TEST-FC-${RUN}-${label}`;
  const created = await asOwner("rpc/create_outbound_issue", {
    method: "POST",
    body: {
      p_reference: reference,
      p_client_name: "",
      p_project_name: "",
      p_project_id: projectId,
      p_lines: lines.map((l) => ({
        product_id: l.product.id,
        quantity: l.quantity,
        sale_price_mdl: l.price,
      })),
    },
  });
  expect(created.ok, `iesirea ${reference} nu a putut fi creata: ${created.status} ${created.text}`).toBe(
    true,
  );
  const id = String(created.rows[0]!);
  expect(id, "create_outbound_issue a intors un id").toMatch(/^[0-9a-f-]{36}$/i);
  return { id, reference };
}

/** O factura ciorna scrisa direct, pentru cazurile in care ecranul de creare nu este
 *  ceea ce se verifica. */
async function seedDraft(
  clientId: string,
  projectId: string | null,
  lines: { description: string; quantity: number; unitPrice: number }[],
  outboundIssueId: string | null = null,
): Promise<string> {
  const created = await asOwner("invoices?select=id", {
    method: "POST",
    body: { client_id: clientId, project_id: projectId, outbound_issue_id: outboundIssueId },
  });
  expect(created.ok, `ciorna nu a putut fi creata: ${created.text}`).toBe(true);
  const id = String(created.rows[0]!.id);

  const written = await asOwner("invoice_lines?select=id", {
    method: "POST",
    body: lines.map((l, index) => ({
      invoice_id: id,
      description: l.description,
      quantity: l.quantity,
      unit: "pcs",
      unit_price_mdl: l.unitPrice,
      vat_rate: VAT,
      sort_order: index,
    })),
  });
  expect(written.ok, `liniile nu au putut fi scrise: ${written.text}`).toBe(true);
  return id;
}

async function issueViaApi(invoiceId: string, on: string = TODAY): Promise<void> {
  const issued = await asOwner("rpc/issue_invoice", {
    method: "POST",
    body: { p_invoice_id: invoiceId, p_issue_date: on, p_due_date: null },
  });
  expect(issued.ok, `emiterea a raspuns ${issued.status}: ${issued.text}`).toBe(true);
}

async function patchInvoice(invoiceId: string, body: Record<string, unknown>): Promise<Rest> {
  return asOwner(`invoices?id=eq.${invoiceId}`, { method: "PATCH", body });
}

type StoredInvoice = {
  status: string;
  series: string | null;
  number: number | null;
  numberText: string | null;
  paidAt: string | null;
  cancelReason: string | null;
  totalMdl: number;
};

async function readInvoice(invoiceId: string): Promise<StoredInvoice> {
  const got = await asOwner(
    `invoices?select=status,series,number,paid_at,cancel_reason,total_mdl&id=eq.${invoiceId}`,
  );
  expect(got.rows.length, `exact o factura pentru ${invoiceId}`).toBe(1);
  const row = got.rows[0]!;
  const number = row.number === null || row.number === undefined ? null : Number(row.number);
  return {
    status: String(row.status),
    series: (row.series as string | null) ?? null,
    number,
    numberText: invoiceNumberText((row.series as string | null) ?? null, number),
    paidAt: (row.paid_at as string | null) ?? null,
    cancelReason: (row.cancel_reason as string | null) ?? null,
    totalMdl: Number(row.total_mdl ?? 0),
  };
}

/** Numarul pe care il va lua urmatoarea emitere din seria acestei rulari. */
async function nextNumberInSeries(): Promise<number> {
  const got = await asOwner(
    `invoice_number_series?select=next_number&series=eq.${encodeURIComponent(SERIES)}`,
  );
  return got.rows.length === 0 ? 1 : Number(got.rows[0]!.next_number);
}

/* ------------------------------------------------------------- ecranul -- */

/** A patra copie a acestui ajutor in suita, si asta este o constatare, nu o scapare:
 *  outbound.spec, deviz.spec si reminders.spec au fiecare a lor. Notata in raport ca
 *  material pentru un card de curatare; a muta patru fisiere care aparțin altor carduri
 *  nu este scopul acestuia. */
async function comboPick(page: Page, testId: string, query: string) {
  const input = page.getByTestId(testId).locator("input");
  await input.click();
  await input.fill(query);
  const list = page.locator("[data-rc-combo-list]");
  await expect(list).toBeVisible({ timeout: 10_000 });
  await expect(list.locator("li")).toHaveCount(1);
  await list.locator("li").first().click();
}

/** Deschide panoul unei iesiri de pe /comenzi. */
async function openIssuePanel(page: Page, reference: string): Promise<void> {
  await page.goto("/comenzi");
  const item = page.locator(`[data-testid="outbound-item"][data-reference="${reference}"]`);
  await expect(item, `iesirea ${reference} nu este pe lista`).toHaveCount(1, { timeout: 25_000 });
  await item.click();
  await expect(page.getByTestId("outbound-panel")).toBeVisible({ timeout: 25_000 });
  // Blocul de facturare apare dupa prima citire a detaliului, nu la randarea panoului.
  await expect(page.getByTestId("issue-invoice-block")).toBeVisible({ timeout: 25_000 });
}

/** Id-ul facturii din adresa curenta, /facturare/<id>. */
function invoiceIdFromUrl(page: Page): string {
  const path = new URL(page.url()).pathname;
  const id = path.split("/").filter(Boolean).pop() ?? "";
  expect(id, `adresa ${page.url()} nu se termina in id de factura`).toMatch(/^[0-9a-f-]{36}$/i);
  return id;
}

/** Suma scrisa romanesc, inapoi in numar: "1.199,50 MDL" catre 1199.5. */
function fromMoney(text: string): number {
  const digits = text.replace(/\s*MDL\s*$/, "").replace(/\./g, "").replace(",", ".");
  const value = Number(digits);
  expect(Number.isFinite(value), `suma "${text}" nu s-a putut citi`).toBe(true);
  return value;
}

/** zz.ll.aaaa, forma pe care o scrie si o citeste casuta de data din P3-49. */
function ro(day: string): string {
  return `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;
}

/**
 * Masuratoarea de telefon, narrowed la clauzele pe care le numeste acest card.
 *
 * O A CINCEA COPIE A UNUI AJUTOR DE FELUL ACESTA in suita, si cardul P3-109 a notat deja
 * ca cele patru de dinainte ar trebui sa ajunga in tests/e2e/support/. Aceasta ramane
 * aici pentru acelasi motiv: cele patru aparțin altor carduri.
 */
async function readPhone(page: Page, rowTestId: string) {
  return page.evaluate(
    ({ minTap, minFont, width, rowTestId: rowId }) => {
      const main = document.querySelector("main");
      if (!main) throw new Error("pagina nu are <main>");
      const visible = (el: Element) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== "hidden";
      };
      const name = (el: Element) =>
        `${el.tagName.toLowerCase()}[${el.getAttribute("data-testid") ?? ""}] "${(
          el.getAttribute("aria-label") ??
          el.textContent ??
          el.getAttribute("placeholder") ??
          ""
        )
          .trim()
          .slice(0, 40)}"`;

      const smallTargets: string[] = [];
      for (const el of Array.from(main.querySelectorAll("input, select, button, a[href]"))) {
        if (!visible(el)) continue;
        const height = el.getBoundingClientRect().height;
        if (height < minTap) smallTargets.push(`${name(el)} ${height.toFixed(1)}px`);
      }

      const smallFonts: string[] = [];
      for (const el of Array.from(main.querySelectorAll("input, select, textarea"))) {
        if (!visible(el)) continue;
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (size < minFont) smallFonts.push(`${name(el)} ${size}px`);
      }

      const rootRight = main.getBoundingClientRect().right;
      const outside: string[] = [];
      const wider: string[] = [];
      for (const el of Array.from(main.querySelectorAll<HTMLElement>("*"))) {
        if (!visible(el)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.left < -0.5 || rect.right > width + 0.5) {
          outside.push(`${name(el)} ${rect.left.toFixed(0)}..${rect.right.toFixed(0)}`);
        }
        if (rect.right > rootRight + 0.5) wider.push(`${name(el)} ${rect.right.toFixed(0)}`);
      }

      const cards = Array.from(main.querySelectorAll<HTMLElement>(`[data-testid='${rowId}']`)).map(
        (tr) => getComputedStyle(tr).display,
      );

      return {
        document: {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        },
        main: { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth },
        smallTargets,
        smallFonts,
        outside,
        wider,
        visibleTheads: Array.from(main.querySelectorAll("thead")).filter(visible).length,
        cards,
      };
    },
    { minTap: MIN_TAP, minFont: MIN_INPUT_FONT, width: PHONE.width, rowTestId },
  );
}

function expectPhoneClean(
  reading: Awaited<ReturnType<typeof readPhone>>,
  where: string,
  expectedCards: number,
) {
  expect(
    reading.document.scrollWidth,
    `${where}: derulare laterala a documentului`,
  ).toBeLessThanOrEqual(reading.document.clientWidth);
  expect(
    reading.main.scrollWidth,
    `${where}: derulare laterala in <main>, mai late decat el: ${reading.wider.join(" | ")}`,
  ).toBeLessThanOrEqual(reading.main.clientWidth);
  expect(reading.outside, `${where}: elemente in afara ecranului`).toEqual([]);
  expect(reading.smallTargets, `${where}: tinte sub ${MIN_TAP}px`).toEqual([]);
  expect(reading.smallFonts, `${where}: campuri sub ${MIN_INPUT_FONT}px`).toEqual([]);
  expect(reading.visibleTheads, `${where}: antet de tabel vizibil pe telefon`).toBe(0);
  expect(reading.cards, `${where}: randurile nu au ajuns pe ecran`).toHaveLength(expectedCards);
  for (const display of reading.cards) {
    expect(display, `${where}: randul nu este card pe telefon`).toBe("grid");
  }
}

function lines(page: Page): Locator {
  return page.getByTestId("factura-linie");
}

test.describe("P3-110: crearea si gestionarea unei facturi", () => {
  test.describe.configure({ timeout: 300_000 });

  test.beforeAll(async () => {
    ownerToken = await accessToken(ownerAccount());

    // Seria acestei rulari, anul scos din numar ca seria sa fie chiar prefixul, si cota
    // pusa explicit pe implicitul produsului: formularul o citeste din setari, iar o alta
    // specificatie ar putea sa o fi lasat pe altceva.
    const settings = await asService("invoice_settings?id=eq.true", {
      method: "PATCH",
      body: {
        series_prefix: SERIES,
        number_includes_year: false,
        default_vat_rate: VAT,
        issuer_name: `TEST Rapid Construct ${RUN}`,
        issuer_fiscal_code: `1003600${RUN}`.slice(0, 20),
        issuer_address: "Chisinau, str. Testului 1",
      },
    });
    expect(settings.ok, `setarile de facturare nu au putut fi puse: ${settings.text}`).toBe(true);

    productA = await productWithStock("A", 5000);
    productB = await productWithStock("B", 5000);
  });

  test.afterAll(async () => {
    // Setarile inapoi pe implicitul produsului, ca nicio alta specificatie si nicio
    // rulare urmatoare sa nu porneasca de la o serie de test.
    await asService("invoice_settings?id=eq.true", {
      method: "PATCH",
      body: {
        series_prefix: "RC-",
        number_includes_year: true,
        default_vat_rate: 20,
        issuer_name: null,
        issuer_fiscal_code: null,
        issuer_address: null,
      },
    });
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page, ownerAccount());
  });

  // -------------------------------------------------------------------------
  // Clauza 1: din Iesire, copia exacta, si o cantitate schimbata muta totalurile.
  // -------------------------------------------------------------------------
  test("1. o factură făcută din ieșire copiază clientul, proiectul, liniile, cantitățile și prețurile", async ({
    page,
  }) => {
    const client = await createClientRow("C1");
    const project = await createProjectRow(client.id, "C1");
    const issue = await createIssue(project.id, "c1", [
      { product: productA, quantity: 3, price: 100 },
      { product: productB, quantity: 2, price: 50 },
    ]);

    // --- BUTONUL DE PE FISA IESIRII DESCHIDE ECRANUL DE CREARE ---------------
    await openIssuePanel(page, issue.reference);
    const create = page.getByTestId("issue-create-invoice");
    await expect(create).toBeEnabled();
    await create.click();
    await expect(page).toHaveURL(new RegExp(`/facturare/nou\\?iesire=${issue.id}$`), {
      timeout: 25_000,
    });
    await expect(page.getByTestId("factura-editor")).toBeVisible({ timeout: 25_000 });

    // --- CLIENTUL SI PROIECTUL SUNT CITITE, NU TASTATE -----------------------
    await expect(page.getByTestId("factura-editor-client-nume")).toHaveText(client.name);
    await expect(page.getByTestId("factura-editor-proiect-nume")).toHaveText(project.name);
    // Si nu exista niciun camp in care sa fie alese: calea de pe o Iesire nu le ofera.
    await expect(page.getByTestId("factura-editor-client")).toHaveCount(0);
    await expect(page.getByTestId("factura-editor-proiect")).toHaveCount(0);

    // --- O LINIE PER LINIE DE IESIRE, CU VALORILE EI ------------------------
    // Ce s-a scris in baza la crearea iesirii, citit de acolo si nu presupus.
    // IN ORDINEA IESIRII, SI NU ALFABETIC. Cardul P3-115, constatarea G13 a raportului
    // docs/reports/2026-09-29-critic-bug-sweep-2.md. Acest test cerea, pana atunci,
    // ordinea alfabetica, prin `.sort((a, b) => a.name.localeCompare(b.name, "ro"))` pe
    // liniile asteptate: adica cerea chiar defectul, in timp ce comentariul din
    // lib/data/facturare-create.ts spunea ca ordinea vine de la baza. Factura urmează
    // livrarea, deci ordinea cerută acum este ordinea proprie a ieșirii, `created_at`
    // apoi `id`, ceruta explicit si de citirea aplicatiei si de cererea de aici.
    //
    // ACEEASI ORDINE CERUTA IN AMANDOUA LOCURILE, si asta este intenția: ce citeste
    // testul este ce citeste aplicatia, nu o a doua părere despre ce ar trebui sa fie.
    const stored = await asOwner(
      `outbound_lines?select=quantity,sale_price_mdl,created_at,id,products(name)` +
        `&outbound_issue_id=eq.${issue.id}&order=created_at.asc,id.asc`,
    );
    expect(stored.ok, `liniile iesirii nu s-au putut citi: ${stored.text}`).toBe(true);
    const expectedLines = stored.rows.map((row) => {
      const product = row.products as { name: string } | { name: string }[] | null;
      const named = Array.isArray(product) ? product[0] : product;
      return {
        name: named?.name ?? "",
        quantity: String(Number(row.quantity)),
        price: String(Number(row.sale_price_mdl)),
      };
    });
    expect(expectedLines).toHaveLength(2);

    // SI CODUL NU MAI SORTEAZA ALFABETIC, CITIT DIN SURSA.
    //
    // DE CE O VERIFICARE PE SURSA SI NU NUMAI PE ECRAN, si este o limita care merita scrisa
    // decat ascunsa: public.outbound_lines NU ARE O COLOANA DE ORDINE, iar `created_at` este
    // acelasi pe toate liniile unei ieșiri, fiindca ele se scriu in aceeasi tranzacție si
    // `now()` este constant intr-o tranzacție. Ordinea efectiva cade deci pe `id`, care este
    // un uuid, deci pentru aceste doua produse ea coincide cu ordinea alfabetica pe
    // aproximativ jumatate din rulari. O asertiune "ordinea nu este cea alfabetica" ar fi
    // fost INSTABILA, iar un test instabil intr-un sistem de stocuri se repara sau se
    // sterge, niciodata nu se reincearca (playwright.config.ts, `retries: 0`).
    //
    // CELE DOUA JUMATATI IMPREUNA SUNT DECISIVE si niciuna nu este instabila: asertiunea de
    // mai sus spune ca factura arata EXACT ordinea pe care o da baza la aceeasi cerere, iar
    // aceasta spune ca in cod nu mai exista nicio a doua ordine care sa o rastoarne.
    //
    // ACEEASI FORMA CA VERIFICAREA DE STERGERE DIN CAZUL 6 al acestei specificatii, tiparul
    // pus la incercare inclusiv: un grep care nu se potriveste cu nimic trece pentru
    // totdeauna.
    {
      const { readFile } = await import("node:fs/promises");
      const source = await readFile("lib/data/facturare-create.ts", "utf8");

      /** Forma unei sortari pe numele produsului, oriunde in fisier. */
      const SORT = /\.sort\s*\([^)]*productName/;
      expect(
        SORT.test(source),
        "lib/data/facturare-create.ts nu mai sorteaza liniile pe numele produsului",
      ).toBe(false);
      expect(
        SORT.test('  .sort((a, b) => a.productName.localeCompare(b.productName, "ro"));'),
        "tiparul ar prinde chiar sortarea pe care cardul a scos-o",
      ).toBe(true);

      // SI ORDINEA ESTE CERUTA, EXPLICIT, pe resursa incorporata: o resursa PostgREST fara
      // `order` nu promite nicio ordine, deci scoaterea sortarii singura nu ar fi o ordine.
      expect(source, "citirea cere ordinea liniilor ieșirii").toContain(
        'referencedTable: "outbound_lines"',
      );
      // SI COMENTARIUL SPUNE CE FACE CODUL, care este jumatatea pe care constatarea o
      // numeste: comentariul vechi spunea ca ordinea vine de la baza in timp ce codul o
      // rastorna.
      expect(source, "comentariul nu mai pretinde o ordine pe care codul o rastoarna").not.toContain(
        "in ordinea in care baza le da",
      );
    }

    const rows = page.getByTestId("factura-editor-linie");
    await expect(rows).toHaveCount(2);
    for (const [index, expected] of expectedLines.entries()) {
      await expect(
        page.getByTestId(`editor-produs-${index}`).locator("input"),
        `produsul de pe poziția ${index + 1}`,
      ).toHaveValue(expected.name);
      await expect(
        page.getByTestId(`editor-cantitate-${index}`),
        `cantitatea de pe poziția ${index + 1}`,
      ).toHaveValue(expected.quantity);
      await expect(
        page.getByTestId(`editor-pret-${index}`),
        `prețul de pe poziția ${index + 1}`,
      ).toHaveValue(expected.price);
      // Unitatea vine de pe produs, care este in bucati.
      await expect(page.getByTestId(`editor-unitate-${index}`)).toHaveValue("pcs");
    }

    // --- TOTALURILE, IN LEI CU DOI BANI ------------------------------------
    // 3 x 100 = 300, 2 x 50 = 100, subtotal 400, TVA 20% = 80, total 480.
    await expect(page.getByTestId("factura-editor-tva")).toHaveValue(String(VAT));
    await expect(page.getByTestId("factura-editor-subtotal")).toHaveText(formatMoneyExact(400));
    await expect(page.getByTestId("factura-editor-tva-total")).toHaveText(formatMoneyExact(80));
    await expect(page.getByTestId("factura-editor-total")).toHaveText(formatMoneyExact(480));

    // --- O CANTITATE SCHIMBATA CAT TIMP ESTE CIORNA MUTA TOTALURILE ---------
    // Prima poziție, dusa la 5 bucati. Care dintre cele doua este prima nu se presupune:
    // cantitatea si prețul se citesc din liniile stocate, in ordinea in care baza le-a dat
    // la cererea de mai sus, deci aritmetica urmează ecranul si nu o presupunere a testului.
    const first = expectedLines[0]!;
    const firstTotalBefore = Number(first.quantity) * Number(first.price);
    await expect(page.getByTestId("editor-total-0")).toHaveText(formatMoneyExact(firstTotalBefore * 1.2));
    await page.getByTestId("editor-cantitate-0").fill("5");
    const firstAfter = 5 * Number(first.price);
    await expect(page.getByTestId("editor-total-0")).toHaveText(formatMoneyExact(firstAfter * 1.2));
    const secondSubtotal = Number(expectedLines[1]!.quantity) * Number(expectedLines[1]!.price);
    const subtotal = firstAfter + secondSubtotal;
    await expect(page.getByTestId("factura-editor-subtotal")).toHaveText(formatMoneyExact(subtotal));
    await expect(page.getByTestId("factura-editor-tva-total")).toHaveText(
      formatMoneyExact(Math.round(firstAfter * VAT) / 100 + Math.round(secondSubtotal * VAT) / 100),
    );
    await expect(page.getByTestId("factura-editor-total")).toHaveText(formatMoneyExact(subtotal * 1.2));

    // --- SALVATA CA CIORNA, IAR BAZA CALCULEAZA ACELEASI NUMERE -------------
    await page.getByTestId("factura-editor-salveaza").click();
    await expect(page).toHaveURL(/\/facturare\/[0-9a-f-]{36}$/, { timeout: 25_000 });
    const invoiceId = invoiceIdFromUrl(page);

    await expect(page.getByTestId("factura-stare")).toHaveText(invoiceStatusLabel("draft"));
    await expect(lines(page)).toHaveCount(2);
    await expect(page.getByTestId("factura-subtotal")).toHaveText(formatMoneyExact(subtotal));
    await expect(page.getByTestId("factura-total")).toHaveText(formatMoneyExact(subtotal * 1.2));

    // TVA PE LINIE: fiecare linie isi poarta suma si cota, iar TVA facturii este suma
    // celulelor de pe ecran si nu un al doilea calcul al testului.
    const lineVat = await lines(page)
      .getByTestId("factura-linie-tva")
      .evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()));
    expect(lineVat).toHaveLength(2);
    await expect(page.getByTestId("factura-tva")).toHaveText(
      formatMoneyExact(lineVat.reduce((total, text) => total + fromMoney(text), 0)),
    );
    for (const cota of await lines(page)
      .getByTestId("factura-linie-tva-cota")
      .evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()))) {
      expect(cota, "cota de pe linie").toBe(`${VAT} %`);
    }

    // Subsolul scrie exact cele trei cuvinte ale liniei goalului.
    const foot = (await page.getByTestId("factura-totaluri").innerText()).replace(/\s+/g, " ");
    expect(foot).toContain("Subtotal");
    expect(foot).toContain("TVA");
    expect(foot).toContain("Total de plată");

    // SI CLIENTUL, PROIECTUL SI IESIREA SUNT CELE ALE IESIRII.
    await expect(page.getByTestId("factura-client-link")).toHaveText(client.name);
    await expect(page.getByTestId("factura-proiect-link")).toHaveText(project.name);
    await expect(page.getByTestId("factura-iesire")).toHaveText(issue.reference);

    // Iar baza a scris chiar totalul de pe ecran.
    const row = await readInvoice(invoiceId);
    expect(row.status).toBe("draft");
    expect(row.totalMdl).toBeCloseTo(subtotal * 1.2, 2);
    expect(row.numberText, "o ciorna nu are numar").toBeNull();
  });

  // -------------------------------------------------------------------------
  // Clauza 2: Emite intreaba intai, numeste numarul, si baza il aloca.
  // -------------------------------------------------------------------------
  test("2. Emite confirmă întâi cu numărul în propoziție, apoi baza îl alocă, iar a doua factură ia numărul următor", async ({
    page,
  }) => {
    const client = await createClientRow("C2");
    const project = await createProjectRow(client.id, "C2");
    const first = await createIssue(project.id, "c2a", [
      { product: productA, quantity: 1, price: 200 },
    ]);
    const second = await createIssue(project.id, "c2b", [
      { product: productB, quantity: 1, price: 300 },
    ]);

    // --- PRIMA FACTURA ------------------------------------------------------
    const expectedFirst = await nextNumberInSeries();
    const expectedFirstText = invoiceNumberText(SERIES, expectedFirst)!;

    await page.goto(`/facturare/nou?iesire=${first.id}`);
    await expect(page.getByTestId("factura-editor")).toBeVisible({ timeout: 25_000 });

    // NU SE EMITE PANA NU SE CONFIRMA, si confirmarea spune ce se intampla si ce numar.
    await expect(page.getByTestId("factura-editor-emite-confirmare")).toHaveCount(0);
    await page.getByTestId("factura-editor-emite").click();
    const ask = page.getByTestId("factura-editor-emite-confirmare");
    await expect(ask).toBeVisible();
    const asked = (await ask.innerText()).replace(/\s+/g, " ");
    expect(asked, "confirmarea numeste numarul care va fi alocat").toContain(expectedFirstText);
    expect(asked, "confirmarea spune ca factura nu se mai modifica").toContain("nu se mai poate modifica");
    expect(asked, "confirmarea spune ce rămâne posibil").toContain("anula");

    // SI NU MAI DA NUMARUL CA FAPT. Cardul P3-115, constatarea G8: numarul este citit
    // cand se randeaza pagina, deci doi operatori cu pagina deschisa erau promisi
    // amandoi acelasi numar. Propozitia il numeste in continuare, fiindca este
    // informatia utila, dar spune sub ce condiție.
    expect(asked, "confirmarea spune ca numarul nu este o promisiune").toContain(
      "dacă nimeni nu emite înaintea ta",
    );
    expect(asked, "confirmarea nu mai spune 'primește numărul X' ca pe un fapt").not.toContain(
      `primește numărul ${expectedFirstText}`,
    );

    await page.getByTestId("factura-editor-emite-da").click();
    await expect(page).toHaveURL(/\/facturare\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    const firstInvoiceId = invoiceIdFromUrl(page);

    await expect(page.getByTestId("factura-stare")).toHaveText(invoiceStatusLabel("issued"));
    const firstRow = await readInvoice(firstInvoiceId);
    expect(firstRow.status).toBe("issued");
    expect(firstRow.series).toBe(SERIES);
    expect(firstRow.number, "numarul alocat este chiar cel numit in confirmare").toBe(expectedFirst);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(expectedFirstText);

    // --- A DOUA FACTURA IA NUMARUL URMATOR --------------------------------
    await page.goto(`/facturare/nou?iesire=${second.id}`);
    await expect(page.getByTestId("factura-editor")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("factura-editor-emite").click();
    await expect(page.getByTestId("factura-editor-emite-confirmare")).toBeVisible();
    await page.getByTestId("factura-editor-emite-da").click();
    await expect(page).toHaveURL(/\/facturare\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    const secondRow = await readInvoice(invoiceIdFromUrl(page));
    expect(secondRow.number, "a doua factura ia numarul urmator, fara gol si fara repetare").toBe(
      expectedFirst + 1,
    );

    // --- O FACTURA EMISA NU SE MAI MODIFICA, IAR REFUZUL VINE DE LA BAZA ----
    // Nu de la ecran: cererea merge direct la PostgREST, fara nicio pagina in cale.
    for (const [what, body] of [
      ["nota", { notes: `nota strecurata ${RUN}` }],
      ["numarul", { number: 9999 }],
      ["totalul", { total_mdl: 1 }],
    ] as const) {
      const refused = await patchInvoice(firstInvoiceId, body);
      expect(refused.ok, `${what} unei facturi emise a fost SCHIMBAT`).toBe(false);
      expect(refused.text, `refuzul bazei explica de ce (${what})`).toContain("nu mai este ciorna");
    }
    const after = await readInvoice(firstInvoiceId);
    expect(after.number, "numarul a rămas cel alocat").toBe(expectedFirst);

    // SI ECRANUL NU MAI OFERA MODIFICAREA, care este curtoazia de deasupra garantiei.
    await page.goto(`/facturare/${firstInvoiceId}`);
    await expect(page.getByTestId("factura-stare")).toHaveText(invoiceStatusLabel("issued"));
    await expect(page.getByTestId("factura-modifica")).toHaveCount(0);
    await expect(page.getByTestId("factura-emite")).toHaveCount(0);
  });

  // -------------------------------------------------------------------------
  // Clauza 3: Marchează plătită, cu ziua, si dupa ea nimic altceva.
  // -------------------------------------------------------------------------
  test("3. o factură emisă se marchează plătită cu o zi, și după aceea nu se mai oferă nicio acțiune", async ({
    page,
  }) => {
    const client = await createClientRow("C3");
    const invoiceId = await seedDraft(client.id, null, [
      { description: `Serviciu de test ${RUN}`, quantity: 2, unitPrice: 125 },
    ]);
    await issueViaApi(invoiceId);

    await page.goto(`/facturare/${invoiceId}`);
    await expect(page.getByTestId("factura-stare")).toHaveText(invoiceStatusLabel("issued"), {
      timeout: 25_000,
    });

    await page.getByTestId("factura-platita").click();
    await expect(page.getByTestId("factura-platita-confirmare")).toBeVisible();
    // Casuta de data este cea romaneasca a cardului P3-49, zz.ll.aaaa, si vine plina cu
    // ziua de azi.
    await expect(page.getByTestId("factura-platita-data")).toHaveValue(ro(TODAY));
    await page.getByTestId("factura-platita-da").click();

    await expect(page.getByTestId("factura-stare")).toHaveText(invoiceStatusLabel("paid"), {
      timeout: 25_000,
    });

    // ZIUA ESTE STOCATA, si este ziua calendaristica din Chisinau a momentului scris.
    const row = await readInvoice(invoiceId);
    expect(row.status).toBe("paid");
    expect(row.paidAt, "plata are un moment scris").not.toBeNull();
    const paidDay = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Chisinau",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(row.paidAt!));
    expect(paidDay, "ziua plății este ziua aleasă").toBe(TODAY);

    // SI PE ECRAN, in istoric, cu eticheta ei.
    await expect(page.getByTestId("factura-istoric")).toContainText("Marcată plătită");

    // --- NIMIC NU SE MAI OFERA ---------------------------------------------
    for (const action of [
      "factura-modifica",
      "factura-emite",
      "factura-platita",
      "factura-anuleaza",
      "factura-actiuni",
    ]) {
      await expect(page.getByTestId(action), `${action} nu are ce cauta pe o factura plătită`).toHaveCount(
        0,
      );
    }
    await expect(page.getByTestId("factura-fara-actiuni")).toContainText("plătită");
  });

  // -------------------------------------------------------------------------
  // Clauza 4: Anulează cere un motiv, il pastreaza, pastreaza numarul.
  // -------------------------------------------------------------------------
  test("4. anularea cere un motiv, îl păstrează, păstrează numărul, rămâne pe listă, iar numărul nu se refolosește", async ({
    page,
  }) => {
    const client = await createClientRow("C4");
    const invoiceId = await seedDraft(client.id, null, [
      { description: `Material de test ${RUN}`, quantity: 1, unitPrice: 400 },
    ]);
    await issueViaApi(invoiceId);
    const issued = await readInvoice(invoiceId);
    expect(issued.number, "factura este emisa si are numar").not.toBeNull();

    await page.goto(`/facturare/${invoiceId}`);
    await expect(page.getByTestId("factura-stare")).toHaveText(invoiceStatusLabel("issued"), {
      timeout: 25_000,
    });

    // --- FARA MOTIV, ANULAREA ESTE REFUZATA --------------------------------
    await page.getByTestId("factura-anuleaza").click();
    await expect(page.getByTestId("factura-anuleaza-confirmare")).toBeVisible();
    await page.getByTestId("factura-anuleaza-da").click();
    await expect(page.getByTestId("factura-eroare")).toContainText("motivul", { timeout: 20_000 });
    // Si factura NU s-a mișcat.
    expect((await readInvoice(invoiceId)).status, "factura a rămas emisa").toBe("issued");

    // --- CU MOTIV, SE ANULEAZA, IAR MOTIVUL SE VEDE -------------------------
    const reason = `Clientul a renunțat la comandă, testul ${RUN}`;
    await page.getByTestId("factura-anuleaza-motiv").fill(reason);
    await page.getByTestId("factura-anuleaza-da").click();
    await expect(page.getByTestId("factura-stare")).toHaveText(invoiceStatusLabel("cancelled"), {
      timeout: 25_000,
    });
    await expect(page.getByTestId("factura-motiv-anulare")).toHaveText(reason);

    const cancelled = await readInvoice(invoiceId);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelReason, "motivul este pastrat in baza").toBe(reason);
    expect(cancelled.number, "o factura anulata isi pastreaza numarul").toBe(issued.number);

    // --- RAMANE PE LISTA, SUB NUMARUL EI -----------------------------------
    await page.goto(`/facturare?client=${client.id}&stare=cancelled`);
    const row = page.locator(`[data-testid="facturi-row"][data-id="${invoiceId}"]`);
    await expect(row, "factura anulata rămâne pe lista").toHaveCount(1, { timeout: 25_000 });
    await expect(row.getByTestId("facturi-numar")).toHaveText(issued.numberText!);
    await expect(row.getByTestId("facturi-stare-eticheta")).toHaveText(invoiceStatusLabel("cancelled"));

    // --- URMATOAREA EMITERE NU REFOLOSESTE NUMARUL ANULAT -------------------
    const nextId = await seedDraft(client.id, null, [
      { description: `Material de test 2 ${RUN}`, quantity: 1, unitPrice: 10 },
    ]);
    await issueViaApi(nextId);
    const next = await readInvoice(nextId);
    expect(next.number, "numarul anulat nu se intoarce in serie").not.toBe(issued.number);
    expect(next.number!, "seria merge inainte").toBeGreaterThan(issued.number!);

    // SI O FACTURA ANULATA NU MAI OFERA NIMIC.
    await page.goto(`/facturare/${invoiceId}`);
    for (const action of ["factura-modifica", "factura-emite", "factura-platita", "factura-anuleaza"]) {
      await expect(page.getByTestId(action), `${action} pe o factura anulata`).toHaveCount(0);
    }
    await expect(page.getByTestId("factura-fara-actiuni")).toContainText("anulată");
  });

  // -------------------------------------------------------------------------
  // Clauza 5: nu exista nicio stergere, nicaieri.
  // -------------------------------------------------------------------------
  test("5. nu există nicio ștergere: niciun buton în nicio stare, și nicio cale în stratul de date", async ({
    page,
  }) => {
    const client = await createClientRow("C5");

    const draft = await seedDraft(client.id, null, [
      { description: `Ciorna ${RUN}`, quantity: 1, unitPrice: 10 },
    ]);
    const issued = await seedDraft(client.id, null, [
      { description: `Emisa ${RUN}`, quantity: 1, unitPrice: 20 },
    ]);
    await issueViaApi(issued);
    const paid = await seedDraft(client.id, null, [
      { description: `Platita ${RUN}`, quantity: 1, unitPrice: 30 },
    ]);
    await issueViaApi(paid);
    expect((await patchInvoice(paid, { status: "paid" })).ok, "trecerea la plătită").toBe(true);
    const cancelled = await seedDraft(client.id, null, [
      { description: `Anulata ${RUN}`, quantity: 1, unitPrice: 40 },
    ]);
    await issueViaApi(cancelled);
    expect(
      (await patchInvoice(cancelled, { status: "cancelled", cancel_reason: `motiv ${RUN}` })).ok,
      "trecerea la anulată",
    ).toBe(true);

    // --- NICIUN CONTROL DE STERGERE, IN NICIO STARE ------------------------
    for (const [state, id] of [
      ["ciornă", draft],
      ["emisă", issued],
      ["plătită", paid],
      ["anulată", cancelled],
    ] as const) {
      await page.goto(`/facturare/${id}`);
      await expect(page.getByTestId("factura-stare"), `starea facturii ${state}`).toBeVisible({
        timeout: 25_000,
      });

      // CE SE CAUTA SUNT CONTROALE, nu cuvinte oriunde pe pagina, si distinctia este
      // deliberata: regula este "niciun buton de stergere in nicio stare". Un text care ar
      // spune, corect, ca nimic nu se sterge aici este chiar opusul unei cai de stergere,
      // si o asertiune pe tot textul paginii ar cadea pe el.
      const found = await page.evaluate(() => {
        const main = document.querySelector("main");
        if (!main) throw new Error("pagina nu are <main>");
        const controls = Array.from(main.querySelectorAll("button, a[href], input[type=submit]"));
        const words = ["șterge", "sterge", "ștergere", "stergere", "delete", "elimină", "elimina"];
        return {
          labelled: controls
            .map((el) =>
              `${el.textContent ?? ""} ${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("title") ?? ""}`.toLowerCase(),
            )
            .filter((label) => words.some((w) => label.includes(w))),
          testIds: Array.from(main.querySelectorAll("[data-testid]"))
            .map((el) => el.getAttribute("data-testid") ?? "")
            .filter((id) => /delete|sterge|șterge|remove/i.test(id)),
        };
      });
      expect(found.labelled, `pe o factura ${state} exista un control de stergere`).toEqual([]);
      expect(found.testIds, `pe o factura ${state} exista un id de control de stergere`).toEqual([]);
    }

    // --- SI NICIO CALE IN STRATUL DE DATE ---------------------------------
    //
    // Verificata si nu afirmata in proza: fisierele se citesc chiar de aici.
    //
    // CE SE CAUTA ESTE O CALE, NU UN CUVANT, SI ASTA ESTE O CORECTIE. Prima versiune cauta
    // cuvantul englezesc pe orice linie si a picat rularea 36491851648 pe un singur caz din
    // 474: lib/data/facturare-actions.ts CITEAZA linia goalului, "Nothing is ever deleted",
    // ca sa spuna care regula se respecta acolo unde ea se aplica.
    //
    // UN CUVANT NU POATE FI SEMNALUL AICI, si nu doar din cauza acelui comentariu. Aceeasi
    // functie intoarce operatorului propozitia romaneasca "nimic nu se șterge aici", care
    // este un sir pe o linie care se executa si care este exact OPUSUL unei cai de stergere.
    // O verificare pe cuvant ar cadea pe ambele propozitii care ENUNTA regula, si ar trece
    // linistita peste un `.delete(` scris in romaneste ca `.delete(`.
    //
    // CE SE CAUTA DECI ESTE FORMA UNUI APEL CARE STERGE, pe orice linie, comentariu inclus,
    // fiindca o cale scrisa si comentata este tot o cale pe care cineva o decomenteaza. Cele
    // patru forme acopera tot ce acest strat are la dispozitie: metoda `delete` a lui
    // supabase-js, `remove` a storage-ului, un DELETE in SQL brut, si un DELETE trimis de
    // mana prin fetch. Jumatatea de baza de date a aceleiasi reguli este deja dovedita de
    // partea 1: authenticated nu are drept de stergere pe niciuna din cele patru tabele, nu
    // exista nicio politica de stergere, si sectiunea 11 a migratiei 0063 verifica amandoua
    // la fiecare rulare, pe productie inclusiv.
    const { readdir, readFile } = await import("node:fs/promises");
    const names = (await readdir("lib/data")).filter((f) => f.startsWith("facturare"));
    expect(names.length, "exista fisiere lib/data/facturare*").toBeGreaterThan(3);

    /** Forma unui apel care sterge, oriunde in fisier. */
    const CALL = [/\.delete\s*\(/, /\.remove\s*\(/, /\bdelete\s+from\b/i, /method:\s*["'`]DELETE["'`]/i];

    const offenders: string[] = [];
    for (const name of names) {
      const body = await readFile(`lib/data/${name}`, "utf8");
      body.split("\n").forEach((line, index) => {
        if (CALL.some((re) => re.test(line))) {
          offenders.push(`lib/data/${name}:${index + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders, "nicio cale de stergere in stratul de date al facturarii").toEqual([]);

    // SI VERIFICAREA INSASI POATE CADEA, ceea ce este jumatatea pe care o uita oricine scrie
    // un grep intr-un test: un tipar care nu se potriveste cu nimic trece pentru totdeauna.
    // Cele patru forme sunt puse la incercare pe patru linii scrise aici, care sunt exact ce
    // ar arata o cale de stergere in acest strat.
    for (const sample of [
      'await supabase.from("invoices").delete().eq("id", id);',
      'await supabase.storage.from("rc-docs").remove([path]);',
      "delete from public.invoices where id = $1",
      'await fetch(url, { method: "DELETE" });',
    ]) {
      expect(
        CALL.some((re) => re.test(sample)),
        `tiparul nu ar prinde o cale reala de stergere: ${sample}`,
      ).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // Clauza 6: butonul dezactivat spune de ce, in romana, langa el.
  // -------------------------------------------------------------------------
  test("6. Creează factură este dezactivat cu motivul în română când ieșirea are o poziție fără preț și când are deja o factură", async ({
    page,
  }) => {
    const client = await createClientRow("C6");
    const project = await createProjectRow(client.id, "C6");

    const unpriced = await createIssue(project.id, "c6a", [
      { product: productA, quantity: 1, price: 100 },
      { product: productB, quantity: 1, price: null },
    ]);
    const invoiced = await createIssue(project.id, "c6b", [
      { product: productA, quantity: 1, price: 70 },
    ]);
    const clean = await createIssue(project.id, "c6c", [
      { product: productB, quantity: 1, price: 90 },
    ]);

    // O factura care exista deja pentru a doua iesire.
    const existing = await seedDraft(
      client.id,
      project.id,
      [{ description: `Deja facturat ${RUN}`, quantity: 1, unitPrice: 70 }],
      invoiced.id,
    );

    // --- O POZITIE FARA PRET ----------------------------------------------
    await openIssuePanel(page, unpriced.reference);
    await expect(page.getByTestId("issue-create-invoice")).toBeDisabled();
    await expect(page.getByTestId("issue-invoice-reason")).toContainText("fără preț");
    await expect(page.getByTestId("issue-invoice-existing")).toHaveCount(0);

    // --- O FACTURA CARE EXISTA DEJA, SI LEGATURA CATRE EA ------------------
    await openIssuePanel(page, invoiced.reference);
    await expect(page.getByTestId("issue-create-invoice")).toBeDisabled();
    await expect(page.getByTestId("issue-invoice-reason")).toContainText("Există deja o factură");
    const link = page.getByTestId("issue-invoice-existing");
    await expect(link).toHaveAttribute("href", `/facturare/${existing}`);

    // --- TOTUL IN REGULA: BUTONUL MERGE ------------------------------------
    await openIssuePanel(page, clean.reference);
    const create = page.getByTestId("issue-create-invoice");
    await expect(create).toBeEnabled();
    await expect(page.getByTestId("issue-invoice-reason")).toContainText("trec pe factură");
    await create.click();
    await expect(page.getByTestId("factura-editor")).toBeVisible({ timeout: 25_000 });

    // --- SI RUTA REFUZA DIRECT, CU ACELASI MOTIV, cand se cere de mana ------
    // Un buton dezactivat nu este o poarta: adresa poate fi scrisa in bara.
    await page.goto(`/facturare/nou?iesire=${unpriced.id}`);
    await expect(page.getByTestId("factura-refuz")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("factura-refuz")).toContainText("fără preț");
    await expect(page.getByTestId("factura-editor")).toHaveCount(0);
  });

  // -------------------------------------------------------------------------
  // Clauza 7: fisa clientului si fisa proiectului isi listeaza facturile.
  // -------------------------------------------------------------------------
  test("7. fișa clientului și fișa proiectului listează fiecare facturile acelei înregistrări", async ({
    page,
  }) => {
    const client = await createClientRow("C7");
    const project = await createProjectRow(client.id, "C7");
    const other = await createClientRow("C7b");

    const withProject = await seedDraft(client.id, project.id, [
      { description: `Pe santier ${RUN}`, quantity: 1, unitPrice: 100 },
    ]);
    await issueViaApi(withProject);
    const withoutProject = await seedDraft(client.id, null, [
      { description: `Fara santier ${RUN}`, quantity: 1, unitPrice: 50 },
    ]);

    const numbers = await readInvoice(withProject);

    // --- FISA CLIENTULUI: AMANDOUA -----------------------------------------
    await page.goto(`/clienti/${client.id}?fila=facturi`);
    await expect(page.getByTestId("panel-facturi")).toBeVisible({ timeout: 25_000 });
    const clientRows = page.getByTestId("record-invoice-row");
    await expect(clientRows).toHaveCount(2);
    const ids = await clientRows.evaluateAll((els) => els.map((e) => e.getAttribute("data-id") ?? ""));
    expect(new Set(ids)).toEqual(new Set([withProject, withoutProject]));

    // Numarul este o legatura catre ecranul facturii, si ea chiar se deschide.
    const numbered = page.locator(`[data-testid="record-invoice-row"][data-id="${withProject}"]`);
    await expect(numbered.getByTestId("record-invoice-numar")).toHaveText(numbers.numberText!);
    await numbered.getByTestId("record-invoice-numar").click();
    await expect(page).toHaveURL(new RegExp(`/facturare/${withProject}$`), { timeout: 25_000 });

    // --- FISA PROIECTULUI: NUMAI CEA CU PROIECT ---------------------------
    await page.goto(`/proiecte/${project.id}?fila=facturi`);
    await expect(page.getByTestId("panel-facturi")).toBeVisible({ timeout: 25_000 });
    const projectRows = page.getByTestId("record-invoice-row");
    await expect(projectRows).toHaveCount(1);
    await expect(projectRows.first()).toHaveAttribute("data-id", withProject);

    // --- UN CLIENT FARA NICIO FACTURA: STARE GOALA ROMANEASCA -------------
    await page.goto(`/clienti/${other.id}?fila=facturi`);
    await expect(page.getByTestId("record-invoices-empty")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("record-invoices-empty")).toContainText("Nicio factură");
    await expect(page.getByTestId("record-invoice-row")).toHaveCount(0);
  });

  // -------------------------------------------------------------------------
  // Clauza 8: Factură nouă de pe lista, cu totul ales de mana.
  // -------------------------------------------------------------------------
  test("8. Factură nouă de pe listă deschide un formular gol și o ciornă scrisă de mână ajunge pe listă", async ({
    page,
  }) => {
    const client = await createClientRow("C8");

    await page.goto("/facturare");
    const button = page.getByTestId("facturi-noua");
    await expect(button).toBeVisible({ timeout: 25_000 });
    await button.click();
    await expect(page).toHaveURL(/\/facturare\/nou$/, { timeout: 25_000 });
    await expect(page.getByTestId("factura-editor")).toBeVisible({ timeout: 25_000 });

    // NIMIC NU ESTE COMPLETAT: clientul si proiectul se aleg, nu se citesc.
    await expect(page.getByTestId("factura-editor-client")).toBeVisible();
    await expect(page.getByTestId("factura-editor-client-nume")).toHaveCount(0);
    await expect(page.getByTestId("editor-cantitate-0")).toHaveValue("");
    await expect(page.getByTestId("editor-pret-0")).toHaveValue("");

    // --- TOTUL DE MANA ----------------------------------------------------
    await comboPick(page, "factura-editor-client", client.name);
    await comboPick(page, "editor-produs-0", productA.name);
    await expect(page.getByTestId("editor-unitate-0")).toHaveValue("pcs");
    await page.getByTestId("editor-cantitate-0").fill("4");
    await page.getByTestId("editor-pret-0").fill("25");
    // 4 x 25 = 100, TVA 20 = 20, total 120.
    await expect(page.getByTestId("factura-editor-total")).toHaveText(formatMoneyExact(120));

    await page.getByTestId("factura-editor-salveaza").click();
    await expect(page).toHaveURL(/\/facturare\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    const invoiceId = invoiceIdFromUrl(page);

    await expect(page.getByTestId("factura-stare")).toHaveText(invoiceStatusLabel("draft"));
    await expect(page.getByTestId("factura-client-link")).toHaveText(client.name);
    await expect(page.getByTestId("factura-proiect")).toHaveText("Fără proiect");
    await expect(lines(page)).toHaveCount(1);
    await expect(lines(page).first().getByTestId("factura-linie-denumire")).toHaveText(productA.name);
    await expect(lines(page).first().getByTestId("factura-linie-cantitate")).toHaveText(
      formatQty(4, "pcs"),
    );
    await expect(page.getByTestId("factura-total")).toHaveText(formatMoneyExact(120));

    // --- SI AJUNGE PE LISTA, CU TOTALUL PE CARE IL DAU LINIILE ------------
    await page.goto(`/facturare?client=${client.id}`);
    const row = page.locator(`[data-testid="facturi-row"][data-id="${invoiceId}"]`);
    await expect(row).toHaveCount(1, { timeout: 25_000 });
    await expect(row.getByTestId("facturi-numar")).toHaveText("Fără număr");
    await expect(row.getByTestId("facturi-total-rand")).toHaveText(formatMoneyExact(120));

    const stored = await readInvoice(invoiceId);
    expect(stored.status).toBe("draft");
    expect(stored.totalMdl).toBeCloseTo(120, 2);
  });

  // -------------------------------------------------------------------------
  // Clauza 9: telefonul de 390x844, pe amandoua ecranele noi.
  // -------------------------------------------------------------------------
  test("9. pe un telefon de 390x844 ecranul de creare și ecranul facturii nu se derulează lateral, iar liniile sunt carduri", async ({
    page,
  }, testInfo) => {
    const client = await createClientRow("C9");
    const project = await createProjectRow(client.id, "C9");
    const issue = await createIssue(project.id, "c9", [
      { product: productA, quantity: 2, price: 140 },
      { product: productB, quantity: 1, price: 60 },
    ]);
    const invoiceId = await seedDraft(client.id, project.id, [
      { description: `Prima poziție ${RUN}`, quantity: 2, unitPrice: 140 },
      { description: `A doua poziție ${RUN}`, quantity: 1, unitPrice: 60 },
    ]);
    await issueViaApi(invoiceId);

    // AUTENTIFICAREA S-A FACUT LA LATIMEA DESKTOP, in beforeEach, exact cum o cere restul
    // suitei: o a doua autentificare pe o sesiune care exista deja ar cere /autentificare,
    // de unde proxy-ul intoarce un cont semnat inapoi pe tabloul de bord.
    await page.setViewportSize(PHONE);

    // --- ECRANUL DE CREARE ------------------------------------------------
    await page.goto(`/facturare/nou?iesire=${issue.id}`);
    await expect(page.getByTestId("factura-editor")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("factura-editor-linie")).toHaveCount(2);
    expectPhoneClean(await readPhone(page, "factura-editor-linie"), "ecranul de creare", 2);
    await page.screenshot({ path: testInfo.outputPath("factura-creare-telefon.png"), fullPage: true });

    // --- ECRANUL FACTURII -------------------------------------------------
    await page.goto(`/facturare/${invoiceId}`);
    await expect(page.getByTestId("factura-stare")).toBeVisible({ timeout: 25_000 });
    await expect(lines(page)).toHaveCount(2);
    expectPhoneClean(await readPhone(page, "factura-linie"), "ecranul facturii", 2);
    await page.screenshot({ path: testInfo.outputPath("factura-telefon.png"), fullPage: true });
  });

  // -------------------------------------------------------------------------
  // P3-111, goal G67. Cazurile 10 si 11.
  // -------------------------------------------------------------------------

  /** Cele patru cazuri masurate de docs/reports/2026-09-29-critic-bug-sweep-2.md,
   *  finding G4, cu figurile scrise de mana. Al treilea este chiar defectul: ecranul
   *  arata 8,16 si baza scria 8,17.
   *
   *  Cantitatea si preţul sunt scrise cu PUNCT zecimal fiindca amandoua casutele sunt
   *  `<input type="number">`, iar valoarea unui camp numeric este intotdeauna cu punct.
   *  Cota este 20, adica VAT. */
  const MEASURED = [
    { quantity: "0.333", price: "1000.00", subtotal: 333.0, vat: 66.6, total: 399.6 },
    { quantity: "1.005", price: "1.00", subtotal: 1.01, vat: 0.2, total: 1.21 },
    { quantity: "8.165", price: "1.00", subtotal: 8.17, vat: 1.63, total: 9.8 },
    { quantity: "1234.565", price: "1.00", subtotal: 1234.57, vat: 246.91, total: 1481.48 },
  ] as const;

  test("10. numărul de pe ecran este numărul care se stochează, pe cele patru cazuri măsurate", async ({
    page,
  }) => {
    const client = await createClientRow("C10");

    await page.goto("/facturare/nou");
    await expect(page.getByTestId("factura-editor")).toBeVisible({ timeout: 25_000 });
    await comboPick(page, "factura-editor-client", client.name);
    await expect(page.getByTestId("factura-editor-tva")).toHaveValue(String(VAT));

    // PATRU POZITII, scrise de mana: ce se probeaza este aritmetica si nu catalogul, iar
    // o linie cu denumire si fara produs este exact ce constrangerea
    // invoice_lines_product_or_description cere.
    for (let i = 1; i < MEASURED.length; i += 1) {
      await page.getByTestId("factura-editor-adauga").click();
    }
    await expect(page.getByTestId("factura-editor-linie")).toHaveCount(MEASURED.length);

    for (const [index, item] of MEASURED.entries()) {
      await page.getByTestId(`editor-denumire-${index}`).fill(`Poziția ${index + 1} ${RUN}`);
      await page.getByTestId(`editor-cantitate-${index}`).fill(item.quantity);
      await page.getByTestId(`editor-pret-${index}`).fill(item.price);
    }

    // --- CE ARATA ECRANUL, CITIT INAINTE DE ORICE SALVARE -----------------
    const shown: number[] = [];
    for (const [index, item] of MEASURED.entries()) {
      const cell = page.getByTestId(`editor-total-${index}`);
      await expect(
        cell,
        `poziția ${index + 1}: ${item.quantity} x ${item.price} trebuie să arate ${item.total}`,
      ).toHaveText(formatMoneyExact(item.total));
      shown.push(fromMoney((await cell.textContent()) ?? ""));
    }

    // 333,00 + 1,01 + 8,17 + 1234,57 = 1576,75; TVA 66,60 + 0,20 + 1,63 + 246,91 =
    // 315,34; total 1892,09. Subsolul aduna figuri DEJA rotunjite, care este ordinea pe
    // care o foloseste si declansatorul invoice_lines_sync_invoice_totals.
    const wantSubtotal = 1576.75;
    const wantVat = 315.34;
    const wantTotal = 1892.09;
    await expect(page.getByTestId("factura-editor-subtotal")).toHaveText(
      formatMoneyExact(wantSubtotal),
    );
    await expect(page.getByTestId("factura-editor-tva-total")).toHaveText(formatMoneyExact(wantVat));
    await expect(page.getByTestId("factura-editor-total")).toHaveText(formatMoneyExact(wantTotal));

    // --- SI CE STOCHEAZA BAZA, DUPA SALVARE ------------------------------
    await page.getByTestId("factura-editor-salveaza").click();
    await expect(page).toHaveURL(/\/facturare\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    const invoiceId = invoiceIdFromUrl(page);

    const stored = await asOwner(
      `invoice_lines?select=quantity,unit_price_mdl,line_subtotal_mdl,line_vat_mdl,line_total_mdl,sort_order&invoice_id=eq.${invoiceId}&order=sort_order.asc`,
    );
    expect(stored.rows, "cele patru poziții au fost scrise").toHaveLength(MEASURED.length);

    for (const [index, item] of MEASURED.entries()) {
      const row = stored.rows[index]!;
      const where = `poziția ${index + 1}, ${item.quantity} x ${item.price}`;
      expect(Number(row.line_subtotal_mdl), `${where}: subtotalul stocat`).toBe(item.subtotal);
      expect(Number(row.line_vat_mdl), `${where}: TVA stocat`).toBe(item.vat);
      expect(Number(row.line_total_mdl), `${where}: totalul stocat`).toBe(item.total);
      // SI ACEEASI FIGURA ERA PE ECRAN, care este chiar afirmatia pe care antetul
      // ecranului o face si care era falsa pana la acest card.
      expect(shown[index], `${where}: ecranul arăta exact figura care s-a stocat`).toBe(
        Number(row.line_total_mdl),
      );
    }

    const invoice = await readInvoice(invoiceId);
    expect(invoice.totalMdl, "totalul stocat al facturii").toBe(wantTotal);
    const foot = await asOwner(
      `invoices?select=subtotal_mdl,vat_total_mdl,total_mdl&id=eq.${invoiceId}`,
    );
    expect(Number(foot.rows[0]!.subtotal_mdl), "Subtotalul stocat").toBe(wantSubtotal);
    expect(Number(foot.rows[0]!.vat_total_mdl), "TVA stocat pe factură").toBe(wantVat);

    // SI ECRANUL FACTURII ARATA ACELEASI TREI FIGURI.
    await expect(page.getByTestId("factura-total")).toHaveText(formatMoneyExact(wantTotal));
  });

  test("11. o ieșire care a primit o factură între timp este refuzată în română, nu cu o eroare de bază", async ({
    page,
  }) => {
    const client = await createClientRow("C11");
    const project = await createProjectRow(client.id, "C11");
    const release = await createIssue(project.id, "c11", [
      { product: productA, quantity: 2, price: 55 },
    ]);

    // Ecranul se deschide cand iesirea nu are nicio factura, exact ca in cazul 1.
    await page.goto(`/facturare/nou?iesire=${release.id}`);
    await expect(page.getByTestId("factura-editor")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("factura-editor-client-nume")).toHaveText(client.name);

    // A DOUA FILA, sau un coleg, factureaza aceeasi iesire CAT TIMP aceasta pagina este
    // deschisa. Pana la cardul P3-111 amandoua apasarile reuseau, iar niciuna din cele
    // doua facturi nu putea fi stearsa: singura ieșire era sa fie anulata una, ceea ce
    // consuma un al doilea numar dintr-o serie legala.
    const already = await seedDraft(
      client.id,
      project.id,
      [{ description: `Facturat intre timp ${RUN}`, quantity: 2, unitPrice: 55 }],
      release.id,
    );

    await page.getByTestId("factura-editor-salveaza").click();

    const error = page.getByTestId("factura-editor-eroare");
    await expect(error, "ecranul arată un refuz").toBeVisible({ timeout: 25_000 });
    await expect(error, "refuzul este propoziția românească, cu diacritice").toContainText(
      "Există deja o factură pentru această ieșire",
    );
    // SI NU ESTE UN MESAJ DE BAZA DE DATE. Numele indexului si codul PostgreSQL sunt
    // exact ce operatorul nu trebuie sa vada.
    const shown = (await error.textContent()) ?? "";
    expect(shown, "numele indexului nu ajunge pe ecran").not.toContain(
      "invoices_one_live_per_outbound_issue",
    );
    expect(shown, "codul PostgreSQL nu ajunge pe ecran").not.toContain("23505");
    expect(shown.toLowerCase(), "textul brut al erorii nu ajunge pe ecran").not.toContain(
      "duplicate key",
    );

    // SI NICIO A DOUA FACTURA NU A APARUT PE IESIRE.
    const onRelease = await asOwner(
      `invoices?select=id,status&outbound_issue_id=eq.${release.id}`,
    );
    expect(onRelease.rows, "ieșirea poartă exact o factură").toHaveLength(1);
    expect(String(onRelease.rows[0]!.id), "și este cea scrisă între timp").toBe(already);

    // ECRANUL RAMANE PE FORMULAR, cu munca operatorului intacta, si nu il duce nicaieri.
    await expect(page.getByTestId("factura-editor")).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // P3-115, constatarea G12 a docs/reports/2026-09-29-critic-bug-sweep-2.md.
  // -------------------------------------------------------------------------
  test("12. un client fără IDNO primește linia de avertisment, în același stil ca lipsa datelor furnizorului", async ({
    page,
  }) => {
    // DOI CLIENTI, UNUL FARA IDNO SI UNUL CU, fiindca o linie care apare mereu nu este un
    // avertisment. Amandoua jumatatile clauzei se probeaza pe aceeasi pagina, la rand.
    const without = await createClientRow("C12a", { withFiscalCode: false });
    const with_ = await createClientRow("C12b");

    const noIdno = await seedDraft(without.id, null, [
      { description: `Poziție client fără IDNO ${RUN}`, quantity: 1, unitPrice: 10 },
    ]);
    const withIdno = await seedDraft(with_.id, null, [
      { description: `Poziție client cu IDNO ${RUN}`, quantity: 1, unitPrice: 10 },
    ]);

    // --- FARA IDNO: LINIA APARE, CUVANT CU CUVANT, SI SPUNE UNDE SE COMPLETEAZA --
    await page.goto(`/facturare/${noIdno}`);
    const missing = page.getByTestId("factura-client-idno-lipsa");
    await expect(missing).toBeVisible({ timeout: 25_000 });
    await expect(missing).toHaveText(
      "IDNO-ul clientului nu este completat. Se completează pe fișa clientului.",
    );
    // Si casuta insasi spune in continuare ce spunea, ceea ce nu era greşit, doar mut.
    await expect(page.getByTestId("factura-client-idno")).toHaveText("Nu este completat");

    // --- ACELASI STIL CA LINIA FURNIZORULUI, MASURAT SI NU PRESUPUS ------------
    // Datele furnizorului sunt completate de beforeAll, deci linia lui nu se deseneaza. Ca
    // sa poata fi COMPARATE cele doua, numele furnizorului se goleste pentru o clipa si se
    // pune inapoi imediat, in acelasi caz: altfel "in acelasi stil" ar fi o afirmatie pe
    // care nimeni nu o verifica.
    const issuerName = `TEST Rapid Construct ${RUN}`;
    await asService("invoice_settings?id=eq.true", { method: "PATCH", body: { issuer_name: null } });
    try {
      await page.goto(`/facturare/${noIdno}`);
      const supplier = page.getByTestId("factura-emitent-lipsa");
      await expect(supplier, "linia furnizorului se deseneaza cand numele lui lipsește").toBeVisible(
        { timeout: 25_000 },
      );
      const supplierClass = (await supplier.getAttribute("class")) ?? "";
      const clientClass = (await page.getByTestId("factura-client-idno-lipsa").getAttribute("class")) ?? "";
      expect(supplierClass, "linia furnizorului este cea portocalie de avertisment").toContain(
        "text-rc-warn",
      );
      expect(clientClass, "cele doua linii sunt desenate identic").toBe(supplierClass);
    } finally {
      await asService("invoice_settings?id=eq.true", {
        method: "PATCH",
        body: { issuer_name: issuerName },
      });
    }

    // --- CU IDNO: NICIO LINIE, deci nu este un avertisment care apare oricum -----
    await page.goto(`/facturare/${withIdno}`);
    await expect(page.getByTestId("factura-client-idno")).toHaveText(`IDNO-C12b-${RUN}`);
    await expect(page.getByTestId("factura-client-idno-lipsa")).toHaveCount(0);

    // --- SI NU BLOCHEAZA EMITEREA, dinadins ------------------------------------
    // Daca un IDNO lipsa ar trebui sa OPREASCA emiterea este o intrebare de contabil si ea
    // sta cu cele trei variante de e-Factura din raportul de proiectare, nu cu judecata unui
    // terminal. Butonul rămâne oferit.
    await page.goto(`/facturare/${noIdno}`);
    await expect(page.getByTestId("factura-client-idno-lipsa")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("factura-emite"), "avertismentul nu oprește emiterea").toBeEnabled();
  });
});
