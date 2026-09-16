import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { MAKE_CALLBACK_SECRET } from "./support/make";

// romanian-file-date.spec - linia de acceptanta a cardului P3-49.
//
// DOUA LUCRURI, AMANDOUA DESPRE CE SCRIE BROWSERUL DE LA EL:
//
//   1. campul de fisier isi scrie singur butonul ("Choose File") si mesajul gol
//      ("No file chosen"), in limba browserului;
//   2. campul de data isi aseaza singur ziua si luna, tot dupa limba
//      browserului, deci pe engleza aceleasi taste salveaza alta zi.
//
// Niciunul dintre textele acelea nu este in pagina. O cautare in textul
// ecranului NU le gaseste, deci ar trece si pe ecranul stricat. De aceea fiecare
// caz de aici se uita la CONTROALE: campul nativ nu are voie sa fie vizibil,
// butonul romanesc are voie sa fie singurul lucru pe care il vede operatorul, si
// ziua stocata se citeste inapoi.
//
// BROWSERUL ESTE PORNIT IN ENGLEZA, EXPLICIT. playwright.config.ts pune
// locale-ul paginii pe ro-RO, iar Chromium isi deseneaza controalele dupa limba
// PROCESULUI, nu dupa locale-ul paginii: sub un browser romanesc cazurile ar
// trece si fara reparatie. Acelasi fel de pornire ca la cazul P3-41 din
// inbound.spec, de acolo este luat.
//
// DATELE DE TEST NU SE STERG, conventia P2-07. Tot ce se creeaza aici poarta
// prefixul TEST- si ramane in baza.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const TEST_CATEGORY = "TEST-Categorie";
const CHOOSE = "Alege fișierul";
const EMPTY = "Niciun fișier ales";
const PLACEHOLDER = "zz.ll.aaaa";
const CALLBACK = "/api/extraction/callback";

function pdf(tag: string): Buffer {
  return Buffer.from(
    `%PDF-1.4\n% RC ${tag}\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
    "utf8",
  );
}

function png(): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(56, 0),
  ]);
}

/* ------------------------------------------------------ citirea din baza -- */

function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    throw new Error(
      "romanian-file-date.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL si de " +
        "SUPABASE_SERVICE_ROLE_KEY. In CI le exporta pasul 'Export local Supabase credentials'. " +
        "Local: supabase status -o env.",
    );
  }
  return { origin: new URL(url).origin, headers: { apikey: service, Authorization: `Bearer ${service}` } };
}

async function rows<T>(path: string): Promise<T[]> {
  const { origin, headers } = supabase();
  const response = await fetch(`${origin}/rest/v1/${path}`, { headers });
  if (!response.ok) {
    throw new Error(`rest ${path} a raspuns ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  return (await response.json()) as T[];
}

/* ----------------------------------------------------------- afirmatiile -- */

/** Campul romanesc de fisier: campul nativ ascuns, butonul si mesajul vizibile. */
async function expectRomanianFilePicker(scope: Page | ReturnType<Page["locator"]>, id: string) {
  const native = scope.getByTestId(`${id}-input`);
  await expect(native, `${id}: campul nativ trebuie sa existe`).toHaveCount(1);
  await expect(native, `${id}: campul nativ nu are voie sa se vada`).toBeHidden();
  await expect(scope.getByTestId(`${id}-choose`)).toBeVisible();
  await expect(scope.getByTestId(`${id}-choose`)).toHaveText(CHOOSE);
  await expect(scope.getByTestId(`${id}-chosen`)).toHaveText(EMPTY);
}

/** Campul romanesc de data: nimic nativ vizibil, indicatia zz.ll.aaaa. */
async function expectRomanianDateField(page: Page, id: string) {
  const field = page.getByTestId(id);
  await expect(field, `${id}: campul romanesc trebuie sa se vada`).toBeVisible();
  await expect(field).toHaveAttribute("placeholder", PLACEHOLDER);
  await expect(field).toHaveAttribute("type", "text");
  const native = page.getByTestId(`${id}-native`);
  await expect(native, `${id}: campul nativ trebuie sa existe, ca sa deschida calendarul`).toHaveCount(1);
  await expect(native, `${id}: campul nativ de data nu are voie sa se vada`).toBeHidden();
  await expect(page.getByTestId(`${id}-calendar`)).toBeVisible();
}

/** Niciun camp nativ vizibil pe tot ecranul, oricum s-ar chema el. */
async function expectNoNativeControlOnScreen(page: Page) {
  for (const type of ["file", "date"]) {
    const visible = await page.locator(`input[type=${type}]:visible`).count();
    expect(visible, `un input[type=${type}] se vede pe ecran`).toBe(0);
  }
}

/* -------------------------------------------------------------- ecranele -- */

async function ensureTestCategory(page: Page) {
  await page.goto("/setari");
  const existing = page.locator(`[data-testid="category-row"][data-name="${TEST_CATEGORY}"]`);
  if ((await existing.count()) > 0) return;
  await page.getByTestId("category-name").fill(TEST_CATEGORY);
  await page.getByTestId("category-add").click();
  await expect(existing).toHaveCount(1, { timeout: 15_000 });
}

async function makeProduct(page: Page, tag: string): Promise<string> {
  const sku = `TEST-RFD-${tag}-${RUN}`;
  await page.goto("/inventar");
  await page.getByTestId("product-new").click();
  await page.getByTestId("field-sku").fill(sku);
  await page.getByTestId("field-name").fill(`Produs ${tag}`);
  await page.getByTestId("field-category").selectOption({ label: TEST_CATEGORY });
  await page.getByTestId("field-unit").selectOption("pcs");
  await page.getByTestId("field-unit-value").fill("10");
  await page.getByTestId("form-submit").click();
  await expect(page.locator(`[data-testid="product-row"][data-sku="${sku}"]`)).toHaveCount(1, {
    timeout: 20_000,
  });
  return sku;
}

async function addLine(page: Page, sku: string) {
  const option = page.getByTestId("line-product-0").locator("option").filter({ hasText: sku });
  await page.getByTestId("line-product-0").selectOption((await option.getAttribute("value")) ?? "");
  await page.getByTestId("line-quantity-0").fill("4");
  await page.getByTestId("line-price-0").fill("5");
}

/**
 * Un browser al cazului, pornit in ENGLEZA. Conditia intregului fisier: numai
 * sub ea browserul isi deseneaza controalele in engleza.
 */
async function englishPage(browser: Browser, baseURL: string | undefined): Promise<Page> {
  const context = await browser.newContext({
    baseURL,
    locale: "ro-RO",
    viewport: { width: 1440, height: 900 },
  });
  return context.newPage();
}

// ---------------------------------------------------------------------------

test.describe("P3-49: fișiere și date, românește, pe orice browser", () => {
  test.describe.configure({ timeout: 300_000 });

  test("1. fiecare câmp de fișier arată butonul românesc, iar încărcarea merge ca înainte", async ({
    playwright,
    baseURL,
  }) => {
    const browser = await playwright.chromium.launch({ args: ["--lang=en-US"] });
    try {
      const page = await englishPage(browser, baseURL);
      await signIn(page, ownerAccount());
      await ensureTestCategory(page);
      const sku = await makeProduct(page, "fis");

      // A. INCARCA COMANDA: campul de citire automata.
      await page.goto("/incarca-comanda");
      await expect(page.getByTestId("upload-explainer")).toBeVisible({ timeout: 20_000 });
      await expectRomanianFilePicker(page, "extraction");
      await expectNoNativeControlOnScreen(page);

      // B. ADAUGA MANUAL: documentul comenzii, dupa ce comanda exista.
      await page.goto("/adauga-manual");
      await expect(page.getByTestId("inbound-form")).toBeVisible();
      await page.getByTestId("order-supplier").fill(`TEST Furnizor ${RUN}`);
      await page.getByTestId("order-expected-at").fill("2026-12-01");
      await addLine(page, sku);
      await page.getByTestId("order-confirm").click();
      await expect(page.getByTestId("order-created")).toBeVisible({ timeout: 20_000 });
      const reference = (await page.getByTestId("created-reference").innerText()).trim();
      await expectRomanianFilePicker(page, "doc");
      await expectNoNativeControlOnScreen(page);

      // INCARCAREA MERGE CA INAINTE: acelasi setInputFiles pe campul ascuns,
      // aceeasi actiune de server, si numele ales ia locul mesajului gol.
      const attached = `TEST-atasat-${RUN}.pdf`;
      await page.getByTestId("doc-input").setInputFiles({
        name: attached,
        mimeType: "application/pdf",
        buffer: pdf("doc"),
      });
      await expect(page.getByTestId("doc-chosen")).toHaveText(attached);
      await expect(page.getByTestId("doc-done")).toBeVisible({ timeout: 30_000 });

      // C. PANOUL COMENZII, pe lista de comenzi. Comanda de mai sus are deja
      // document, deci se face alta, careia panoul ii ofera atasarea.
      await page.goto("/adauga-manual");
      await expect(page.getByTestId("inbound-form")).toBeVisible();
      await page.getByTestId("order-supplier").fill(`TEST Furnizor panou ${RUN}`);
      await page.getByTestId("order-expected-at").fill("2026-12-02");
      await addLine(page, sku);
      await page.getByTestId("order-confirm").click();
      await expect(page.getByTestId("order-created")).toBeVisible({ timeout: 20_000 });
      const panelReference = (await page.getByTestId("created-reference").innerText()).trim();

      await page.goto("/comenzi");
      const item = page.locator(`[data-testid="inbound-item"][data-reference="${panelReference}"]`);
      await expect(item).toHaveCount(1, { timeout: 20_000 });
      await item.click();
      await expect(page.getByTestId("doc-upload")).toBeVisible({ timeout: 20_000 });
      await expectRomanianFilePicker(page, "doc");
      await expectNoNativeControlOnScreen(page);

      // Comanda cu document ramane cea de dinainte, deci nimic nu s-a stricat.
      expect(reference).not.toBe(panelReference);

    } finally {
      await browser.close();
    }
  });

  test("2. fila Documente și imaginea produsului au același buton românesc", async ({
    playwright,
    baseURL,
  }) => {
    const browser = await playwright.chromium.launch({ args: ["--lang=en-US"] });
    try {
      const page = await englishPage(browser, baseURL);
      await signIn(page, ownerAccount());
      await ensureTestCategory(page);

      // A. FILA DOCUMENTE A CLIENTULUI, si a proiectului lui (cardul P3-15).
      const clientName = `TEST RFD Beneficiar ${RUN}`;
      await page.goto("/clienti");
      await page.getByTestId("client-new").click();
      await expect(page.getByTestId("client-form")).toBeVisible();
      await page.getByTestId("field-client-name").fill(clientName);
      await page.getByTestId("client-submit").click();
      await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });
      const clientId = page.url().slice(page.url().lastIndexOf("/") + 1).split("?")[0]!;

      await page.goto("/proiecte");
      await page.getByTestId("project-new").click();
      await expect(page.getByTestId("project-form")).toBeVisible();
      await page.getByTestId("field-project-client").selectOption({ label: clientName });
      await page.getByTestId("field-project-name").fill(`TEST RFD Șantier ${RUN}`);
      await page.getByTestId("project-submit").click();
      await expect(page.getByTestId("project-detail")).toBeVisible({ timeout: 25_000 });
      const projectId = page.url().slice(page.url().lastIndexOf("/") + 1).split("?")[0]!;

      for (const path of [`/clienti/${clientId}`, `/proiecte/${projectId}`]) {
        await page.goto(`${path}?fila=documente`);
        const panel = page.getByTestId("panel-documente");
        await expect(panel).toBeVisible({ timeout: 20_000 });
        await expect(page.getByTestId("document-upload")).toBeVisible({ timeout: 20_000 });
        await expectRomanianFilePicker(page, "document");
        await expectNoNativeControlOnScreen(page);
      }

      // Incarcarea de pe fila proiectului merge ca inainte.
      const name = `TEST Contract ${RUN}.pdf`;
      const panel = page.getByTestId("panel-documente");
      await panel.getByTestId("document-kind").selectOption("contract");
      await panel.getByTestId("document-input").setInputFiles({
        name,
        mimeType: "application/pdf",
        buffer: pdf("fila"),
      });
      await expect(panel.getByTestId("document-chosen")).toHaveText(name);
      await panel.getByTestId("document-submit").click();
      await expect(panel.getByTestId("document-done")).toBeVisible({ timeout: 60_000 });
      await expect(
        page.locator(`[data-testid="document-row"][data-name="${name}"]`),
      ).toBeVisible({ timeout: 20_000 });

      // B. IMAGINEA PRODUSULUI (cardul P3-56), acelasi buton si acelasi mesaj.
      await page.goto("/inventar");
      await page.getByTestId("product-new").click();
      await expect(page.getByTestId("field-image")).toBeVisible({ timeout: 20_000 });
      await expectRomanianFilePicker(page, "field-image");
      await expectNoNativeControlOnScreen(page);

      const image = `TEST-imagine-${RUN}.png`;
      await page.getByTestId("field-image-input").setInputFiles({
        name: image,
        mimeType: "image/png",
        buffer: png(),
      });
      await expect(page.getByTestId("field-image-chosen")).toHaveText(image);

    } finally {
      await browser.close();
    }
  });

  test("3. fiecare câmp de dată se scrie zi, lună, an, și ziua gândită este cea salvată", async ({
    playwright,
    baseURL,
  }) => {
    const browser = await playwright.chromium.launch({ args: ["--lang=en-US"] });
    try {
      const page = await englishPage(browser, baseURL);
      await signIn(page, ownerAccount());
      await ensureTestCategory(page);
      const sku = await makeProduct(page, "data");

      // A. FISA DE INTRARE, pe amandoua ecranele care o poarta.
      for (const path of ["/adauga-manual", "/incarca-comanda"]) {
        await page.goto(path);
        await expect(page.getByTestId("inbound-form")).toBeVisible({ timeout: 20_000 });
        await expectRomanianDateField(page, "order-ordered-at");
        await expectRomanianDateField(page, "order-expected-at");
        await expectNoNativeControlOnScreen(page);
      }

      // TASTELE 01122027 INSEAMNA 1 DECEMBRIE, si asta se salveaza. Pe campul
      // nativ, sub un browser in engleza, aceleasi taste pastrau 12 ianuarie.
      await page.goto("/adauga-manual");
      await expect(page.getByTestId("inbound-form")).toBeVisible();
      const expectedAt = page.getByTestId("order-expected-at");
      await expectedAt.pressSequentially("01122027");
      await expect(expectedAt).toHaveValue("01.12.2027");
      await expect(page.getByTestId("order-expected-at-native")).toHaveValue("2027-12-01");

      // O data imposibila este refuzata romaneste si nu ajunge nicaieri.
      const orderedAt = page.getByTestId("order-ordered-at");
      await orderedAt.pressSequentially("32012027");
      await expect(page.getByTestId("order-ordered-at-error")).toBeVisible();
      await expect(page.getByTestId("order-ordered-at-error")).toContainText("Data nu este validă");
      await expect(page.getByTestId("order-ordered-at-native")).toHaveValue("");
      await orderedAt.fill("");

      await page.getByTestId("order-supplier").fill(`TEST Furnizor data ${RUN}`);
      await addLine(page, sku);
      await page.getByTestId("order-confirm").click();
      await expect(page.getByTestId("order-created")).toBeVisible({ timeout: 20_000 });
      const reference = (await page.getByTestId("created-reference").innerText()).trim();

      // CITIT INAPOI DIN BAZA: ziua gandita, nu cea a browserului.
      const orders = await rows<{ expected_at: string; ordered_at: string | null }>(
        `inbound_orders?select=expected_at,ordered_at&reference=eq.${encodeURIComponent(reference)}`,
      );
      expect(orders, `comanda ${reference}`).toHaveLength(1);
      expect(orders[0]!.expected_at).toBe("2027-12-01");
      expect(orders[0]!.ordered_at).toBeNull();

      // B. FORMULARUL DE LEAD, si el citit inapoi din baza.
      await page.goto("/clienti?vedere=leaduri");
      await page.getByTestId("leaduri-new").click();
      await expect(page.getByTestId("leaduri-form")).toBeVisible();
      await expectRomanianDateField(page, "field-leaduri-follow-up");
      await expectNoNativeControlOnScreen(page);

      const leadName = `TEST RFD Lead ${RUN}`;
      await page.getByTestId("field-leaduri-name").fill(leadName);
      await page.getByTestId("field-leaduri-stage").selectOption("follow_up");
      await page.getByTestId("field-leaduri-follow-up").pressSequentially("01122027");
      await expect(page.getByTestId("field-leaduri-follow-up")).toHaveValue("01.12.2027");
      await page.getByTestId("leaduri-submit").click();
      await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });

      const leads = await rows<{ follow_up_date: string }>(
        `clients?select=follow_up_date&name=eq.${encodeURIComponent(leadName)}`,
      );
      expect(leads, `leadul ${leadName}`).toHaveLength(1);
      expect(leads[0]!.follow_up_date).toBe("2027-12-01");

      // C. FORMULARUL DE CLIENT si FORMULARUL DE PROIECT.
      await page.goto("/clienti");
      await page.getByTestId("client-new").click();
      await expect(page.getByTestId("client-form")).toBeVisible();
      const stage = page.getByTestId("field-client-stage");
      if ((await stage.count()) > 0) {
        await stage.selectOption("follow_up");
        await expectRomanianDateField(page, "field-client-follow-up");
      }
      await expectNoNativeControlOnScreen(page);
      await page.keyboard.press("Escape");

      await page.goto("/proiecte");
      await page.getByTestId("project-new").click();
      await expect(page.getByTestId("project-form")).toBeVisible();
      await expectRomanianDateField(page, "field-project-start");
      await expectRomanianDateField(page, "field-project-end");
      await expectNoNativeControlOnScreen(page);

    } finally {
      await browser.close();
    }
  });

  test("4. fișa de verificare a documentului citit automat are aceleași câmpuri de dată", async ({
    playwright,
    baseURL,
    request,
  }) => {
    const browser = await playwright.chromium.launch({ args: ["--lang=en-US"] });
    try {
      const page = await englishPage(browser, baseURL);
      await signIn(page, ownerAccount());

      const filename = `TEST-RFD-fisa-${RUN}.pdf`;
      await page.goto("/incarca-comanda");
      await page.getByTestId("extraction-input").setInputFiles({
        name: filename,
        mimeType: "application/pdf",
        buffer: pdf("fisa"),
      });
      await expect(page.getByTestId("extraction-chosen")).toHaveText(filename);

      const card = page.locator(`[data-testid="draft-card"]`).filter({ hasText: filename });
      await expect(card).toHaveCount(1, { timeout: 30_000 });
      const orderId = (await card.getAttribute("data-order-id")) ?? "";
      expect(orderId).toMatch(/^[0-9a-f-]{36}$/i);

      await extracted(request, orderId);
      await page.reload();
      const reloaded = page.locator(`[data-testid="draft-card"][data-order-id="${orderId}"]`);
      await expect(reloaded).toHaveCount(1, { timeout: 30_000 });
      await reloaded.getByTestId("draft-review").click();
      await expect(page.getByTestId("review-form")).toBeVisible({ timeout: 15_000 });

      await expectRomanianDateField(page, "review-ordered-at");
      await expectRomanianDateField(page, "review-expected-at");
      await expectNoNativeControlOnScreen(page);

      // Data citita din document ajunge pe ecran romaneste si ramane 2026-08-14.
      await expect(page.getByTestId("review-ordered-at")).toHaveValue("14.08.2026");
      await expect(page.getByTestId("review-ordered-at-native")).toHaveValue("2026-08-14");

      // Si aici tastele 01122027 inseamna 1 decembrie.
      await page.getByTestId("review-expected-at").pressSequentially("01122027");
      await expect(page.getByTestId("review-expected-at")).toHaveValue("01.12.2027");
      await expect(page.getByTestId("review-expected-at-native")).toHaveValue("2027-12-01");

    } finally {
      await browser.close();
    }
  });
});

/** Ciorna se umple pe drumul masinii, ca in review.spec: un singur callback. */
async function extracted(request: APIRequestContext, orderId: string) {
  const response = await request.post(CALLBACK, {
    headers: {
      "Content-Type": "application/json",
      "x-rc-callback-secret": MAKE_CALLBACK_SECRET,
    },
    data: {
      order_id: orderId,
      status: "extracted",
      error_code: null,
      reason: null,
      supplier_name: "Bilka Steel SRL",
      document_source: "digital",
      order_date: "2026-08-14",
      subtotal: 18450.0,
      vat_amount: 3690.0,
      document_total: 22140.0,
      prices_include_vat: false,
      vat_rate: 20.0,
      currency: "MDL",
      currency_raw: "lei",
      confidence: 0.94,
      lines: [
        {
          product_name: `TEST Tigla ${RUN}`,
          quantity: 240.5,
          unit: "m2",
          unit_raw: "mp",
          unit_price: 76.72,
          line_total: 18452.36,
          currency: "MDL",
          currency_raw: "lei",
          category: null,
          category_raw: "Invelitori",
          confidence: 0.91,
        },
      ],
      _meta: {
        model: "gpt-4o-mini",
        prompt_version: "v2.0",
        page_count: 2,
        characters_extracted: 4820,
        duration_ms: 8140,
      },
    },
    maxRetries: 2,
  });
  expect(response.ok(), await response.text()).toBe(true);
}
