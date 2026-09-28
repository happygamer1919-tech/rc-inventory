import { expect, test, type Locator, type Page } from "@playwright/test";
import { ownerAccount, type TestAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { ALL_INVOICE_STATUSES, invoiceNumberText, invoiceStatusLabel } from "@/lib/data/facturare-types";
import { monthRange } from "@/lib/data/facturare-list-types";
import { chisinauToday, formatMoneyExact, plural } from "@/lib/data/format";

// facturare-list.spec - linia de acceptanta a cardului P3-109, goal G65 partea 2.
//
// ECRANUL /facturare: intrarea de meniu, perioada implicita, cele patru filtre,
// cautarea intr-o casuta, linia de totaluri, starea goala, ciorna fara numar, si
// acelasi ecran pe un telefon de 390x844.
//
// CUM SE IZOLEAZA DE RESTUL BAZEI, si aceasta este partea care decide daca fisierul
// poate fi verde de doua ori. DATELE DE TEST NU SE STERG NICIODATA (conventia
// P2-07, si pe facturi nu exista nici drept de stergere), deci tabela poarta
// facturile fiecarei rulari de pana acum, iar o lista filtrata numai pe luna
// curenta le-ar arata pe toate. FIECARE ASERTIUNE DE NUMARARE ARE DECI UN FILTRU DE
// CLIENT PUS, pe un client creat de aceasta rulare: atunci randurile de pe ecran
// sunt exact ale acestui caz si linia de totaluri este verificabila la banut.
//
// TREI CLIENTI, FIECARE CU ROLUL LUI, si nu unul singur: A poarta cate o factura
// din fiecare stare in luna curenta plus una din luna trecuta, ca filtrele de
// stare si de perioada sa aiba ce sa taie; B exista ca filtrul de client si
// cautarea dupa numele clientului sa aiba doua raspunsuri diferite si nu doar unul;
// C poarta douazeci de ciorne, fiindca forma romaneasca "20 de facturi" incepe
// exact la douazeci si nu se poate dovedi cu mai putine.
//
// SERIA ESTE A ACESTEI RULARI. public.issue_invoice calculeaza seria din setari,
// seria este globala, si contorul ei nu se intoarce niciodata, deci doua rulari pe
// aceeasi serie ar numara una peste alta. beforeAll pune prefixul pe o valoare
// proprie rularii si scoate anul din numar, ca seria sa fie exact prefixul; afterAll
// il pune inapoi pe RC-. Exact ce face facturare-data.spec, si pentru acelasi motiv
// scris de cardul P3-101: o valoare pe care logica o CAUTA in toata tabela are
// nevoie de unicitate pe rulare.
//
// NIMIC NU SE STERGE SI NIMIC DIN PRODUCTIE NU SE ATINGE. Fiecare fixtura este
// scrisa de mana prin PostgREST pe stiva locala, cu prefixul TEST in nume.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const MIN_TAP = 44;
const MIN_INPUT_FONT = 16;

/** Coloanele, in ordinea in care ecranul le scrie. Si etichetele de pe telefon. */
const COLUMNS = ["Număr", "Data", "Client", "Proiect", "Total", "Stare"] as const;

/* ------------------------------------------------ API-ul bazei de date -- */

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error(
      "facturare-list.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY si " +
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

/* ------------------------------------------------------------ perioade -- */

const TODAY = chisinauToday();
const THIS_MONTH = monthRange(TODAY);

/** O zi din mijlocul lunii trecute, deci fara nicio grija de capat de luna. */
const PREV_DAY = (() => {
  const year = Number(THIS_MONTH.from.slice(0, 4));
  const month = Number(THIS_MONTH.from.slice(5, 7));
  return month === 1
    ? `${year - 1}-12-15`
    : `${year}-${String(month - 1).padStart(2, "0")}-15`;
})();
const PREV_MONTH = monthRange(PREV_DAY);

/** zz.ll.aaaa, forma pe care o scrie si o citeste casuta de data din P3-49. */
function ro(day: string): string {
  return `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;
}

/* ------------------------------------------------------------- fixturi -- */

// FARA CRATIMA LA CAPAT, si asta nu este cosmetica: invoiceNumberText lipeste o
// cratima intre serie si numar, iar seria implicita este prefixul PLUS anul
// ("RC-" plus "2026"), deci un prefix care se termina in cratima si un an scos din
// numar ar da "TEST-L1ab--0001", cu doua cratime. Numarul cautat mai jos trebuie sa
// fie exact sirul pe care il scrie ecranul.
const SERIES = `TEST-L${RUN}`;

type Seeded = {
  clientA: string;
  clientB: string;
  clientC: string;
  project: string;
  /** Numarul scris al facturii emise a lui A in luna curenta. */
  issuedNumberText: string;
  /** Numarul scris al facturii lui A din luna trecuta, care NU este in luna curenta. */
  olderNumberText: string;
  nameA: string;
  nameB: string;
  nameC: string;
};

let seeded: Seeded;

async function createClient(name: string): Promise<string> {
  const created = await asOwner("clients?select=id", { method: "POST", body: { name, active: true } });
  expect(created.ok, `clientul ${name} nu a putut fi creat: ${created.text}`).toBe(true);
  return String(created.rows[0]!.id);
}

/** Facturi ciorna, intr-un singur apel, cu o linie fiecare tot intr-un singur apel. */
async function createDrafts(
  clientId: string,
  projectId: string | null,
  count: number,
  line: { quantity: number; unitPrice: number },
): Promise<string[]> {
  const created = await asOwner("invoices?select=id", {
    method: "POST",
    body: Array.from({ length: count }, () => ({ client_id: clientId, project_id: projectId })),
  });
  expect(created.ok, `cele ${count} ciorne nu au putut fi create: ${created.text}`).toBe(true);
  const ids = created.rows.map((row) => String(row.id));
  expect(ids, `s-au creat exact ${count} ciorne`).toHaveLength(count);

  const lines = await asOwner("invoice_lines?select=id", {
    method: "POST",
    body: ids.map((id) => ({
      invoice_id: id,
      description: `Linie de test ${RUN}`,
      quantity: line.quantity,
      unit: "pcs",
      unit_price_mdl: line.unitPrice,
      vat_rate: 20,
    })),
  });
  expect(lines.ok, `liniile nu au putut fi adaugate: ${lines.text}`).toBe(true);
  return ids;
}

async function issueOn(invoiceId: string, on: string): Promise<void> {
  const issued = await asOwner("rpc/issue_invoice", {
    method: "POST",
    body: { p_invoice_id: invoiceId, p_issue_date: on, p_due_date: null },
  });
  expect(issued.ok, `emiterea a raspuns ${issued.status}: ${issued.text}`).toBe(true);
}

async function patchInvoice(invoiceId: string, body: Record<string, unknown>): Promise<void> {
  const moved = await asOwner(`invoices?id=eq.${invoiceId}`, { method: "PATCH", body });
  expect(moved.ok, `mutarea facturii a raspuns ${moved.status}: ${moved.text}`).toBe(true);
}

async function readNumberText(invoiceId: string): Promise<string> {
  const got = await asOwner(`invoices?select=series,number&id=eq.${invoiceId}`);
  expect(got.rows, `exact o factura pentru ${invoiceId}`).toHaveLength(1);
  const row = got.rows[0]!;
  const text = invoiceNumberText(String(row.series), Number(row.number));
  expect(text, "factura emisa are serie si numar").not.toBeNull();
  return text!;
}

/* ------------------------------------------------------------- ecranul -- */

function rows(page: Page): Locator {
  return page.getByTestId("facturi-row");
}

/** Adresa ecranului cu filtrele date, fara nicio valoare implicita ascunsa. */
function url(params: Record<string, string>): string {
  const search = new URLSearchParams(params).toString();
  return search === "" ? "/facturare" : `/facturare?${search}`;
}

/** Deschide ecranul si asteapta sa se asezeze pe numarul de randuri cerut. */
async function open(page: Page, params: Record<string, string>, expected: number): Promise<void> {
  await page.goto(url(params));
  await expect(rows(page)).toHaveCount(expected, { timeout: 25_000 });
}

/** Numele clientilor de pe randurile vizibile, in ordinea de pe ecran. */
async function clientNames(page: Page): Promise<string[]> {
  return rows(page)
    .getByTestId("facturi-client-link")
    .evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()));
}

test.describe("P3-109: ecranul Facturi", () => {
  test.describe.configure({ timeout: 240_000 });

  test.beforeAll(async () => {
    ownerToken = await accessToken(ownerAccount());

    // Seria acestei rulari, si anul scos din numar ca seria sa fie chiar prefixul.
    const prefix = await asService("invoice_settings?id=eq.true", {
      method: "PATCH",
      body: { series_prefix: SERIES, number_includes_year: false },
    });
    expect(prefix.ok, `prefixul seriei nu a putut fi pus: ${prefix.text}`).toBe(true);

    const nameA = `TEST Facturi A ${RUN}`;
    const nameB = `TEST Facturi B ${RUN}`;
    const nameC = `TEST Facturi C ${RUN}`;
    const clientA = await createClient(nameA);
    const clientB = await createClient(nameB);
    const clientC = await createClient(nameC);

    const project = await asOwner("projects?select=id", {
      method: "POST",
      body: { client_id: clientA, name: `TEST Șantier Facturi ${RUN}` },
    });
    expect(project.ok, `proiectul de test nu a putut fi creat: ${project.text}`).toBe(true);
    const projectId = String(project.rows[0]!.id);

    // CLIENTUL A: cate o factura din fiecare stare in luna curenta, plus una emisa
    // in luna trecuta. Sumele sunt alese ca fiecare stare sa aiba alta suma, deci o
    // asertiune despre un total nu poate trece din intamplare.
    //   emisa       2 x 50  + 20%  = 120,00
    //   platita     1 x 50  + 20%  =  60,00
    //   anulata     1 x 10  + 20%  =  12,00
    //   ciorna      2 x 10  + 20%  =  24,00
    //   luna trecuta 10 x 50 + 20% = 600,00
    const [issued] = await createDrafts(clientA, projectId, 1, { quantity: 2, unitPrice: 50 });
    const [paid] = await createDrafts(clientA, projectId, 1, { quantity: 1, unitPrice: 50 });
    const [cancelled] = await createDrafts(clientA, projectId, 1, { quantity: 1, unitPrice: 10 });
    await createDrafts(clientA, projectId, 1, { quantity: 2, unitPrice: 10 });
    const [older] = await createDrafts(clientA, projectId, 1, { quantity: 10, unitPrice: 50 });

    await issueOn(issued!, TODAY);
    await issueOn(paid!, TODAY);
    await patchInvoice(paid!, { status: "paid" });
    await issueOn(cancelled!, TODAY);
    await patchInvoice(cancelled!, { status: "cancelled", cancel_reason: `Anulată de testul ${RUN}` });
    await issueOn(older!, PREV_DAY);

    // CLIENTUL B: o singura factura emisa in luna curenta, fara proiect.
    //   3 x 10 + 20% = 36,00
    const [otherClient] = await createDrafts(clientB, null, 1, { quantity: 3, unitPrice: 10 });
    await issueOn(otherClient!, TODAY);

    // CLIENTUL C: douazeci de ciorne in luna curenta, 1 x 10 + 20% = 12,00 fiecare,
    // deci 240,00 in total.
    await createDrafts(clientC, null, 20, { quantity: 1, unitPrice: 10 });

    seeded = {
      clientA,
      clientB,
      clientC,
      project: projectId,
      issuedNumberText: await readNumberText(issued!),
      olderNumberText: await readNumberText(older!),
      nameA,
      nameB,
      nameC,
    };
  });

  test.afterAll(async () => {
    // Prefixul inapoi pe implicitul produsului, ca nicio alta specificatie si nicio
    // rulare urmatoare sa nu porneasca de la o serie de test.
    await asService("invoice_settings?id=eq.true", {
      method: "PATCH",
      body: { series_prefix: "RC-", number_includes_year: true },
    });
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page, ownerAccount());
  });

  // -------------------------------------------------------------------------
  // Clauza 6: meniul, ruta si titlul din bara de sus.
  // -------------------------------------------------------------------------
  test("1. meniul are grupul Facturare intre Stoc si Configurare, cu o intrare Facturi care deschide /facturare", async ({
    page,
  }) => {
    const groups = await page
      .locator("aside nav > div")
      .evaluateAll((els) =>
        els.map((el) => ({
          title: (el.querySelector("p")?.textContent ?? "").trim(),
          items: Array.from(el.querySelectorAll("a")).map((a) => ({
            label: (a.textContent ?? "").trim(),
            href: a.getAttribute("href") ?? "",
          })),
        })),
      );
    const titles = groups.map((g) => g.title);

    const facturare = titles.indexOf("Facturare");
    expect(facturare, `grupurile meniului: ${titles.join(", ")}`).toBeGreaterThan(-1);
    expect(titles[facturare - 1], `grupurile meniului: ${titles.join(", ")}`).toBe("Stoc");
    expect(titles[facturare + 1], `grupurile meniului: ${titles.join(", ")}`).toBe("Configurare");

    // O SINGURA INTRARE, si nu doua: ecranul facturii este partea 3.
    expect(groups[facturare]!.items).toEqual([{ label: "Facturi", href: "/facturare" }]);

    await page.locator("aside nav a[href='/facturare']").click();
    await expect(page).toHaveURL(/\/facturare$/, { timeout: 25_000 });

    // Titlul din bara de sus vine din labelForPath, deci din aceeasi lista.
    await expect(page.locator("header").first().locator("span").first()).toHaveText("Facturi");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Facturi");
    // Intrarea este marcata activa pe ruta ei.
    await expect(page.locator("aside nav a[href='/facturare']")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  // -------------------------------------------------------------------------
  // Clauza 1: perioada implicita, si fiecare filtru.
  // -------------------------------------------------------------------------
  test("2. perioada implicita este luna curenta, iar perioada, starea, clientul si cautarea taie lista", async ({
    page,
  }) => {
    const { clientA, clientB, nameA, nameB, issuedNumberText, olderNumberText } = seeded;

    // --- PERIOADA IMPLICITA ESTE LUNA CURENTA -------------------------------
    await page.goto("/facturare");
    await expect(page.getByTestId("facturi-de-la")).toHaveValue(ro(THIS_MONTH.from), {
      timeout: 25_000,
    });
    await expect(page.getByTestId("facturi-pana-la")).toHaveValue(ro(THIS_MONTH.to));
    await expect(page.getByTestId("facturi-stare")).toHaveValue("");
    await expect(page.getByTestId("facturi-client")).toHaveValue("");

    // --- CU CLIENTUL A PUS, LUNA CURENTA ARE PATRU RANDURI SI NU CINCI ------
    // A cincea factura a lui A este emisa in luna trecuta, deci perioada o taie.
    await open(page, { client: clientA }, 4);
    const numbers = await rows(page)
      .getByTestId("facturi-numar")
      .evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()));
    expect(numbers, "factura din luna trecuta nu este in luna curenta").not.toContain(
      olderNumberText,
    );
    expect(numbers, "factura emisa in luna curenta este pe ecran").toContain(issuedNumberText);

    // --- SCHIMBAREA PERIOADEI SCHIMBA CARE RANDURI SE VAD -------------------
    await open(page, { client: clientA, "de-la": PREV_MONTH.from, "pana-la": PREV_MONTH.to }, 1);
    // Una singura, si este cea din luna trecuta: are numar, deci nu este ciorna.
    await expect(rows(page).first().getByTestId("facturi-numar")).not.toHaveText("Fără număr");
    await expect(rows(page).first().getByTestId("facturi-total-rand")).toHaveText(
      formatMoneyExact(600),
    );

    // SI DIN CASUTE, nu doar din adresa: asa o schimba operatorul.
    await open(page, { client: clientA }, 4);
    await page.getByTestId("facturi-de-la").fill(ro(PREV_MONTH.from));
    await page.waitForURL(/de-la=/, { timeout: 25_000 });
    await page.getByTestId("facturi-pana-la").fill(ro(PREV_MONTH.to));
    await page.waitForURL(/pana-la=/, { timeout: 25_000 });
    await expect(rows(page)).toHaveCount(1, { timeout: 25_000 });

    // --- FILTRUL DE STARE RESTRANGE LA O STARE SI SE INTOARCE ---------------
    await open(page, { client: clientA }, 4);
    for (const [status, expected] of [
      ["issued", 1],
      ["paid", 1],
      ["cancelled", 1],
      ["draft", 1],
    ] as const) {
      await page.getByTestId("facturi-stare").selectOption(status);
      await expect(rows(page)).toHaveCount(expected, { timeout: 25_000 });
      await expect(rows(page).first()).toHaveAttribute("data-status", status);
    }
    // Inapoi la Toate stările: toate patru.
    await page.getByTestId("facturi-stare").selectOption("");
    await expect(rows(page)).toHaveCount(4, { timeout: 25_000 });

    // --- FILTRUL DE CLIENT --------------------------------------------------
    // Optiunile sunt clientii care AU facturi, deci amandoi ai acestei rulari.
    const options = await page
      .getByTestId("facturi-client")
      .locator("option")
      .evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()));
    expect(options[0], `optiunile filtrului: ${options.slice(0, 5).join(", ")}`).toBe("Toți clienții");
    expect(options).toContain(nameA);
    expect(options).toContain(nameB);

    await page.getByTestId("facturi-client").selectOption(clientB);
    await expect(rows(page)).toHaveCount(1, { timeout: 25_000 });
    expect(await clientNames(page)).toEqual([nameB]);
    await expect(rows(page).first().getByTestId("facturi-total-rand")).toHaveText(
      formatMoneyExact(36),
    );

    // --- CAUTAREA, DUPA NUMAR SI DUPA NUMELE CLIENTULUI ---------------------
    // Numarul este al acestei rulari, deci gaseste exact o factura din toata baza.
    await open(page, { q: issuedNumberText }, 1);
    await expect(rows(page).first().getByTestId("facturi-numar")).toHaveText(issuedNumberText);
    expect(await clientNames(page)).toEqual([nameA]);

    // Dupa numele clientului: cele patru ale lui A din luna curenta.
    await open(page, { q: nameA }, 4);
    expect(new Set(await clientNames(page))).toEqual(new Set([nameA]));

    // Si numele lui B gaseste numai factura lui B, deci cautarea chiar taie.
    await open(page, { q: nameB }, 1);
    expect(await clientNames(page)).toEqual([nameB]);

    // --- CELE CINCI CONTROALE STAU PE UN SINGUR RAND LA 1440 ---------------
    // Randul este cerut de card; se masoara ecranul si nu clasele.
    //
    // CELE CINCI SE NUMESC PE NUME, si nu se strang cu un selector de forma
    // "orice input sau select cu data-testid" din randul de filtre. Selectorul
    // acela gaseste SAPTE, si are dreptate: DateField (cardul P3-49) tine langa
    // fiecare casuta romaneasca un <input type="date"> ascuns cu display none, cu
    // testId-ul ei plus "-native", pentru ca butonul de calendar sa poata chema
    // showPicker() pe el. Ecranul are cinci controale vizibile; masuratoarea de mai
    // jos le numeste, deci nu poate confunda un camp ascuns cu un rand stricat.
    // Rulare 36468928176: primita 7, asteptata 5, si nimic nu era gresit pe ecran.
    const CONTROLS = [
      "facturi-de-la",
      "facturi-pana-la",
      "facturi-stare",
      "facturi-client",
      "facturi-search",
    ] as const;

    await open(page, { client: clientA }, 4);
    const centres: { name: string; centre: number }[] = [];
    for (const name of CONTROLS) {
      const control = page.getByTestId(name);
      await expect(control, `controlul ${name} nu este pe ecran`).toBeVisible();
      const box = await control.boundingBox();
      expect(box, `controlul ${name} nu are cutie`).not.toBeNull();
      centres.push({ name, centre: box!.y + box!.height / 2 });
    }
    const lowest = Math.min(...centres.map((c) => c.centre));
    const highest = Math.max(...centres.map((c) => c.centre));
    expect(
      highest - lowest,
      `controalele nu stau pe un rand: ${centres.map((c) => `${c.name} ${c.centre.toFixed(1)}`).join(", ")}`,
    ).toBeLessThanOrEqual(6);

    // SI NICIUN CAMP NATIV DE DATA NU ESTE VIZIBIL, care este chiar regula pentru
    // care exista DateField: campul nativ aseaza ziua si luna dupa limba
    // browserului. Cele doua exista in pagina, pentru calendar, si sunt ascunse.
    for (const name of ["facturi-de-la-native", "facturi-pana-la-native"]) {
      await expect(page.getByTestId(name), `${name} exista pentru calendar`).toHaveCount(1);
      await expect(page.getByTestId(name), `${name} nu are voie sa se vada`).toBeHidden();
    }
  });

  // -------------------------------------------------------------------------
  // Clauza 2: linia de totaluri, cu forma romaneasca peste nouasprezece.
  // -------------------------------------------------------------------------
  test("3. linia de totaluri numara si adună exact randurile de pe ecran, cu forma cu de peste nouasprezece", async ({
    page,
  }) => {
    const { clientA, clientC } = seeded;

    // --- PATRU: forma simpla de plural, si suma celor patru stari ------------
    await open(page, { client: clientA }, 4);
    await expect(page.getByTestId("facturi-numar-total")).toHaveText("4 facturi");
    // 120 + 60 + 12 + 24 = 216
    await expect(page.getByTestId("facturi-suma")).toHaveText(formatMoneyExact(216));

    // SUMA ESTE CHIAR SUMA CELULELOR DE PE ECRAN, adunata din ele si nu din ce
    // spune testul ca ar trebui sa fie: asa cade cazul si daca ambele sunt gresite
    // in acelasi fel.
    const shown = await rows(page)
      .getByTestId("facturi-total-rand")
      .evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()));
    expect(shown).toHaveLength(4);
    await expect(page.getByTestId("facturi-suma")).toHaveText(
      formatMoneyExact(shown.reduce((total, text) => total + fromMoney(text), 0)),
    );

    // --- UN FILTRU DE STARE MUTA SI LINIA DE TOTALURI -----------------------
    await open(page, { client: clientA, stare: "issued" }, 1);
    await expect(page.getByTestId("facturi-numar-total")).toHaveText("1 factură");
    await expect(page.getByTestId("facturi-suma")).toHaveText(formatMoneyExact(120));

    // --- DOUAZECI: "20 de facturi", si nu "20 facturi" ---------------------
    await open(page, { client: clientC }, 20);
    expect(plural(20, "factură", "facturi"), "forma romaneasca peste nouasprezece").toBe(
      "20 de facturi",
    );
    await expect(page.getByTestId("facturi-numar-total")).toHaveText("20 de facturi");
    // 20 x 12,00 = 240,00
    await expect(page.getByTestId("facturi-suma")).toHaveText(formatMoneyExact(240));
  });

  // -------------------------------------------------------------------------
  // Clauza 3: starea goala si linia despre ce nu este inca construit.
  // -------------------------------------------------------------------------
  test("4. starea goala spune exact ce cere goalul, iar linia despre tipar si e-Factura este sub lista", async ({
    page,
  }) => {
    const { clientA } = seeded;

    // O perioada in care clientul A nu are nicio factura.
    await page.goto(url({ client: clientA, "de-la": "2020-01-01", "pana-la": "2020-01-31" }));
    await expect(page.getByTestId("facturi-empty")).toBeVisible({ timeout: 25_000 });
    await expect(rows(page)).toHaveCount(0);

    const empty = (await page.getByTestId("facturi-empty").innerText()).replace(/\s+/g, " ").trim();
    expect(empty).toBe("Nicio factură în perioada selectată. Ajustează perioada.");

    // Linia de totaluri raspunde si pe gol: zero este un raspuns.
    await expect(page.getByTestId("facturi-numar-total")).toHaveText("0 facturi");
    await expect(page.getByTestId("facturi-suma")).toHaveText(formatMoneyExact(0));

    // LINIA DESPRE CE URMEAZA, pe ecranul gol si pe ecranul plin.
    await expect(page.getByTestId("facturi-in-lucru")).toHaveText("Tipărirea și e-Factura urmează.");
    await open(page, { client: clientA }, 4);
    await expect(page.getByTestId("facturi-in-lucru")).toHaveText("Tipărirea și e-Factura urmează.");

    // BUTONUL "Factură nouă" EXISTA SI DESCHIDE ECRANUL DE CREARE.
    //
    // ACEASTA ASERTIUNE ERA INVERSA PANA LA CARDUL P3-110, si a fost inlocuita cu opusul
    // ei si nu stearsa. Citea:
    //
    //   // SI NICIUN BUTON DE FACTURA NOUA, nici dezactivat: crearea este partea 3.
    //   await expect(page.getByText("Factură nouă")).toHaveCount(0);
    //
    // Era adevarata si era corecta cat timp ecranul pe care il deschide butonul nu exista:
    // defaults-ul (b) al cardului P3-109 spune in terminii lui ca un buton principal gri pe
    // un ecran nou il invata pe operator sa nu apese butoane. P3-110 a construit ecranul de
    // creare, deci premisa s-a schimbat si nu verificarea s-a slabit: regula care ținea
    // butonul afara este aceeasi care il aduce acum.
    const nou = page.getByTestId("facturi-noua");
    await expect(nou).toBeVisible();
    await expect(nou).toBeEnabled();
    await nou.click();
    await expect(page).toHaveURL(/\/facturare\/nou$/, { timeout: 25_000 });
  });

  // -------------------------------------------------------------------------
  // Clauza 4: ciorna fara numar, si cele patru etichete romanesti.
  // -------------------------------------------------------------------------
  test("5. o ciorna nu arata niciun numar inventat, iar fiecare stare isi scrie eticheta romaneasca", async ({
    page,
  }) => {
    const { clientA } = seeded;

    // --- CIORNA ------------------------------------------------------------
    await open(page, { client: clientA, stare: "draft" }, 1);
    const draft = rows(page).first();
    await expect(draft).toHaveAttribute("data-status", "draft");
    const number = (await draft.getByTestId("facturi-numar").innerText()).trim();
    expect(number, "o ciorna scrie ce lipseste, nu o celula goala").toBe("Fără număr");
    expect(number, "o ciorna nu arata nicio cifra care ar putea trece ca numar").not.toMatch(/\d/);
    // Si tot randul ei nu poarta seria acestei rulari nicaieri.
    expect((await draft.innerText()).includes(SERIES), "ciorna nu poarta serie").toBe(false);

    // --- CELE PATRU ETICHETE, CITITE DIN invoiceStatusLabel ----------------
    // Trei stari sunt la clientul A in luna curenta; ciorna este cea de mai sus.
    await open(page, { client: clientA }, 4);
    for (const status of ALL_INVOICE_STATUSES) {
      const row = page.locator(`[data-testid='facturi-row'][data-status='${status}']`);
      await expect(row, `starea ${status} are exact un rand`).toHaveCount(1);
      await expect(
        row.getByTestId("facturi-stare-eticheta"),
        `eticheta starii ${status}`,
      ).toHaveText(invoiceStatusLabel(status));
    }

    // Cele patru etichete sunt chiar cele patru cuvinte romanesti si nu una in plus.
    expect(ALL_INVOICE_STATUSES.map(invoiceStatusLabel)).toEqual([
      "Ciornă",
      "Emisă",
      "Plătită",
      "Anulată",
    ]);
  });

  // -------------------------------------------------------------------------
  // Clauza 7: telefonul de 390x844.
  // -------------------------------------------------------------------------
  test("6. pe un telefon de 390x844 nu se deruleaza lateral, fiecare rand este card, tintele au 44px", async ({
    page,
  }, testInfo) => {
    const { clientA } = seeded;

    // AUTENTIFICAREA S-A FACUT LA LATIMEA DESKTOP, in beforeEach, exact cum o cere
    // restul suitei: formularul de autentificare nu este ce se masoara aici, iar o a
    // doua autentificare pe o sesiune care exista deja ar cere /autentificare, de
    // unde proxy-ul intoarce un cont semnat inapoi pe tabloul de bord.
    expect(DESKTOP.width, "suita ruleaza la 1440 si de acolo se trece pe telefon").toBe(1440);
    await page.setViewportSize(PHONE);

    await open(page, { client: clientA }, 4);

    const reading = await page.evaluate(
      ({ minTap, minFont, width }) => {
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

        // Ce iese in afara ecranului, si ce iese in afara propriei radacini: al
        // doilea este cel pe care masuratoarea pe fereastra nu il vede, fiindca un
        // element de 350px care incepe la x=33 se termina la 383, adica in ecran si
        // in afara cutiei lui. Cardul P3-97 a platit doua rulari pe distinctia asta.
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

        // Un card pe rand: randul este o grila, si fiecare celula poarta ca eticheta
        // vizibila exact textul antetului coloanei ei.
        const cards = Array.from(main.querySelectorAll<HTMLElement>("[data-testid='facturi-row']")).map(
          (tr) => ({
            display: getComputedStyle(tr).display,
            labels: Array.from(tr.querySelectorAll(":scope > td")).map((td) => {
              const before = getComputedStyle(td, "::before");
              return {
                text: before.content.replace(/^"|"$/g, ""),
                shown: before.display !== "none" && before.content !== "none",
              };
            }),
          }),
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
      { minTap: MIN_TAP, minFont: MIN_INPUT_FONT, width: PHONE.width },
    );

    expect(reading.document.scrollWidth, "derulare laterala a documentului").toBeLessThanOrEqual(
      reading.document.clientWidth,
    );
    expect(
      reading.main.scrollWidth,
      `derulare laterala in <main>, mai late decat el: ${reading.wider.join(" | ")}`,
    ).toBeLessThanOrEqual(reading.main.clientWidth);
    expect(reading.outside, "elemente in afara ecranului").toEqual([]);
    expect(reading.smallTargets, `tinte sub ${MIN_TAP}px`).toEqual([]);
    expect(reading.smallFonts, `campuri sub ${MIN_INPUT_FONT}px`).toEqual([]);
    expect(reading.visibleTheads, "antet de tabel vizibil pe telefon").toBe(0);

    expect(reading.cards, "randurile nu au ajuns pe ecran").toHaveLength(4);
    for (const card of reading.cards) {
      expect(card.display, "randul nu este card pe telefon").toBe("grid");
      expect(card.labels.map((l) => l.text)).toEqual([...COLUMNS]);
      for (const label of card.labels) {
        expect(label.shown, `eticheta ${label.text} este ascunsa`).toBe(true);
      }
    }

    await page.screenshot({ path: testInfo.outputPath("facturi-telefon.png"), fullPage: true });
  });
});

/** Suma scrisa romanesc, inapoi in numar: "1.199,50 MDL" catre 1199.5. */
function fromMoney(text: string): number {
  const digits = text.replace(/\s*MDL\s*$/, "").replace(/\./g, "").replace(",", ".");
  const value = Number(digits);
  expect(Number.isFinite(value), `suma "${text}" nu s-a putut citi`).toBe(true);
  return value;
}
