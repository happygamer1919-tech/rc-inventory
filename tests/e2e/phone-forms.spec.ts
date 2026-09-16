import { expect, test, type Locator, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// phone-forms.spec - linia de acceptanta a cardului P3-65 (G23 partea 3).
//
// Formularele si panourile de detaliu pe un telefon de 390x844: panoul produsului,
// formularele Client nou, Lead nou, Contact nou si Proiect nou, fisa clientului
// (Contacte si Documente), fisa proiectului cu formularul Modifică, fisa comenzii
// manuale si panourile comenzilor de intrare si de iesire. Sub 768px se deschid pe
// toata latimea, cu campurile unul sub altul; peste 768px nimic nu se schimba.
// Restul suitei ruleaza la 1440x900 si ramane neschimbat.
//
// CE INSEAMNA "INCAPE", masurat in pagina, nu citit din clase, pe RADACINA
// ecranului: <main>, sau panoul lateral cand unul este deschis.
//   - fara derulare laterala: documentul, <main> si, cand exista, panoul. <main>
//     deruleaza singur (overflow-y-auto in app/(app)/layout.tsx), iar panoul la
//     fel, deci masuratoarea pe document singura ar fi un verde fals (P3-64).
//   - panoul deschis are exact latimea ecranului
//   - tinta de atingere: fiecare camp, select, zona de text, buton si legatura
//     vizibila are cel putin 44px. O bifa se masoara prin eticheta ei, care este
//     tinta; o legatura care imbraca un buton se masoara prin buton.
//   - campurile, selecturile si zonele de text au text de cel putin 16px, altfel
//     iOS mareste pagina la atingere
//   - nimic in afara ecranului, niciun text taiat, niciun antet de tabel vizibil
//
// DATELE. Produsele, proiectele si comenzile semanate sunt cele din
// scripts/seed-test-procurement.mjs. Clientul, leadul, contactul, proiectul,
// documentul si comanda sunt ale acestui spec, create prin formularele de pe
// telefon, cu prefixul TEST si un sufix unic pe rulare. Nu se sterg niciodata.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const MIN_TAP = 44;
const MIN_INPUT_FONT = 16;

/** Produsul semanat cu un lot si o iesire, deci cu randuri in ambele tabele ale panoului. */
const SEED_PRODUCT_SKU = "TEST-NEC-03";
const SEED_PRODUCT_NAME = "TEST Nec Cărămidă";
const SEED_INBOUND_REFERENCE = "TEST-NEC-INTRARE";
const SEED_OUTBOUND_REFERENCE = "TEST-NEC-BON-1";
/** Proiectul semanat "TEST Necesar contract", cu bonul de iesire TEST-NEC-BON-1. */
const SEED_CONTRACT_PROJECT_ID = "7e57c051-0000-4000-8000-000000000703";

// ---------------------------------------------------------------------------
// Masuratori
// ---------------------------------------------------------------------------

type Reading = {
  viewportWidth: number;
  document: { scrollWidth: number; clientWidth: number };
  main: { scrollWidth: number; clientWidth: number };
  root: { scrollWidth: number; clientWidth: number; width: number };
  smallTargets: string[];
  smallFonts: string[];
  outside: string[];
  clipped: string[];
  visibleTheads: number;
};

/**
 * Citeste intr-o singura trecere tot ce trebuie sa incapa la 390px, in radacina
 * data: `main` pentru un ecran, selectorul panoului pentru un panou deschis.
 */
async function readPhone(page: Page, rootSelector = "main"): Promise<Reading> {
  return page.evaluate(
    ({ selector, minTap, minFont }) => {
      const main = document.querySelector("main");
      if (!main) throw new Error("pagina nu are <main>");
      const root = document.querySelector<HTMLElement>(selector);
      if (!root) throw new Error(`radacina ${selector} lipseste`);
      const width = window.innerWidth;

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
      const isCheck = (el: Element) =>
        el.tagName === "INPUT" && ["checkbox", "radio"].includes((el as HTMLInputElement).type);

      const smallTargets: string[] = [];
      for (const el of Array.from(root.querySelectorAll("input, select, textarea, button, a[href]"))) {
        if (!visible(el)) continue;
        // O legatura care imbraca un buton: tinta este butonul, masurat separat.
        if (el.tagName === "A" && el.querySelector("button, input, select")) continue;
        // O bifa: tinta este eticheta care o contine.
        const target = isCheck(el) ? (el.closest("label") ?? el) : el;
        const height = target.getBoundingClientRect().height;
        if (height < minTap) smallTargets.push(`${name(el)} ${height.toFixed(1)}px`);
      }

      const smallFonts: string[] = [];
      for (const el of Array.from(root.querySelectorAll("input, select, textarea"))) {
        if (!visible(el) || isCheck(el)) continue;
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (size < minFont) smallFonts.push(`${name(el)} ${size}px`);
      }

      const outside: string[] = [];
      const clipped: string[] = [];
      for (const el of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
        if (!visible(el)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.left < -0.5 || rect.right > width + 0.5) {
          outside.push(`${name(el)} ${rect.left.toFixed(0)}..${rect.right.toFixed(0)}`);
        }
        // Un camp isi taie mereu textul in propria caseta; restul nu au voie.
        const field = ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName);
        if (!field && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "visible") {
          clipped.push(`${name(el)} ${el.scrollWidth}>${el.clientWidth}`);
        }
      }

      return {
        viewportWidth: width,
        document: {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        },
        main: { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth },
        root: {
          scrollWidth: root.scrollWidth,
          clientWidth: root.clientWidth,
          width: root.getBoundingClientRect().width,
        },
        smallTargets,
        smallFonts,
        outside,
        clipped,
        visibleTheads: Array.from(root.querySelectorAll("thead")).filter(visible).length,
      };
    },
    { selector: rootSelector, minTap: MIN_TAP, minFont: MIN_INPUT_FONT },
  );
}

/** Clauzele 1 si 2, pe ecranul sau panoul deschis. */
async function expectFitsPhone(page: Page, where: string, rootSelector = "main"): Promise<void> {
  const r = await readPhone(page, rootSelector);
  expect(r.viewportWidth, `latimea ecranului pe ${where}`).toBe(PHONE.width);
  expect(r.document.scrollWidth, `derulare laterala a documentului pe ${where}`).toBeLessThanOrEqual(
    r.document.clientWidth,
  );
  expect(r.main.scrollWidth, `derulare laterala in <main> pe ${where}`).toBeLessThanOrEqual(r.main.clientWidth);
  expect(r.root.scrollWidth, `derulare laterala in ${rootSelector} pe ${where}`).toBeLessThanOrEqual(
    r.root.clientWidth,
  );
  if (rootSelector !== "main") {
    expect(Math.abs(r.root.width - PHONE.width), `panoul nu are latimea ecranului pe ${where}`).toBeLessThanOrEqual(
      0.5,
    );
  }
  expect(r.smallTargets, `tinte sub ${MIN_TAP}px pe ${where}`).toEqual([]);
  expect(r.smallFonts, `campuri sub ${MIN_INPUT_FONT}px pe ${where}`).toEqual([]);
  expect(r.outside, `elemente in afara ecranului pe ${where}`).toEqual([]);
  expect(r.clipped, `text taiat pe ${where}`).toEqual([]);
  expect(r.visibleTheads, `antet de tabel vizibil pe ${where}`).toBe(0);
}

/**
 * Un card pe rand, ca in P3-64: randul este o grila, nu un rand de tabel, si
 * fiecare celula cu antet poarta ca eticheta exact textul antetului coloanei ei.
 */
async function expectRowCards(rows: Locator, where: string): Promise<void> {
  const count = Math.min(await rows.count(), 5);
  expect(count, `niciun rand de verificat pe ${where}`).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const reading = await rows.nth(i).evaluate((tr) => {
      const heads = Array.from(tr.closest("table")?.querySelectorAll("thead th") ?? []).map((th) =>
        (th.textContent ?? "").trim(),
      );
      const labels = Array.from(tr.querySelectorAll(":scope > td")).map((td) =>
        getComputedStyle(td, "::before").content.replace(/^"|"$/g, ""),
      );
      return { display: getComputedStyle(tr).display, heads, labels };
    });
    expect(reading.display, `randul ${i} nu este card pe ${where}`).toBe("grid");
    expect(reading.heads.length, `tabel fara antet pe ${where}`).toBeGreaterThan(0);
    for (let c = 0; c < reading.heads.length; c++) {
      if (reading.heads[c] === "") continue;
      expect(reading.labels[c], `eticheta coloanei ${reading.heads[c]} pe ${where}`).toBe(reading.heads[c]);
    }
  }
}

/** O valoare este vizibila si sta intre 0 si 390px. */
async function expectValueOnScreen(value: Locator, where: string): Promise<void> {
  await value.scrollIntoViewIfNeeded();
  await expect(value).toBeVisible();
  const box = await value.boundingBox();
  expect(box, `valoarea nu are cutie pe ${where}`).not.toBeNull();
  expect(box!.x, `valoarea iese spre stanga pe ${where}`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `valoarea iese spre dreapta pe ${where}`).toBeLessThanOrEqual(PHONE.width);
}

// ---------------------------------------------------------------------------
// Cazurile
// ---------------------------------------------------------------------------

/** Autentificare la latimea desktop, cum o face restul suitei, apoi telefonul. */
async function signInOnPhone(page: Page): Promise<void> {
  await page.setViewportSize(DESKTOP);
  await signIn(page, ownerAccount());
  await page.setViewportSize(PHONE);
}

function pdf(): Buffer {
  const head = Buffer.from("%PDF-1.4\n% phone-forms.spec\n");
  return Buffer.concat([head, Buffer.alloc(64, 0x20)]);
}

test.describe("P3-65: formularele si panourile pe telefon (390x844)", () => {
  test.describe.configure({ timeout: 240_000 });

  test("(a) panoul produsului: pe toata latimea, loturile si miscarile sunt carduri", async ({
    page,
  }, testInfo) => {
    await signInOnPhone(page);
    await page.goto(`/inventar?produs=${SEED_PRODUCT_SKU}`);

    const panel = page.getByTestId("product-panel");
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("panel-name")).toHaveText(SEED_PRODUCT_NAME);
    const rows = panel.locator("tbody tr");
    await expect.poll(() => rows.count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(2);

    await expectFitsPhone(page, "panoul produsului", "[data-testid='product-panel']");
    await expectRowCards(rows, "panoul produsului");
    await expectValueOnScreen(page.getByTestId("panel-name"), "panoul produsului");
    await page.screenshot({ path: testInfo.outputPath("phone-forms-product-panel.png") });
  });

  test("(b) Client nou, (d) fisa clientului cu Contact nou si Documente, (e) Proiect nou, (f) fisa proiectului cu Modifică", async ({
    page,
  }, testInfo) => {
    test.setTimeout(360_000);
    await signInOnPhone(page);
    const clientName = `TEST Telefon Formulare ${RUN} Societatea cu Răspundere Limitată Construcții`;

    // (b) Client nou.
    await page.goto("/clienti");
    await page.getByTestId("client-new").click();
    await expect(page.getByTestId("client-form")).toBeVisible();
    await expectFitsPhone(page, "Client nou", "[data-testid='client-form']");
    await page.screenshot({ path: testInfo.outputPath("phone-forms-client-form.png") });
    await page.getByTestId("field-client-name").fill(clientName);
    await page.getByTestId("client-submit").click();

    // (d) Fisa clientului, pe fila Contacte, fara contacte.
    await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("client-detail")).toContainText(clientName);
    const clientPath = new URL(page.url()).pathname;
    await expectFitsPhone(page, "fisa clientului");
    await expectValueOnScreen(page.locator("main h1"), "fisa clientului, titlul");
    await page.screenshot({ path: testInfo.outputPath("phone-forms-client-detail.png") });

    // Contact nou, apoi randul lui ca un card.
    const contactName = `TEST Contact Telefon ${RUN}`;
    await page.getByTestId("contact-new").click();
    await expect(page.getByTestId("contact-form")).toBeVisible();
    await expectFitsPhone(page, "Contact nou", "[data-testid='contact-form']");
    await page.getByTestId("field-contact-name").fill(contactName);
    await page.getByTestId("field-contact-email").fill(`test.telefon.${RUN}@example.com`);
    await page.getByTestId("contact-submit").click();
    const contactRow = page.locator(`[data-testid='contact-row'][data-name='${contactName}']`);
    await expect(contactRow).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("contact-form")).toHaveCount(0);
    await expectFitsPhone(page, "fisa clientului, Contacte");
    await expectRowCards(page.getByTestId("contact-row"), "fisa clientului, Contacte");
    await expectValueOnScreen(contactRow.getByText(contactName, { exact: true }), "contactul");

    // Documente: formularul de incarcare, apoi documentul incarcat ca un card.
    await page.goto(`${clientPath}?fila=documente`);
    await expect(page.getByTestId("document-upload")).toBeVisible({ timeout: 20_000 });
    await expectFitsPhone(page, "Documente, formularul");
    const fileName = `test-telefon-${RUN}-contract-semnat-cu-un-nume-foarte-lung-de-fisier.pdf`;
    const panel = page.getByTestId("panel-documente");
    await panel.getByTestId("document-kind").selectOption("contract");
    await panel.getByTestId("document-input").setInputFiles({
      name: fileName,
      mimeType: "application/pdf",
      buffer: pdf(),
    });
    await expect(panel.getByTestId("document-chosen")).toHaveText(fileName);
    await expectFitsPhone(page, "Documente, fisierul ales");
    await page.screenshot({ path: testInfo.outputPath("phone-forms-documents-chosen.png") });
    await panel.getByTestId("document-submit").click();
    await expect(page.getByTestId("document-done")).toBeVisible({ timeout: 60_000 });
    const documentRow = page.locator(`[data-testid='document-row'][data-name='${fileName}']`);
    await expect(documentRow).toBeVisible({ timeout: 20_000 });
    await expectFitsPhone(page, "Documente, lista");
    await expectRowCards(page.getByTestId("document-row"), "Documente, lista");
    await expectValueOnScreen(documentRow.getByText(fileName, { exact: true }), "documentul");
    await page.screenshot({ path: testInfo.outputPath("phone-forms-documents.png") });

    // (e) Proiect nou, pentru clientul de mai sus.
    const projectName = `TEST Șantier Telefon ${RUN}`;
    await page.goto("/proiecte");
    await page.getByTestId("project-new").click();
    await expect(page.getByTestId("project-form")).toBeVisible();
    await expectFitsPhone(page, "Proiect nou", "[data-testid='project-form']");
    await page.screenshot({ path: testInfo.outputPath("phone-forms-project-form.png") });
    await page.getByTestId("field-project-client").selectOption({ label: clientName });
    await page.getByTestId("field-project-name").fill(projectName);
    await page.getByTestId("field-project-start").fill("2026-10-01");
    await page.getByTestId("field-project-budget").fill("125000");
    await page.getByTestId("project-submit").click();

    // (f) Fisa proiectului, apoi Modifică cu bifa Activ, apoi schimbarea salvata.
    await expect(page.getByTestId("project-detail")).toBeVisible({ timeout: 25_000 });
    await expect(page.locator("main h1")).toHaveText(projectName);
    await expectFitsPhone(page, "fisa proiectului");
    await page.screenshot({ path: testInfo.outputPath("phone-forms-project-detail.png") });

    const address = `Strada Telefonului ${RUN}, Chișinău`;
    await page.getByTestId("project-edit").click();
    await expect(page.getByTestId("project-form")).toBeVisible();
    await expect(page.getByTestId("field-project-active")).toBeVisible();
    await expectFitsPhone(page, "Modifică proiectul", "[data-testid='project-form']");
    await page.getByTestId("field-project-address").fill(address);
    await page.getByTestId("project-submit").click();
    await expect(page.getByTestId("project-form")).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByTestId("project-detail")).toContainText(address, { timeout: 20_000 });
    await expectFitsPhone(page, "fisa proiectului dupa Modifică");
  });

  test("(c) Lead nou: pe toata latimea, iar leadul salvat are fisa", async ({ page }, testInfo) => {
    await signInOnPhone(page);
    const leadName = `TEST Lead Telefon ${RUN}`;

    await page.goto("/clienti?vedere=leaduri");
    await page.getByTestId("leaduri-new").click();
    await expect(page.getByTestId("leaduri-form")).toBeVisible();
    await expectFitsPhone(page, "Lead nou", "[data-testid='leaduri-form']");
    await page.screenshot({ path: testInfo.outputPath("phone-forms-lead-form.png") });
    await page.getByTestId("field-leaduri-name").fill(leadName);
    await page.getByTestId("field-leaduri-stage").selectOption("follow_up");
    await page.getByTestId("field-leaduri-follow-up").fill("2026-12-01");
    await page.getByTestId("leaduri-submit").click();

    await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("client-detail")).toContainText(leadName);
    await expectFitsPhone(page, "fisa leadului");
  });

  test("(f) fisa proiectului semanat: bonurile de pe fila Consum sunt carduri", async ({ page }, testInfo) => {
    await signInOnPhone(page);
    await page.goto(`/proiecte/${SEED_CONTRACT_PROJECT_ID}`);
    await expect(page.getByTestId("project-detail")).toBeVisible({ timeout: 20_000 });
    const rows = page.getByTestId("issue-row");
    await expect.poll(() => rows.count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);

    await expectFitsPhone(page, "fisa proiectului semanat");
    await expectRowCards(rows, "fisa proiectului semanat, Consum");
    await expectValueOnScreen(
      page.locator(`[data-testid='issue-row'][data-reference='${SEED_OUTBOUND_REFERENCE}']`),
      "bonul semanat",
    );
    await page.screenshot({ path: testInfo.outputPath("phone-forms-project-consum.png") });
  });

  test("(g) fisa comenzii manuale: campurile unul sub altul, pozitia este un card, comanda se confirma", async ({
    page,
  }, testInfo) => {
    await signInOnPhone(page);
    await page.goto("/adauga-manual");
    await expect(page.getByTestId("inbound-form")).toBeVisible({ timeout: 20_000 });
    await expectFitsPhone(page, "comanda manuala, goala");

    await page.getByTestId("order-supplier").fill(`TEST Furnizor Telefon ${RUN}`);
    await page.getByTestId("order-expected-at").fill("2026-12-01");
    const product = page.getByTestId("line-product-0");
    const option = product.locator("option").filter({ hasText: "TEST-NEC-01" });
    await product.selectOption((await option.getAttribute("value")) ?? "");
    await page.getByTestId("line-quantity-0").fill("3");
    await page.getByTestId("line-price-0").fill("5");
    await page.getByTestId("order-add-line").click();

    await expectFitsPhone(page, "comanda manuala, completata");
    await expectRowCards(page.getByTestId("inbound-form").locator("tbody tr"), "comanda manuala, pozitiile");
    // Campurile de detalii stau unul sub altul: Monedă incepe sub Furnizor.
    const supplier = await page.getByTestId("order-supplier").boundingBox();
    const currency = await page.getByTestId("order-currency").boundingBox();
    expect(currency!.y, "Monedă nu sta sub Furnizor").toBeGreaterThanOrEqual(supplier!.y + supplier!.height);
    await page.locator("main").evaluate((main) => main.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath("phone-forms-order-form.png") });

    await page.getByTestId("order-confirm").click();
    await expect(page.getByTestId("order-created")).toBeVisible({ timeout: 20_000 });
    const reference = (await page.getByTestId("created-reference").innerText()).trim();
    expect(reference).not.toBe("");
    await expectFitsPhone(page, "comanda manuala, confirmata");
    await expectValueOnScreen(page.getByTestId("created-reference"), "referinta comenzii");
  });

  test("(h) panourile comenzilor de intrare si de iesire: pe toata latimea, pozitiile sunt carduri", async ({
    page,
  }, testInfo) => {
    await signInOnPhone(page);
    await page.goto("/comenzi");

    await page.locator(`[data-testid='inbound-item'][data-reference='${SEED_INBOUND_REFERENCE}']`).click();
    const inbound = page.getByTestId("inbound-panel");
    await expect(inbound).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => page.getByTestId("inbound-line").count()).toBeGreaterThanOrEqual(1);
    await expectFitsPhone(page, "panoul intrarii", "[data-testid='inbound-panel']");
    await expectRowCards(page.getByTestId("inbound-line"), "panoul intrarii, pozitiile");
    await page.screenshot({ path: testInfo.outputPath("phone-forms-inbound-panel.png") });
    await inbound.getByRole("button", { name: "Închide", exact: true }).click();
    await expect(inbound).toHaveCount(0);

    await page.locator(`[data-testid='outbound-item'][data-reference='${SEED_OUTBOUND_REFERENCE}']`).click();
    const outbound = page.getByTestId("outbound-panel");
    await expect(outbound).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => page.getByTestId("outbound-line").count()).toBeGreaterThanOrEqual(1);
    await expectFitsPhone(page, "panoul iesirii", "[data-testid='outbound-panel']");
    await expectRowCards(page.getByTestId("outbound-line"), "panoul iesirii, pozitiile");
    await expectValueOnScreen(outbound.getByTestId("ship-issue"), "butonul de expediere");
    await page.screenshot({ path: testInfo.outputPath("phone-forms-outbound-panel.png") });
  });

  test("(4) desktop neschimbat: la 1440px panourile si formularele au latimile de azi, iar tabelele au antet", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signIn(page, ownerAccount());

    const widthOf = (locator: Locator) => locator.evaluate((el) => el.getBoundingClientRect().width);

    await page.goto(`/inventar?produs=${SEED_PRODUCT_SKU}`);
    const productPanel = page.getByTestId("product-panel");
    await expect(productPanel).toBeVisible({ timeout: 20_000 });
    expect(await widthOf(productPanel)).toBe(620);
    await expect.poll(() => productPanel.locator("tbody tr").count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
    await expect(productPanel.locator("thead").first()).toBeVisible();
    expect(await productPanel.locator("tbody tr").first().evaluate((tr) => getComputedStyle(tr).display)).toBe(
      "table-row",
    );

    await page.goto("/comenzi");
    await page.locator(`[data-testid='inbound-item'][data-reference='${SEED_INBOUND_REFERENCE}']`).click();
    const inbound = page.getByTestId("inbound-panel");
    await expect(inbound).toBeVisible({ timeout: 20_000 });
    expect(await widthOf(inbound)).toBe(640);
    await expect(inbound.locator("thead").first()).toBeVisible();

    await page.goto("/clienti");
    await page.getByTestId("client-new").click();
    expect(await widthOf(page.getByTestId("client-form"))).toBe(520);

    await page.goto("/proiecte");
    await page.getByTestId("project-new").click();
    expect(await widthOf(page.getByTestId("project-form"))).toBe(560);

    await page.goto("/adauga-manual");
    await expect(page.getByTestId("inbound-form")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("inbound-form").locator("thead")).toBeVisible();
    const supplier = await page.getByTestId("order-supplier").boundingBox();
    const currency = await page.getByTestId("order-currency").boundingBox();
    expect(Math.abs(currency!.y - supplier!.y), "Furnizor si Monedă nu mai stau alaturi").toBeLessThanOrEqual(1);
  });
});
