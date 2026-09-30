import { expect, test, type Page } from "@playwright/test";
import { managerAccount, ownerAccount, type TestAccount } from "./support/accounts";
import { signIn, signOut } from "./support/auth";
import { settingsSectionHref } from "@/lib/data/setari-sections";

// setari-date-firma.spec - linia de acceptanta a cardului P3-116, goal G69 partea 4,
// ULTIMA parte a acelui obiectiv.
//
// CE PROBEAZA, in ordinea din card:
//   1. Secțiunea Date firmă exista, la adresa ei si pe adresa goala, si arata TOATE
//      CELE OPT campuri cu valorile lor curente si cu etichetele lor romanesti. Un
//      camp gol se vede GOL: nicio cratima, niciun text inventat, niciun placeholder.
//   2. Administratorul schimba cele TREI campuri noi (cod TVA, telefon, email), le
//      salveaza, reincarca si le citeste inapoi de pe ecran SI direct din baza; iar
//      un operator NU le poate schimba, nici prin ecran nici cu propriul jeton.
//   3. Cele CINCI campuri care existau deja se plimba dus-intors prin Date firmă, se
//      citesc apoi in blocul Facturare fara ca nimeni sa fi scris acolo, si o factura
//      tipareste aceleasi valori: CELE DOUA SECTIUNI NU POT SA SE CONTRAZICA, fiindca
//      randul este unul singur.
//   4. COTA TVA si CODUL TVA sunt doua lucruri: schimbarea unuia nu il schimba pe
//      celalalt, nici pe ecran nici in baza. Si niciunul dintre ele nu este IDNO.
//   5. Pe un telefon de 390x844 formularul incape, se poate atinge si se poate
//      folosi: nicio derulare laterala, tinte de cel putin 44px, casete cu text de
//      cel putin 16px. Peste latimea de telefon nimic nu se schimba.
//
// CE SE CITESTE DIN BAZA se citeste cu cheia service_role a stivei LOCALE, ca in
// facturare-settings.spec: un formular care isi arata propria valoare din starea lui
// de React ar trece si daca nimic nu s-ar fi scris.
//
// RANDUL ESTE PUS INAPOI CUM A FOST GASIT, si asta este si verificat. Tabela are un
// singur rand pe toata baza, deci o valoare de test lasata in urma ar aparea pe
// factura urmatoarei specificatii ca datele firmei.
//
// NICIO VALOARE REALA. Fiecare valoare scrisa aici poarta TEST si identificatorul
// rularii. Nimic nu se citeste din productie si nimic real nu se scrie nicaieri.
//
// NU SE IMPORTA NIMIC DIN COMPONENTA. Propoziția de langa codul TVA este scrisa mai
// jos cuvant cu cuvant, exact ca VAT_NOTE in facturare-settings.spec: componenta
// importa actiunile, actiunile importa lib/supabase/server, iar acela importa
// "server-only", care arunca in afara unui randari de server. O copie pe care o
// citeste un om este pretul corect pentru asta.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const MIN_TAP = 44;
const MIN_INPUT_FONT = 16;

/** Adresa secțiunii, citita din lista si nu scrisa de mana. */
const HREF = settingsSectionHref("date-firma");

/** Cuvant cu cuvant ce trebuie sa scrie ecranul langa codul TVA. Trei numere se pot
 *  amesteca (IDNO, codul TVA, cota TVA) si aceasta propoziție este ce impiedica asta. */
const VAT_CODE_NOTE =
  "Codul de înregistrare ca plătitor de TVA. Nu este IDNO și nu este cota de pe factură.";

/** Cuvant cu cuvant nota de langa cota implicita, ca mai jos sa se poata arata ca ea
 *  nu a fost atinsa. Aceeasi constanta o citeste si facturare-settings.spec. */
const VAT_RATE_NOTE = "De confirmat cu contabilul.";

type FieldSpec = { id: string; label: string; column: Column };
type Column =
  | "issuer_name"
  | "issuer_fiscal_code"
  | "issuer_address"
  | "issuer_bank"
  | "issuer_iban"
  | "issuer_vat_code"
  | "issuer_phone"
  | "issuer_email";

/** CELE CINCI CARE EXISTAU DE LA MIGRATIA 0063, cu ETICHETELE BLOCULUI FACTURARE
 *  cuvant cu cuvant. Aceasta este chiar clauza cardului despre refolosirea lor: o
 *  eticheta nou inventata pentru un camp care are deja una ar face tabelul fals. */
const OLD_FIELDS: FieldSpec[] = [
  { id: "date-firma-name", label: "Denumirea firmei", column: "issuer_name" },
  { id: "date-firma-fiscal-code", label: "IDNO", column: "issuer_fiscal_code" },
  { id: "date-firma-address", label: "Adresa", column: "issuer_address" },
  { id: "date-firma-bank", label: "Banca", column: "issuer_bank" },
  { id: "date-firma-iban", label: "IBAN", column: "issuer_iban" },
];

/** CELE TREI PE CARE MIGRATIA 0066 LE-A ADUS, si numai ele. */
const NEW_FIELDS: FieldSpec[] = [
  { id: "date-firma-vat-code", label: "Cod TVA", column: "issuer_vat_code" },
  { id: "date-firma-phone", label: "Telefon", column: "issuer_phone" },
  { id: "date-firma-email", label: "Email", column: "issuer_email" },
];

/** Toate opt, in ordinea de pe ecran. */
const FIELDS: FieldSpec[] = [...OLD_FIELDS, ...NEW_FIELDS];

/** Cum se numeste acelasi camp in blocul Facturare, pentru cele cinci vechi. */
const FACTURARE_TESTID: Record<string, string> = {
  "date-firma-name": "facturare-issuer-name",
  "date-firma-fiscal-code": "facturare-issuer-fiscal-code",
  "date-firma-address": "facturare-issuer-address",
  "date-firma-bank": "facturare-issuer-bank",
  "date-firma-iban": "facturare-issuer-iban",
};

/* ------------------------------------------------ API-ul bazei de date -- */

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error(
      "setari-date-firma.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY si " +
        "SUPABASE_SERVICE_ROLE_KEY. In CI sunt exportate de pasul 'Export local Supabase credentials'. " +
        "Local: supabase status -o env.",
    );
  }
  return { origin: new URL(url).origin, anon, service };
}

type Row = Record<string, unknown>;

const SELECT =
  "series_prefix,number_includes_year,default_vat_rate," +
  "issuer_name,issuer_fiscal_code,issuer_address,issuer_bank,issuer_iban," +
  "issuer_vat_code,issuer_phone,issuer_email";

async function settingsInDatabase(): Promise<Row> {
  const { origin, service } = env();
  const response = await fetch(`${origin}/rest/v1/invoice_settings?select=${SELECT}`, {
    headers: { apikey: service, Authorization: `Bearer ${service}` },
  });
  const rows = (await response.json().catch(() => [])) as Row[];
  expect(response.ok, `setarile nu au putut fi citite din baza: ${response.status}`).toBe(true);
  // UN SINGUR RAND, IMPUS DE BAZA si nu de o convenție: cheia primara a tabelei este
  // un boolean fixat pe true de o restrictie. Aceasta este si afirmatia cardului
  // despre faptul ca cele doua secțiuni nu se pot contrazice.
  expect(rows, "public.invoice_settings are exact un rand").toHaveLength(1);
  return rows[0]!;
}

async function patchAsService(body: Record<string, unknown>): Promise<void> {
  const { origin, service } = env();
  const response = await fetch(`${origin}/rest/v1/invoice_settings?id=eq.true`, {
    method: "PATCH",
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  expect(response.ok, `randul nu a putut fi pregatit: ${response.status}`).toBe(true);
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
  expect(
    response.ok && Boolean(body.access_token),
    `autentificarea API a raspuns ${response.status}`,
  ).toBe(true);
  return String(body.access_token);
}

/** O ciorna de factura cu o linie de text liber, deci fara produs si fara lot de
 *  stoc: cazul 3 este despre datele emitentului, nu despre catalog. */
async function seedInvoiceDraft(): Promise<string> {
  const { origin, service } = env();
  const headers = {
    apikey: service,
    Authorization: `Bearer ${service}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  const client = await fetch(`${origin}/rest/v1/clients?select=id`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: `TEST Client date firma ${RUN}`,
      active: true,
      // IDNO-ul clientului este unic pe baza (clients_fiscal_code_unique, migratia
      // 0013), deci poarta identificatorul rularii.
      fiscal_code: `IDNO-DF-${RUN}`,
      address: `Strada Testului date firma ${RUN}`,
    }),
  });
  const clientRows = (await client.json().catch(() => [])) as Row[];
  expect(client.ok, `clientul de test nu a putut fi creat: ${client.status}`).toBe(true);
  const clientId = String(clientRows[0]!.id);

  const invoice = await fetch(`${origin}/rest/v1/invoices?select=id`, {
    method: "POST",
    headers,
    body: JSON.stringify({ client_id: clientId }),
  });
  const invoiceRows = (await invoice.json().catch(() => [])) as Row[];
  expect(invoice.ok, `ciorna de factura nu a putut fi creata: ${invoice.status}`).toBe(true);
  const invoiceId = String(invoiceRows[0]!.id);

  const line = await fetch(`${origin}/rest/v1/invoice_lines?select=id`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      invoice_id: invoiceId,
      description: `Poziție date firma ${RUN}`,
      quantity: 1,
      unit: "pcs",
      unit_price_mdl: 10,
      vat_rate: 20,
      sort_order: 0,
    }),
  });
  expect(line.ok, `linia facturii nu a putut fi scrisa: ${line.status}`).toBe(true);

  return invoiceId;
}

/* ------------------------------------------------------------- ajutoare -- */

async function openDateFirma(page: Page) {
  await page.goto(HREF);
  await expect(page.getByTestId("settings-date-firma")).toBeVisible({ timeout: 25_000 });
  // Secțiunea nu are voie sa fie in vreuna din cele doua stari de degradare:
  // migratiile sunt aplicate in CI, 0063 si 0066 amandoua.
  await expect(page.getByTestId("date-firma-inactive")).toHaveCount(0);
  await expect(page.getByTestId("date-firma-contact-pending")).toHaveCount(0);
}

async function save(page: Page) {
  await page.getByTestId("date-firma-save").click();
  await expect(async () => {
    const error = page.getByTestId("date-firma-error");
    if ((await error.count()) > 0) {
      throw new Error(`salvarea a raspuns cu eroare: ${await error.innerText()}`);
    }
    await expect(page.getByTestId("date-firma-done")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 60_000 });
}

/** Eticheta romaneasca a unei casete, citita de pe chiar `label`-ul care o inveleste,
 *  si nu de oriunde din secțiune: asa nu se poate trece cu un cuvant care se
 *  intampla sa fie scris in alta parte a blocului. */
function labelOf(page: Page, id: string) {
  return page.getByTestId(id).locator("xpath=ancestor::label[1]");
}

/** Ce trebuie sa fie in fiecare din cele opt casete, ca valori de test. */
function wanted(tag: string) {
  return {
    issuer_name: `TEST Rapid Construct ${tag} ${RUN}`,
    issuer_fiscal_code: `1002600${tag}${RUN}`.slice(0, 13),
    issuer_address: `mun. Chișinău, str. Testului ${tag} ${RUN}`,
    issuer_bank: `TEST Banca ${tag} ${RUN}`,
    issuer_iban: `MD00TEST${tag}${RUN}`.toUpperCase().slice(0, 24),
    issuer_vat_code: `TESTTVA${tag}${RUN}`.toUpperCase().slice(0, 16),
    issuer_phone: `+373 22 000 ${tag.charCodeAt(0) % 10}00`,
    issuer_email: `test-${tag}-${RUN}@rc-inventory.local`.toLowerCase(),
  };
}

/* ---------------------------------------------------------------- cazuri -- */

test.describe("Setări, secțiunea Date firmă", () => {
  test.describe.configure({ timeout: 240_000 });

  /** Randul exact cum a fost gasit, ca sa fie pus inapoi la final. */
  let before: Row;

  test.beforeAll(async () => {
    before = await settingsInDatabase();
  });

  test.afterAll(async () => {
    await patchAsService({
      issuer_name: before.issuer_name,
      issuer_fiscal_code: before.issuer_fiscal_code,
      issuer_address: before.issuer_address,
      issuer_bank: before.issuer_bank,
      issuer_iban: before.issuer_iban,
      issuer_vat_code: before.issuer_vat_code,
      issuer_phone: before.issuer_phone,
      issuer_email: before.issuer_email,
      series_prefix: before.series_prefix,
      number_includes_year: before.number_includes_year,
      default_vat_rate: before.default_vat_rate,
    });
    const after = await settingsInDatabase();
    for (const key of Object.keys(before)) {
      expect(String(after[key] ?? ""), `randul a fost pus inapoi: ${key}`).toBe(
        String(before[key] ?? ""),
      );
    }
  });

  test("1. secțiunea arată toate cele opt câmpuri cu valorile și etichetele lor, și un câmp gol se vede gol", async ({
    page,
  }) => {
    // Un rand cunoscut, scris din afara ecranului, ca ce se citeste sa nu poata fi
    // memoria formularului.
    const want = wanted("A");
    await patchAsService(want);

    await signIn(page, ownerAccount());
    await openDateFirma(page);

    const section = page.getByTestId("settings-date-firma");

    // --- TOATE CELE OPT, CU ETICHETA SI CU VALOAREA --------------------------
    for (const field of FIELDS) {
      const box = page.getByTestId(field.id);
      await expect(box, `caseta ${field.id} nu este pe ecran`).toBeVisible();
      await expect(box, `valoarea din ${field.id}`).toHaveValue(want[field.column]);
      // ETICHETA, PE CHIAR label-UL CASETEI. Pentru cele cinci vechi acesta este
      // chiar dovada refolosirii: sunt exact cuvintele blocului Facturare.
      await expect(labelOf(page, field.id), `eticheta lui ${field.id}`).toContainText(field.label);
    }

    // --- NOTA DE LANGA CODUL TVA, CUVANT CU CUVANT ---------------------------
    await expect(page.getByTestId("date-firma-vat-code-note")).toHaveText(VAT_CODE_NOTE);

    // --- COTA TVA SI SERIA NU SUNT IN ACEASTA SECTIUNE DELOC ----------------
    // Ele stau in Facturare. Un formular de date de firma care ar putea muta
    // numerotarea facturilor este exact ce cardul nu construieste.
    await expect(section.getByTestId("facturare-vat-rate")).toHaveCount(0);
    await expect(section.getByTestId("facturare-series-prefix")).toHaveCount(0);

    // --- UN CAMP GOL SE VEDE GOL --------------------------------------------
    // Nicio cratima, niciun text inventat si niciun placeholder: un placeholder in
    // caseta IDNO ar arata un numar pe care nimeni nu l-a scris.
    await patchAsService({ issuer_phone: null, issuer_email: null, issuer_bank: null });
    await openDateFirma(page);
    for (const id of ["date-firma-phone", "date-firma-email", "date-firma-bank"]) {
      const box = page.getByTestId(id);
      await expect(box, `${id} gol`).toHaveValue("");
      expect(await box.getAttribute("placeholder"), `${id} nu are placeholder`).toBeNull();
    }
    // Si niciun "-" desenat in locul valorii lipsa, nicaieri in cele opt casete.
    for (const field of FIELDS) {
      const value = await page.getByTestId(field.id).inputValue();
      expect(value.trim(), `${field.id} arata o cratima in loc de gol`).not.toBe("-");
    }

    // --- SI SECTIUNEA ESTE SI PE ADRESA GOALA, sub Toate setările ------------
    await page.goto("/setari");
    await expect(page).toHaveURL(/\/setari$/);
    await expect(page.getByTestId("settings-date-firma")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("settings-facturare")).toBeVisible();
    // Casuta de categorie este tot acolo, fara niciun clic: zece fisiere de test isi
    // fac o categorie exact asa inainte de a crea un produs.
    await expect(page.getByTestId("category-name")).toBeVisible();
  });

  test("2. administratorul schimbă codul TVA, telefonul și emailul și le citește înapoi, iar operatorul nu poate", async ({
    page,
  }) => {
    await patchAsService(wanted("A"));

    await signIn(page, ownerAccount());
    await openDateFirma(page);

    const want = wanted("B");
    for (const field of NEW_FIELDS) {
      await page.getByTestId(field.id).fill(want[field.column]);
    }
    await save(page);

    // DUPA O REINCARCARE, deci ce se citeste nu este starea de React a formularului.
    await openDateFirma(page);
    for (const field of NEW_FIELDS) {
      await expect(page.getByTestId(field.id), `${field.id} dupa reincarcare`).toHaveValue(
        want[field.column],
      );
    }

    // SI DIRECT DIN BAZA, deci nu este nici memoria paginii.
    const row = await settingsInDatabase();
    for (const field of NEW_FIELDS) {
      expect(row[field.column], `${field.column} scris in baza`).toBe(want[field.column]);
    }

    // FORMULARUL ACESTA NU ATINGE NUMEROTAREA. Prefixul seriei, anul din numar si
    // cota TVA sunt ale blocului Facturare, si o salvare de aici nu le muta.
    expect(row.series_prefix, "prefixul seriei nu a fost atins").toBe(before.series_prefix);
    expect(row.number_includes_year, "anul din numar nu a fost atins").toBe(
      before.number_includes_year,
    );
    expect(Number(row.default_vat_rate), "cota TVA nu a fost atinsa").toBe(
      Number(before.default_vat_rate),
    );

    // --- UN CAMP GOLIT SE GOLESTE, si nu rămâne cu valoarea veche ------------
    await page.getByTestId("date-firma-phone").fill("");
    await save(page);
    await openDateFirma(page);
    await expect(page.getByTestId("date-firma-phone")).toHaveValue("");
    expect(
      (await settingsInDatabase()).issuer_phone,
      "telefonul golit este null in baza si nu un sir gol",
    ).toBeNull();

    // --- OPERATORUL NU AJUNGE LA ECRAN SI NU POATE SCRIE IN TABELA -----------
    // Ecranul refuzat este o curtoazie; politica invoice_settings_owner_update din
    // migratia 0063 este garantia, si 0066 NU a adaugat nicio permisiune.
    const manager = managerAccount();
    const beforeManager = await settingsInDatabase();

    // Ieșire din contul administratorului inainte, fiindca proxy.ts duce un om deja
    // autentificat de pe pagina de autentificare direct la tabloul de bord.
    await page.goto("/");
    await signOut(page);
    await signIn(page, manager);
    await page.goto(HREF);
    await expect(page.getByTestId("forbidden")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("settings-date-firma")).toHaveCount(0);
    await expect(page.getByTestId("date-firma-save")).toHaveCount(0);

    // JUMATATEA DE BAZA DE DATE: cu jetonul operatorului, direct la PostgREST.
    // Politica nu lasa niciun rand sa treaca, deci cererea poate raspunde 200 si nu
    // schimba nimic: dovada este valoarea de dupa.
    const { origin, anon } = env();
    const token = await accessToken(manager);
    const patched = await fetch(`${origin}/rest/v1/invoice_settings?id=eq.true`, {
      method: "PATCH",
      headers: {
        apikey: anon,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        issuer_vat_code: `OP-${RUN}`,
        issuer_phone: `OP-${RUN}`,
        issuer_email: `op-${RUN}@rc-inventory.local`,
      }),
    });
    if (patched.ok) {
      expect(await patched.json().catch(() => []), "randuri schimbate de operator").toEqual([]);
    }

    const after = await settingsInDatabase();
    for (const field of NEW_FIELDS) {
      expect(after[field.column], `operatorul NU a schimbat ${field.column}`).toBe(
        beforeManager[field.column],
      );
    }
  });

  test("3. cele cinci câmpuri de dinainte se plimbă dus-întors, și factura tipărește aceleași valori din același rând", async ({
    page,
  }) => {
    const invoiceId = await seedInvoiceDraft();
    await patchAsService(wanted("A"));

    await signIn(page, ownerAccount());
    await openDateFirma(page);

    const want = wanted("C");
    for (const field of OLD_FIELDS) {
      await page.getByTestId(field.id).fill(want[field.column]);
    }
    await save(page);

    // --- DUS-INTORS, PRIN ECRAN SI PRIN BAZA --------------------------------
    await openDateFirma(page);
    for (const field of OLD_FIELDS) {
      await expect(page.getByTestId(field.id), `${field.id} dupa reincarcare`).toHaveValue(
        want[field.column],
      );
    }
    const row = await settingsInDatabase();
    for (const field of OLD_FIELDS) {
      expect(row[field.column], `${field.column} scris in baza`).toBe(want[field.column]);
    }

    // --- CELE DOUA SECTIUNI NU POT SA SE CONTRAZICA -------------------------
    // UN SINGUR RAND. Blocul Facturare arata acum exact ce s-a scris in Date firmă,
    // fara ca nimeni sa fi scris nimic acolo. Asta este toata afirmatia cardului
    // despre refolosirea randului in loc de o copie: doua locuri care tin IDNO-ul
    // aceleiasi firme este exact felul in care ajung sa se contrazica.
    await page.goto("/setari");
    await expect(page.getByTestId("settings-facturare")).toBeVisible({ timeout: 25_000 });
    for (const field of OLD_FIELDS) {
      await expect(
        page.getByTestId(FACTURARE_TESTID[field.id]!),
        `blocul Facturare arata alta valoare pentru ${field.label}`,
      ).toHaveValue(want[field.column]);
    }

    // --- SI FACTURA TIPARESTE ACELEASI VALORI, DIN ACELASI RAND -------------
    // lib/data/facturare-detail.ts citeste emitentul prin chiar getInvoiceSettings,
    // deci nu exista un al doilea drum de citire pe care sa fie nevoie sa il pui de
    // acord cu acesta.
    await page.goto(`/facturare/${invoiceId}`);
    await expect(page.getByTestId("factura-emitent")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("factura-emitent-nume")).toHaveText(want.issuer_name);
    await expect(page.getByTestId("factura-emitent-idno")).toHaveText(want.issuer_fiscal_code);
    await expect(page.getByTestId("factura-emitent-adresa")).toHaveText(want.issuer_address);
    await expect(page.getByTestId("factura-emitent-banca")).toHaveText(want.issuer_bank);
    await expect(page.getByTestId("factura-emitent-iban")).toHaveText(want.issuer_iban);
    // Numele este completat, deci linia de avertisment nu se deseneaza.
    await expect(page.getByTestId("factura-emitent-lipsa")).toHaveCount(0);
  });

  test("4. cota TVA și codul TVA sunt două lucruri: schimbarea unuia nu schimbă celălalt", async ({
    page,
  }) => {
    // O STARE DE PORNIRE IN CARE CELE TREI NUMERE SUNT DISTINCTE: IDNO, codul TVA si
    // cota. Daca doua ar porni egale, cazul nu ar putea deosebi "nu s-a schimbat" de
    // "s-a schimbat in aceeasi valoare".
    const start = wanted("D");
    await patchAsService({ ...start, default_vat_rate: 20 });

    await signIn(page, ownerAccount());

    // --- SE SCHIMBA CODUL TVA, SI COTA NU SE MISCA --------------------------
    await openDateFirma(page);
    const newCode = `TESTTVA-E-${RUN}`.toUpperCase().slice(0, 20);
    await page.getByTestId("date-firma-vat-code").fill(newCode);
    await save(page);

    let row = await settingsInDatabase();
    expect(row.issuer_vat_code, "codul TVA s-a schimbat").toBe(newCode);
    expect(Number(row.default_vat_rate), "cota TVA a rămas 20").toBe(20);
    expect(row.issuer_fiscal_code, "IDNO a rămas al lui").toBe(start.issuer_fiscal_code);
    expect(row.issuer_vat_code, "codul TVA si IDNO sunt doua numere").not.toBe(
      row.issuer_fiscal_code,
    );

    // Si pe ecran, in blocul Facturare, cota este tot 20 si isi poarta nota.
    await page.goto(settingsSectionHref("facturare"));
    await expect(page.getByTestId("facturare-vat-rate")).toHaveValue("20", { timeout: 25_000 });
    await expect(page.getByTestId("facturare-vat-note")).toHaveText(VAT_RATE_NOTE);

    // --- SE SCHIMBA COTA, SI CODUL NU SE MISCA -----------------------------
    await page.getByTestId("facturare-vat-rate").fill("8");
    await page.getByTestId("facturare-save").click();
    await expect(page.getByTestId("facturare-done")).toBeVisible({ timeout: 60_000 });

    row = await settingsInDatabase();
    expect(Number(row.default_vat_rate), "cota TVA s-a schimbat, deci cazul probeaza ceva").toBe(8);
    expect(row.issuer_vat_code, "schimbarea cotei NU a schimbat codul TVA").toBe(newCode);
    expect(row.issuer_fiscal_code, "schimbarea cotei NU a schimbat IDNO").toBe(
      start.issuer_fiscal_code,
    );

    // Si secțiunea Date firmă arata in continuare codul, neatins.
    await openDateFirma(page);
    await expect(page.getByTestId("date-firma-vat-code")).toHaveValue(newCode);

    // Cota inapoi pe 20, prin ecran, ca celelalte specificatii sa nu gaseasca 8.
    await page.goto(settingsSectionHref("facturare"));
    await expect(page.getByTestId("facturare-vat-rate")).toHaveValue("8", { timeout: 25_000 });
    await page.getByTestId("facturare-vat-rate").fill("20");
    await page.getByTestId("facturare-save").click();
    await expect(page.getByTestId("facturare-done")).toBeVisible({ timeout: 60_000 });
    expect(Number((await settingsInDatabase()).default_vat_rate), "cota este iar 20").toBe(20);
  });

  test("5. pe telefon (390x844) formularul încape, se poate atinge și se poate folosi", async ({
    page,
  }) => {
    await patchAsService(wanted("A"));

    // Autentificare la 1440 si apoi redimensionare, ca in phone-remainder.spec.
    await signIn(page, ownerAccount());
    await page.setViewportSize(PHONE);
    await openDateFirma(page);

    const fits = async (where: string) => {
      const reading = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(reading.scrollWidth, `derulare laterala pe ${where}`).toBeLessThanOrEqual(
        reading.clientWidth,
      );
    };

    await fits(HREF);

    // --- FIECARE CASETA: 44px INALTIME SI 16px TEXT -------------------------
    // Sub 16px iOS Safari mareste pagina la atingerea campului.
    const small: string[] = [];
    for (const field of FIELDS) {
      const reading = await page.getByTestId(field.id).evaluate((el) => ({
        height: el.getBoundingClientRect().height,
        font: parseFloat(getComputedStyle(el).fontSize),
      }));
      if (reading.height < MIN_TAP || reading.font < MIN_INPUT_FONT) {
        small.push(`${field.id} ${reading.height.toFixed(1)}px / ${reading.font.toFixed(1)}px`);
      }
    }
    expect(small, `casete sub ${MIN_TAP}px sau cu text sub ${MIN_INPUT_FONT}px`).toEqual([]);

    // --- CAMPURILE STAU UNUL SUB ALTUL, deci nu doua pe un rand de 390px ----
    const lefts = await page
      .getByTestId("settings-date-firma")
      .evaluate((section) =>
        Array.from(section.querySelectorAll("input")).map((i) =>
          Math.round(i.getBoundingClientRect().left),
        ),
      );
    expect(lefts.length, "cele opt casete sunt pe ecran").toBe(FIELDS.length);
    expect(new Set(lefts).size, `casetele nu sunt aliniate intr-o coloana: ${lefts.join(",")}`).toBe(
      1,
    );

    // --- BUTONUL ESTE O TINTA DE 44px ---------------------------------------
    const saveHeight = await page
      .getByTestId("date-firma-save")
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(saveHeight, "butonul de salvare pe telefon").toBeGreaterThanOrEqual(MIN_TAP);

    // --- SE POATE FOLOSI: se scrie, se salveaza, se citeste inapoi ----------
    const phoneValue = `TESTTVA-F-${RUN}`.toUpperCase().slice(0, 20);
    await page.getByTestId("date-firma-vat-code").fill(phoneValue);
    await save(page);
    await fits(`${HREF} dupa salvare`);
    await openDateFirma(page);
    await expect(page.getByTestId("date-firma-vat-code")).toHaveValue(phoneValue);

    // --- PESTE LATIMEA DE TELEFON NIMIC NU SE SCHIMBA ----------------------
    // Fiecare clasa poarta max-md, deci la 1440px cele opt casete stau doua pe rand.
    await page.setViewportSize(DESKTOP);
    await openDateFirma(page);
    const desktopLefts = await page
      .getByTestId("settings-date-firma")
      .evaluate((section) =>
        Array.from(section.querySelectorAll("input")).map((i) =>
          Math.round(i.getBoundingClientRect().left),
        ),
      );
    expect(desktopLefts.length).toBe(FIELDS.length);
    expect(
      new Set(desktopLefts).size,
      `pe desktop casetele ar trebui sa stea pe doua coloane: ${desktopLefts.join(",")}`,
    ).toBe(2);
  });
});
