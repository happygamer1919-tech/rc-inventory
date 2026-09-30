import { expect, test, type Page } from "@playwright/test";
import { managerAccount, ownerAccount, type TestAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// facturare-settings.spec - jumatatea de ECRAN a liniei de acceptanta a cardului
// P3-108, goal G65 partea 1.
//
// ESTE SINGURUL ECRAN PE CARE ACEST CARD IL ATINGE. Nu exista intrare in meniu, nu
// exista ruta /facturare si nu exista nicio pagina de factura: acelea sunt partile
// 2 si 3 ale obiectivului G65 si sunt carduri separate.
//
// Trei cazuri, in ordinea cardului:
//   1. administratorul schimba prefixul seriei, il citeste inapoi de pe ecran DUPA
//      o reincarcare, si aceeasi valoare se citeste si direct din baza; nota de
//      langa cota TVA scrie cuvant cu cuvant "De confirmat cu contabilul.";
//   2. administratorul completeaza cele cinci date ale firmei si cota, si toate
//      sase se citesc inapoi;
//   3. operatorul NU AJUNGE la ecranul de setari deloc, fiindca lib/routes.ts il
//      declara al proprietarului, iar cu propriul jeton nu poate scrie nici direct
//      in tabela.
//
// CE SE CITESTE DIN BAZA se citeste cu cheia service_role a stivei LOCALE, ca in
// sheet-options-admin.spec: un formular care isi arata propria valoare din starea
// lui de React ar trece si daca nimic nu s-ar fi scris.
//
// PREFIXUL ESTE PUS INAPOI PE RC- LA FINAL, si asta este si verificat: seria este
// globala, deci o valoare de test lasata in urma ar numerota facturile urmatoarei
// rulari intr-o serie de test.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

/** Prefixul implicit al cardului, si valoarea la care se revine. */
const DEFAULT_PREFIX = "RC-";
/** Cuvant cu cuvant ce trebuie sa scrie ecranul langa cota implicita. */
const VAT_NOTE = "De confirmat cu contabilul.";

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error(
      "facturare-settings.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY si " +
        "SUPABASE_SERVICE_ROLE_KEY. In CI sunt exportate de pasul 'Export local Supabase credentials'. " +
        "Local: supabase status -o env.",
    );
  }
  return { origin: new URL(url).origin, anon, service };
}

type Row = Record<string, unknown>;

async function settingsInDatabase(): Promise<Row> {
  const { origin, service } = env();
  const response = await fetch(
    `${origin}/rest/v1/invoice_settings?select=series_prefix,number_includes_year,default_vat_rate,` +
      `issuer_name,issuer_fiscal_code,issuer_address,issuer_bank,issuer_iban`,
    { headers: { apikey: service, Authorization: `Bearer ${service}` } },
  );
  const rows = (await response.json().catch(() => [])) as Row[];
  expect(response.ok, `setarile nu au putut fi citite din baza: ${response.status}`).toBe(true);
  expect(rows, "public.invoice_settings are exact un rand").toHaveLength(1);
  return rows[0]!;
}

async function setPrefixInDatabase(prefix: string): Promise<void> {
  const { origin, service } = env();
  const response = await fetch(`${origin}/rest/v1/invoice_settings?id=eq.true`, {
    method: "PATCH",
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ series_prefix: prefix, number_includes_year: true }),
  });
  expect(response.ok, `prefixul nu a putut fi pus pe ${prefix}: ${response.status}`).toBe(true);
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

async function openSettings(page: Page) {
  await page.goto("/setari");
  await expect(page.getByTestId("settings-facturare")).toBeVisible({ timeout: 25_000 });
  // Blocul nu are voie sa fie starea "nu este activa": migratiile sunt aplicate in CI.
  await expect(page.getByTestId("facturare-inactive")).toHaveCount(0);
}

async function save(page: Page) {
  await page.getByTestId("facturare-save").click();
  await expect(async () => {
    const error = page.getByTestId("facturare-error");
    if ((await error.count()) > 0) throw new Error(`salvarea a raspuns cu eroare: ${await error.innerText()}`);
    await expect(page.getByTestId("facturare-done")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 60_000 });
}

test.describe("Setări, blocul Facturare", () => {
  test.describe.configure({ timeout: 180_000 });

  test.afterAll(async () => {
    await setPrefixInDatabase(DEFAULT_PREFIX);
    expect(
      (await settingsInDatabase()).series_prefix,
      "prefixul a fost pus inapoi pe implicitul cardului",
    ).toBe(DEFAULT_PREFIX);
  });

  test("1. administratorul schimbă prefixul seriei și îl citește înapoi, iar cota implicită poartă nota", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await openSettings(page);

    // NOTA DE LANGA COTA, CUVANT CU CUVANT. Cota nu a fost confirmata de un
    // contabil si ecranul nu are voie sa pretinda altceva.
    await expect(page.getByTestId("facturare-vat-note")).toHaveText(VAT_NOTE);

    const prefix = `TEST-S1-${RUN}-`;
    await page.getByTestId("facturare-series-prefix").fill(prefix);
    await save(page);

    // DUPA O REINCARCARE, deci ce se citeste nu este starea de React a formularului.
    await openSettings(page);
    await expect(page.getByTestId("facturare-series-prefix")).toHaveValue(prefix);

    // SI DIRECT DIN BAZA, deci nu este nici memoria paginii.
    expect((await settingsInDatabase()).series_prefix, "prefixul scris in baza").toBe(prefix);

    // Inapoi pe implicit, prin ecran, si citit inapoi tot prin ecran.
    await page.getByTestId("facturare-series-prefix").fill(DEFAULT_PREFIX);
    await save(page);
    await openSettings(page);
    await expect(page.getByTestId("facturare-series-prefix")).toHaveValue(DEFAULT_PREFIX);
    expect((await settingsInDatabase()).series_prefix, "prefixul este iar cel implicit").toBe(
      DEFAULT_PREFIX,
    );
  });

  // -------------------------------------------------------------------------
  // P3-115, constatarea G15 a raportului docs/reports/2026-09-29-critic-bug-sweep-2.md.
  // -------------------------------------------------------------------------
  test("1b. cu anul stins, numărul nu are două cratime, iar exemplul de pe ecran o arată înainte de salvare", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await openSettings(page);

    const example = page.getByTestId("facturare-number-example");
    // ANUL UTC, fiindca asa il citeste ruta: app/(app)/setari/page.tsx trimite
    // `new Date().getUTCFullYear()`. Testul citeste acelasi ceas ca ecranul si nu
    // altul. (Ca ANUL DE PE ECRANUL DE SETARI este cel UTC si nu cel de la Chisinau
    // este o observatie a cardului P3-115, scrisa in raportul lui: nu este una din
    // cele zece constatari si nu se schimba aici.)
    const year = new Date().getUTCFullYear();

    // --- PREFIXUL IMPLICIT, CU ANUL APRINS: o singura cratima peste tot -------
    // "RC-" plus "2026" da seria "RC-2026", care nu se termina in cratima, deci
    // numarul primeste una: "RC-2026-0001".
    await page.getByTestId("facturare-series-prefix").fill(DEFAULT_PREFIX);
    if (!(await page.getByTestId("facturare-year").isChecked())) {
      await page.getByTestId("facturare-year").check();
    }
    await expect(example).toHaveText(
      `Numărul următoarei facturi va arăta așa: ${DEFAULT_PREFIX}${year}-0001`,
    );

    // --- ACELASI PREFIX, CU ANUL STINS: SERIA ESTE CHIAR "RC-" ---------------
    // Aici era defectul. Seria se termina deja in cratima si compunerea mai punea
    // una, deci fiecare numar era "RC--0001". Constrangerea din baza cere doar ca
    // prefixul sa nu fie gol, deci nimic nu il opreste.
    await page.getByTestId("facturare-year").uncheck();
    await expect(example).toHaveText(
      `Numărul următoarei facturi va arăta așa: ${DEFAULT_PREFIX}0001`,
    );
    const shown = await example.innerText();
    expect(shown, "niciun numar de factura nu are doua cratime la rand").not.toContain("--");

    // --- SI UN PREFIX CARE NU SE TERMINA IN CRATIMA PRIMESTE UNA -------------
    // Reparatia nu este "scoate cratima", este "pune-o o singura data": un prefix
    // fara cratima ar da altfel "FACT0001", care este un numar de necitit.
    await page.getByTestId("facturare-series-prefix").fill("FACT");
    await expect(example).toHaveText("Numărul următoarei facturi va arăta așa: FACT-0001");

    await page.getByTestId("facturare-year").check();
    await expect(example).toHaveText(
      `Numărul următoarei facturi va arăta așa: FACT${year}-0001`,
    );

    // Nimic nu s-a salvat in acest caz: exemplul se calculeaza din starea
    // formularului, care este chiar ce face din el un avertisment inainte de fapt.
    expect(
      (await settingsInDatabase()).series_prefix,
      "cazul nu a scris nimic in baza",
    ).not.toBe("FACT");
  });

  test("2. administratorul completează datele firmei și cota implicită, și toate se citesc înapoi", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await openSettings(page);

    const want = {
      name: `TEST Rapid Construct ${RUN}`,
      fiscalCode: `1002600${RUN}`.slice(0, 13),
      address: `mun. Chișinău, str. Testului ${RUN}`,
      bank: `TEST Banca ${RUN}`,
      iban: `MD00TEST${RUN}`.toUpperCase().slice(0, 24),
      rate: "8",
    };

    await page.getByTestId("facturare-issuer-name").fill(want.name);
    await page.getByTestId("facturare-issuer-fiscal-code").fill(want.fiscalCode);
    await page.getByTestId("facturare-issuer-address").fill(want.address);
    await page.getByTestId("facturare-issuer-bank").fill(want.bank);
    await page.getByTestId("facturare-issuer-iban").fill(want.iban);
    await page.getByTestId("facturare-vat-rate").fill(want.rate);
    await save(page);

    await openSettings(page);
    await expect(page.getByTestId("facturare-issuer-name")).toHaveValue(want.name);
    await expect(page.getByTestId("facturare-issuer-fiscal-code")).toHaveValue(want.fiscalCode);
    await expect(page.getByTestId("facturare-issuer-address")).toHaveValue(want.address);
    await expect(page.getByTestId("facturare-issuer-bank")).toHaveValue(want.bank);
    await expect(page.getByTestId("facturare-issuer-iban")).toHaveValue(want.iban);
    await expect(page.getByTestId("facturare-vat-rate")).toHaveValue(want.rate);

    const row = await settingsInDatabase();
    expect(row.issuer_name, "denumirea firmei scrisa in baza").toBe(want.name);
    expect(row.issuer_fiscal_code, "IDNO scris in baza").toBe(want.fiscalCode);
    expect(row.issuer_address, "adresa scrisa in baza").toBe(want.address);
    expect(row.issuer_bank, "banca scrisa in baza").toBe(want.bank);
    expect(row.issuer_iban, "IBAN scris in baza").toBe(want.iban);
    expect(Number(row.default_vat_rate), "cota implicita scrisa in baza").toBe(8);

    // Cota inapoi pe 20, implicitul cardului, si nota este tot acolo.
    await page.getByTestId("facturare-vat-rate").fill("20");
    await save(page);
    await openSettings(page);
    await expect(page.getByTestId("facturare-vat-rate")).toHaveValue("20");
    await expect(page.getByTestId("facturare-vat-note")).toHaveText(VAT_NOTE);
    expect(Number((await settingsInDatabase()).default_vat_rate), "cota este iar 20").toBe(20);
  });

  test("3. operatorul nu ajunge la ecranul de setări și nu poate scrie în tabelă", async ({ page }) => {
    const manager = managerAccount();
    const before = await settingsInDatabase();

    // OPERATORUL NU VEDE DELOC ECRANUL, si asta nu este o slabire a cazului, este
    // ce se intampla in realitate. Prima versiune a acestui caz cerea blocul
    // Facturare fara buton de salvare, pe presupunerea ca operatorul ajunge pe
    // /setari si vede campurile inactive. Nu ajunge: lib/routes.ts declara
    // OWNER_ONLY_PREFIXES = ["/setari"], deci proxy.ts rescrie cererea catre ecranul
    // 403 inainte ca pagina sa fie randata. Rularea 36454267878 a cazut exact aici,
    // cu getByTestId('settings-facturare') negasit, si avea dreptate.
    //
    // Aceeasi jumatate de ecran pe care o probeaza sheet-options-admin.spec cazul 5,
    // pentru celalalt bloc administrat din acelasi ecran.
    await signIn(page, manager);
    await page.goto("/setari");
    await expect(page.getByTestId("forbidden")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("settings-facturare")).toHaveCount(0);
    await expect(page.getByTestId("facturare-save")).toHaveCount(0);

    // JUMATATEA DE BAZA DE DATE: cu jetonul operatorului, direct la PostgREST.
    // Ecranul refuzat este o curtoazie; asta este garantia.
    // Politica invoice_settings_owner_update nu lasa niciun rand sa treaca, deci
    // cererea poate raspunde 200 si nu schimba nimic: dovada este valoarea de dupa.
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
      body: JSON.stringify({ series_prefix: `OP-${RUN}-` }),
    });
    if (patched.ok) {
      expect(await patched.json().catch(() => []), "randuri schimbate de operator").toEqual([]);
    }

    const after = await settingsInDatabase();
    expect(after.series_prefix, "operatorul NU a schimbat prefixul seriei").toBe(before.series_prefix);
    expect(Number(after.default_vat_rate), "operatorul NU a schimbat cota implicita").toBe(
      Number(before.default_vat_rate),
    );
  });
});
