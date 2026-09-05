import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { managerAccount, ownerAccount } from "./support/accounts";
import { signIn, signOut } from "./support/auth";
import { MAKE_CALLBACK_SECRET, firedFor } from "./support/make";
import {
  ACTION_ENTER_BY_HAND,
  ACTION_RESCAN,
  EXTRACTION_ERROR_CODES,
  EXTRACTION_ERROR_LABEL,
  SCAN_LINE_NOTICE,
} from "@/lib/data/extraction-types";

// review.spec - linia de acceptanta a cardului P2-09.
//
// Sapte cazuri, unul per clauza, in ordinea in care cardul le enumera.
//
// ACELASI TRANSPORT MOCAT CA LA P2-08a. Serverul fals de Make asculta pe
// 127.0.0.1 si aplicatia il vede prin MAKE_WEBHOOK_URL: ea face fetch-ul real
// si nu stie ca ruleaza un test. Callback-ul il trimite specul, direct catre
// endpointul aplicatiei, ca fiecare caz sa controleze exact payload-ul care
// ajunge la receptor.
//
// CIORNELE INTRA PRIN BANDA DE EXTRAGERE, nu prin banda de atasare a lui
// P2-08a: fisierul se incarca fara ca vreo comanda sa existe, order_id se
// minteste atunci, si comanda se naste abia la confirmare. Aceea este exact
// ambiguitatea pe care migratia 0008 a lasat-o acestui card si pe care 0010 o
// inchide.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const CALLBACK = "/api/extraction/callback";
const UPLOAD = "/incarca-comanda";

/** Un PDF minim, valid cat ii trebuie bucketului: contine antetul si un EOF.
 *  Nu se citeste niciodata, fiindca extragerea este mocata la transport. */
function pdfBytes(tag: string): Buffer {
  return Buffer.from(
    `%PDF-1.4\n% RC test ${tag}\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
    "utf8",
  );
}

/**
 * Incarca un document pe banda de extragere si intoarce order_id-ul mintit.
 *
 * Id-ul se citeste de la serverul fals, dupa numele de fisier, care este unic
 * pe caz. Ecranul il poarta si el, dar citirea de la transport dovedeste in
 * acelasi timp CA S-A TRIMIS, ceea ce randul din lista singur nu spune.
 */
async function uploadForExtraction(
  page: Page,
  request: APIRequestContext,
  tag: string,
): Promise<string> {
  const filename = `TEST-${tag}-${RUN}.pdf`;
  await page.goto(UPLOAD);
  await page.getByTestId("extraction-input").setInputFiles({
    name: filename,
    mimeType: "application/pdf",
    buffer: pdfBytes(tag),
  });

  const card = page.locator(`[data-testid="draft-card"]`).filter({ hasText: filename });
  await expect(card).toHaveCount(1, { timeout: 30_000 });

  const orderId = (await card.getAttribute("data-order-id")) ?? "";
  expect(orderId).toMatch(/^[0-9a-f-]{36}$/i);

  // Trimiterea chiar a plecat catre transport, cu acest order_id.
  const fired = await firedFor(request, orderId);
  expect(fired).toHaveLength(1);
  expect(fired[0]!.documentFilename).toBe(filename);
  return orderId;
}

/** O categorie din cele 18 semanate de migratia 0007, folosita ca sa se vada
 *  diferenta dintre o categorie MAPATA si una care nu exista in vocabular. */
const MAPPED_CATEGORY = "Acoperișuri și tablă";

/** Un produs asezat in catalog prin ecranul real, nu prin baza de date. */
async function createCatalogProduct(
  page: Page,
  p: { sku: string; name: string; category: string; unit: string; unitValue: string },
) {
  await page.goto("/inventar");
  await page.getByTestId("product-new").click();
  await page.getByTestId("field-sku").fill(p.sku);
  await page.getByTestId("field-name").fill(p.name);
  await page.getByTestId("field-category").selectOption({ label: p.category });
  await page.getByTestId("field-unit").selectOption(p.unit);
  await page.getByTestId("field-unit-value").fill(p.unitValue);
  await page.getByTestId("form-submit").click();
  await expect(page.locator(`[data-testid="product-row"][data-sku="${p.sku}"]`)).toHaveCount(1, {
    timeout: 20_000,
  });
}

/** O linie de callback, cu numele dat si restul de pe documentul Bilka. */
function extractedLine(productName: string, over: Record<string, unknown> = {}) {
  return {
    product_name: productName,
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
    ...over,
  };
}

function callbackBody(orderId: string, over: Record<string, unknown> = {}) {
  return {
    order_id: orderId,
    status: "extracted",
    error_code: null,
    reason: null,
    supplier_name: "Bilka Steel SRL",
    // EXT-16. THIS SHARED FIXTURE DECLARES ITSELF DIGITAL, AND THAT IS A
    // DELIBERATE NARROWING RATHER THAN A CONVENIENCE.
    //
    // Its numbers do not reconcile and never did: subtotal is 18450.00 while the
    // single line carries line_total 18452.36, a difference of 2.36 against a
    // one-line tolerance of 0.05. Nobody noticed because until EXT-16 nothing
    // compared them. EXT-15 then made an ABSENT document_source read as `scan`,
    // so every test built on this body became a scan-sourced payload that
    // EXT-16 correctly refuses.
    //
    // The tests built on it are about STORAGE, IDEMPOTENCY, NULL HANDLING and
    // the review screen. Declaring `digital` keeps them about those things
    // instead of quietly turning each one into a second, weaker reconciliation
    // test that would fail for a reason it never meant to exercise.
    //
    // THE SCAN PATH IS NOT LOSING COVERAGE. It has its own cases: EXT-15's three
    // source cases, and EXT-16's cases 12 to 15 built on Andre's real Matnord
    // numbers. Those are the ones that should break when reconciliation breaks.
    //
    // Cases 3 and 8 could not have been rescued by fixing the arithmetic anyway:
    // 3 replaces the lines with ones carrying NO line_total, and 8 nulls every
    // document field. Under EXT-16 a scan-sourced payload in either state is
    // refused, correctly, so the only honest way to keep them testing what they
    // test is to say they are not scans.
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
        product_name: `Tigla metalica Bilka Classic 0.45mm visiniu ${RUN}`,
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
    ...over,
  };
}

/** Cate reincercari are voie o cerere de MASINA pe o eroare de retea.
 *
 *  NU ESTE O REINCERCARE DE TEST, si distinctia este toata poanta.
 *  playwright.config.ts pastreaza retries: 0 fiindca o reincercare de test
 *  ascunde o competitie intre cereri, iar o competitie intr-un sistem de
 *  stocuri este un numar gresit intr-un depozit.
 *
 *  maxRetries reincearca EXCLUSIV ECONNRESET, la nivel de socket, si niciodata
 *  in functie de codul de raspuns: un 200 acolo unde se astepta 401 pica exact
 *  ca inainte. Ce acopera este singurul lucru pe care l-a produs: serverul de
 *  dezvoltare inchide un socket keep-alive inactiv exact cand clientul scrie pe
 *  el, ceea ce a picat cazul 4 in rularea 33060949565 cu "read ECONNRESET"
 *  inainte ca vreo aserttiune sa fi rulat. Un client de masina adevarat, ca
 *  Make, deschide o conexiune noua pentru fiecare livrare; specul se poarta la
 *  fel in loc sa fie pedepsit pentru ca isi refoloseste socketul. */
const MACHINE_RETRIES = 2;

function post(request: APIRequestContext, body: unknown) {
  return request.post(CALLBACK, {
    headers: {
      "Content-Type": "application/json",
      "x-rc-callback-secret": MAKE_CALLBACK_SECRET,
    },
    data: body,
    maxRetries: MACHINE_RETRIES,
  });
}

/** Ciorna citita pe drumul masinii, cu acelasi antet secret ca scrierea. */
async function draftState(request: APIRequestContext, orderId: string) {
  const r = await request.get(`${CALLBACK}?order_id=${orderId}`, {
    headers: { "x-rc-callback-secret": MAKE_CALLBACK_SECRET },
    maxRetries: MACHINE_RETRIES,
  });
  return r.ok() ? await r.json() : null;
}

function draftCard(page: Page, orderId: string) {
  return page.locator(`[data-testid="draft-card"][data-order-id="${orderId}"]`);
}

/** Deschide fisa de verificare a unei ciorne aflate in lista. */
async function openReview(page: Page, orderId: string) {
  const card = draftCard(page, orderId);
  await expect(card).toHaveCount(1, { timeout: 30_000 });
  await card.getByTestId("draft-review").click();
  await expect(page.getByTestId("review-form")).toBeVisible({ timeout: 15_000 });
}

test.describe("Verificare si confirmare extragere", () => {
  test.describe.configure({ timeout: 180_000 });

  test("1. ciorna umple fisa, si valoarea editata este cea salvata", async ({ page, request }) => {
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "fill");

    expect((await post(request, callbackBody(orderId))).status()).toBe(202);

    await page.goto(UPLOAD);
    await openReview(page, orderId);

    // CLAUZA 1a: fiecare camp extras ajunge pe ecran.
    await expect(page.getByTestId("review-supplier")).toHaveValue("Bilka Steel SRL");
    await expect(page.getByTestId("review-currency")).toHaveValue("MDL");
    await expect(page.getByTestId("review-ordered-at")).toHaveValue("2026-08-14");
    await expect(page.getByTestId("review-line-name-0")).toHaveValue(
      `Tigla metalica Bilka Classic 0.45mm visiniu ${RUN}`,
    );
    await expect(page.getByTestId("review-line-quantity-0")).toHaveValue("240.5");
    await expect(page.getByTestId("review-line-price-0")).toHaveValue("76.72");

    // CLAUZA 1b: operatorul schimba doua valori, si ele sunt cele salvate.
    await page.getByTestId("review-supplier").fill(`Furnizor editat ${RUN}`);
    await page.getByTestId("review-line-quantity-0").fill("11");
    await page.getByTestId("review-expected-at").fill("2026-12-01");
    // Linia nu s-a potrivit cu niciun produs din catalog, deci devine un produs
    // marcat, iar categoria unui produs nou se alege: nu se ghiceste. Clauza 3
    // dovedeste refuzul; aici este doar drumul normal al operatorului.
    await page.getByTestId("review-line-category-0").selectOption({ label: MAPPED_CATEGORY });
    await page.getByTestId("review-confirm").click();

    const created = page.getByTestId("review-created");
    await expect(created).toBeVisible({ timeout: 30_000 });
    const reference = (await created.getAttribute("data-reference")) ?? "";
    expect(reference.length).toBeGreaterThan(0);

    await page.goto("/comenzi");
    const row = page.locator(`[data-testid="inbound-item"][data-reference="${reference}"]`);
    await expect(row).toHaveCount(1, { timeout: 20_000 });
    // Furnizorul salvat este cel de pe ecran la confirmare, nu cel extras.
    await expect(row).toContainText(`Furnizor editat ${RUN}`);
    await expect(row).not.toContainText("Bilka Steel SRL");
  });

  test("2. confirmarea creeaza comanda reala si consuma ciorna", async ({ page, request }) => {
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "confirm");

    expect((await post(request, callbackBody(orderId))).status()).toBe(202);

    await page.goto(UPLOAD);
    await openReview(page, orderId);
    await page.getByTestId("review-expected-at").fill("2026-12-02");
    await page.getByTestId("review-line-quantity-0").fill("7");
    await page.getByTestId("review-line-category-0").selectOption({ label: MAPPED_CATEGORY });
    await page.getByTestId("review-confirm").click();

    const created = page.getByTestId("review-created");
    await expect(created).toBeVisible({ timeout: 30_000 });
    const reference = (await created.getAttribute("data-reference")) ?? "";

    // CRIT-16. CONFIRMAREA RAMANE PE ECRAN DUPA CE CIORNA A DISPARUT DIN LISTA,
    // si aceste doua randuri trebuie citite impreuna: ciorna consumata iese din
    // lista la reimprospatarea care urmeaza confirmarii, iar mesajul de reusita
    // nu are voie sa plece cu ea. Cand statea inauntrul fisei ciornei, pleca, si
    // testul trecea sau pica dupa care ajungea prima. Aici se cere explicit ca
    // amandoua sa fie adevarate in acelasi timp, deci norocul nu mai poate trece.
    await expect(draftCard(page, orderId)).toHaveCount(0, { timeout: 30_000 });
    await expect(created).toBeVisible();

    // Comanda exista, cu pozitia revizuita.
    await page.goto("/comenzi");
    const row = page.locator(`[data-testid="inbound-item"][data-reference="${reference}"]`);
    await expect(row).toHaveCount(1, { timeout: 20_000 });

    // CIORNA ESTE CONSUMATA: iese din lista de verificat si poarta comanda in
    // care s-a transformat. Consumata, nu stearsa: _meta ramane citibil, ceea
    // ce este tot rostul lui, si nimic nu este lasat in urma.
    await page.goto(UPLOAD);
    await expect(draftCard(page, orderId)).toHaveCount(0, { timeout: 20_000 });

    const d = await draftState(request, orderId);
    expect(d).not.toBeNull();
    expect(d.confirmed_inbound_order_id).not.toBeNull();
    expect(d.confirmed_at).not.toBeNull();
    expect(d.meta?.prompt_version).toBe("v2.0");
  });

  test("3. un nume necunoscut creeaza un produs marcat, nu o potrivire aproximativa", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());

    // UN SKU DELIBERAT ASEMANATOR, ASEZAT IN CATALOG INAINTE DE EXTRAGERE.
    //
    // Fara el, "nu s-a lipit pe un SKU asemanator" ar fi o afirmatie despre un
    // catalog care nu continea nimic asemanator, adica despre nimic. Randul de
    // mai jos poarta acelasi nume ca linia extrasa plus un sufix, ceea ce este
    // exact forma pe care o potrivire aproximativa ar inghiti-o: acelasi
    // furnizor, acelasi produs, alta varianta.
    // Numele este propriu acestui caz, nu cel implicit din callbackBody: cazurile
    // 1 si 2 confirma pe numele implicit si lasa in urma produse marcate purtand
    // exact acel nume, iar "exista un singur produs cu numele acesta" ar deveni
    // fals din motive care nu au nimic de-a face cu clauza 3.
    const extracted = `Produs necunoscut extras ${RUN}`;
    const similarSku = `TEST-SIM-${RUN}`;
    await createCatalogProduct(page, {
      sku: similarSku,
      name: `${extracted} PLUS`,
      category: MAPPED_CATEGORY,
      unit: "m2",
      unitValue: "10",
    });

    const orderId = await uploadForExtraction(page, request, "flag");

    // --- CALLBACK A: o categorie care NU este in vocabularul controlat -------
    //
    // Contract 4.4: category se valideaza fata de randurile din categories, si
    // ce nu se mapeaza ramane null. category_raw pastreaza cuvintele
    // documentului, deci nu se pierde nimic in afara de o pretentie.
    expect(
      (
        await post(
          request,
          callbackBody(orderId, {
            lines: [extractedLine(extracted, { category: "Categorie inventata de model" })],
          }),
        )
      ).status(),
    ).toBe(202);

    const unmapped = await draftState(request, orderId);
    expect(unmapped.lines).toHaveLength(1);
    // NU S-A GHICIT NIMIC: null, si cuvintele documentului intacte.
    expect(unmapped.lines[0].category).toBeNull();
    expect(unmapped.lines[0].category_raw).toBe("Invelitori");

    await page.goto(UPLOAD);
    await openReview(page, orderId);

    // NIMIC NU S-A LIPIT SINGUR PE SKU-UL ASEMANATOR: selectorul de produs este
    // gol, si asta este ce face din linie un produs marcat la confirmare.
    await expect(page.getByTestId("review-line-product-0")).toHaveValue("");
    // Nici categoria nu s-a ghicit, si documentul isi arata cuvintele.
    await expect(page.getByTestId("review-line-category-0")).toHaveValue("");
    await expect(page.getByTestId("review-line-category-raw-0")).toContainText("Invelitori");
    // Unitatea S-A mapat, deci ea este precompletata: mapat si ghicit nu sunt
    // acelasi lucru, si diferenta se vede pe ecran.
    await expect(page.getByTestId("review-line-unit-0")).toHaveValue("m2");
    await expect(page.getByTestId("review-line-unit-raw-0")).toContainText("mp");

    // Si confirmarea REFUZA pana cand categoria este aleasa de om.
    await page.getByTestId("review-expected-at").fill("2026-12-03");
    await page.getByTestId("review-confirm").click();
    await expect(page.getByTestId("review-error")).toContainText("Alege categoria");

    // --- CALLBACK B: aceeasi extragere, cu o categorie din cele 18 ----------
    expect(
      (
        await post(
          request,
          callbackBody(orderId, {
            lines: [extractedLine(extracted, { category: MAPPED_CATEGORY })],
          }),
        )
      ).status(),
    ).toBe(200);

    await page.goto(UPLOAD);
    await openReview(page, orderId);

    // De data aceasta categoria ESTE precompletata, fiindca a fost mapata.
    await expect(page.getByTestId("review-line-category-0")).not.toHaveValue("");
    // textContent si nu innerText: o optiune dintr-un select inchis nu este
    // randata, iar innerText pe un element neradat este definit prin cadere
    // inapoi la textContent. Cerem direct ce vrem.
    expect(
      (
        (await page
          .getByTestId("review-line-category-0")
          .locator("option:checked")
          .textContent()) ?? ""
      ).trim(),
    ).toBe(MAPPED_CATEGORY);

    await page.getByTestId("review-expected-at").fill("2026-12-03");
    await page.getByTestId("review-confirm").click();
    const created = page.getByTestId("review-created");
    await expect(created).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("review-flagged")).toContainText("marcat");
    const reference = (await created.getAttribute("data-reference")) ?? "";

    // Produsul exista in catalog, cu numele de pe document, VERBATIM, si cu
    // needs_review pus.
    await page.goto("/inventar");
    const product = page.locator(`[data-testid="product-row"][data-name="${extracted}"]`);
    await expect(product).toHaveCount(1, { timeout: 20_000 });
    await expect(product).toHaveAttribute("data-needs-review", "true");
    await expect(product).toContainText("De verificat");

    // SI PRODUSUL ASEMANATOR A RAMAS EXACT CUM ERA. Nu a primit linia, nu a
    // fost marcat, nu a fost atins. Aceasta este jumatatea pe care un catalog
    // gol nu o poate dovedi.
    const similar = page.locator(`[data-testid="product-row"][data-sku="${similarSku}"]`);
    await expect(similar).toHaveCount(1);
    await expect(similar).toHaveAttribute("data-needs-review", "false");

    // Iar comanda creata poarta produsul NOU, nu pe cel asemanator.
    await page.goto("/comenzi");
    await page.locator(`[data-testid="inbound-item"][data-reference="${reference}"]`).click();
    const lines = page.getByTestId("inbound-lines");
    await expect(lines).toContainText(extracted, { timeout: 20_000 });
    await expect(lines).not.toContainText(similarSku);
  });

  test("4. un document failed este vizibil, cu motivul si codul in romana", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "failed");

    const reason = `Scanarea nu are strat de text ${RUN}`;
    expect(
      (
        await post(
          request,
          callbackBody(orderId, {
            status: "failed",
            error_code: "unreadable_document",
            reason,
            lines: [],
          }),
        )
      ).status(),
    ).toBe(202);

    await page.goto(UPLOAD);
    const card = draftCard(page, orderId);
    await expect(card).toHaveCount(1, { timeout: 30_000 });

    // O STARE CARE NU ESTE "IN ASTEPTARE". Un esec pe care operatorul nu il
    // vede este un document care pare ca se proceseaza la nesfarsit.
    await expect(card).toHaveAttribute("data-status", "failed");
    await expect(card).toContainText("Eșuat");
    await expect(card.getByTestId("draft-reason")).toHaveText(reason);
    await expect(card.getByTestId("draft-error-sentence")).toHaveText(
      EXTRACTION_ERROR_LABEL.unreadable_document,
    );
    // Tokenul brut NU ajunge pe ecran.
    await expect(card).not.toContainText("unreadable_document");
    // Si exista prin ce sa fie retrimis.
    await expect(card.getByTestId("draft-refire")).toBeVisible();
  });

  test("5. un document partial pastreaza liniile citite si isi arata motivul", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "partial");

    const reason = `O pozitie din zece nu a putut fi citita ${RUN}`;
    expect(
      (
        await post(
          request,
          callbackBody(orderId, {
            status: "partial",
            error_code: "extraction_failed",
            reason,
          }),
        )
      ).status(),
    ).toBe(202);

    await page.goto(UPLOAD);
    const card = draftCard(page, orderId);
    await expect(card).toHaveCount(1, { timeout: 30_000 });
    await expect(card).toHaveAttribute("data-status", "partial");
    await expect(card).toContainText("Parțial");
    await expect(card.getByTestId("draft-reason")).toHaveText(reason);
    await expect(card.getByTestId("draft-error-sentence")).toHaveText(
      EXTRACTION_ERROR_LABEL.extraction_failed,
    );
    await expect(card).not.toContainText("extraction_failed");

    // LINIILE CARE AU FOST CITITE SUNT PASTRATE. Numarul supravietuitor este
    // strict mai mare ca zero, si asta este toata diferenta fata de failed.
    const kept = Number((await card.getAttribute("data-lines")) ?? "0");
    expect(kept).toBeGreaterThan(0);
    await expect(card.getByTestId("draft-kept-lines")).toContainText(String(kept));

    // Si sunt in fisa, gata de confirmat, nu doar numarate.
    await openReview(page, orderId);
    await expect(page.getByTestId("review-line")).toHaveCount(kept);
  });

  test("6. retrimiterea foloseste acelasi order_id si inlocuieste extragerea", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "refire");

    expect(
      (
        await post(
          request,
          callbackBody(orderId, {
            status: "failed",
            error_code: "url_expired",
            reason: `Legatura a expirat ${RUN}`,
            lines: [],
          }),
        )
      ).status(),
    ).toBe(202);

    await page.goto(UPLOAD);
    const card = draftCard(page, orderId);
    await expect(card).toHaveCount(1, { timeout: 30_000 });
    await card.getByTestId("draft-refire").click();

    // ACELASI order_id LA TRANSPORT. O retrimitere care ar minti un id nou ar
    // crea exact ciorna dubla pe care cheia de idempotenta exista sa o previna.
    await expect
      .poll(async () => (await firedFor(request, orderId)).length, { timeout: 30_000 })
      .toBe(2);
    const fired = await firedFor(request, orderId);
    expect(fired.every((f) => f.orderId === orderId)).toBe(true);

    // A doua extragere INLOCUIESTE prima: 200 si nu 202, o singura ciorna, si
    // liniile sunt cele noi.
    const second = await post(
      request,
      callbackBody(orderId, {
        lines: [
          {
            product_name: `Pozitie dupa retrimitere ${RUN}`,
            quantity: 4,
            unit: "pcs",
            unit_raw: "buc",
            unit_price: 10,
            line_total: 40,
            currency: "MDL",
            currency_raw: "lei",
            category: null,
            category_raw: null,
            confidence: 0.9,
          },
        ],
      }),
    );
    expect(second.status()).toBe(200);

    const d = await draftState(request, orderId);
    expect(d.status).toBe("extracted");
    expect(d.error_code).toBeNull();
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0].product_name).toBe(`Pozitie dupa retrimitere ${RUN}`);

    await page.goto(UPLOAD);
    // O singura ciorna pentru acest document, nu doua.
    await expect(draftCard(page, orderId)).toHaveCount(1, { timeout: 20_000 });
  });

  test("7. fiecare dintre cele sapte coduri are propria propozitie romaneasca", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "codes");

    // Propozitiile sunt distincte intre ele: sapte coduri, sapte texte.
    const sentences = EXTRACTION_ERROR_CODES.map((c) => EXTRACTION_ERROR_LABEL[c]);
    expect(new Set(sentences).size).toBe(EXTRACTION_ERROR_CODES.length);

    for (const code of EXTRACTION_ERROR_CODES) {
      expect(
        (
          await post(
            request,
            callbackBody(orderId, {
              status: "failed",
              error_code: code,
              reason: `Motiv pentru ${RUN}`,
              lines: [],
            }),
          )
        ).status(),
      ).toBeLessThan(300);

      await page.goto(UPLOAD);
      const card = draftCard(page, orderId);
      await expect(card).toHaveCount(1, { timeout: 30_000 });
      const sentence = card.getByTestId("draft-error-sentence");
      await expect(sentence).toHaveAttribute("data-error-code", code);
      await expect(sentence).toHaveText(EXTRACTION_ERROR_LABEL[code]);
      // TOKENUL BRUT NU AJUNGE NICIODATA PE ECRAN. Un cod ca atare este un sir
      // englezesc in interfata, ceea ce sectiunea 11 din CLAUDE.md interzice.
      await expect(card).not.toContainText(code);
    }
  });

  // ------------------------------------------------------------- P2-18 --
  //
  // Ruling R-032: operatorul poate crea un produs NUMAI prin confirmarea unei
  // extrageri, si mereu marcat. Crearea directa in catalog ramane a
  // administratorului.
  //
  // DOVADA LA NIVEL DE BAZA DE DATE este definitia politicii, scrisa verbatim in
  // docs/migrations/APPLY-LOG.md la aplicarea migratiei 0012. Cazurile de mai jos
  // dovedesc ce se vede pe ecrane: ca scrierea REUSESTE pentru operator pe drumul
  // confirmarii, si ca ecranul catalogului nu ii ofera nicio cale directa.

  test("8. operatorul confirma un document si produsul nou se creeaza marcat", async ({
    page,
    request,
  }) => {
    // OPERATOR, nu administrator. Inainte de 0012 aceasta confirmare era
    // refuzata de products_insert, care cerea is_owner(), si lane-ul se oprea
    // exact la primul produs pe care furnizorul nu il trimisese niciodata.
    await signIn(page, managerAccount());
    const orderId = await uploadForExtraction(page, request, "manager");

    const unknown = `Produs operator necunoscut ${RUN}`;
    expect(
      (
        await post(
          request,
          callbackBody(orderId, { lines: [extractedLine(unknown, { category: MAPPED_CATEGORY })] }),
        )
      ).status(),
    ).toBe(202);

    await page.goto(UPLOAD);
    await openReview(page, orderId);
    await expect(page.getByTestId("review-line-product-0")).toHaveValue("");
    await page.getByTestId("review-expected-at").fill("2026-12-05");
    await page.getByTestId("review-confirm").click();

    const created = page.getByTestId("review-created");
    await expect(created).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("review-flagged")).toContainText("marcat");

    // Produsul exista, cu numele de pe document, si MARCAT. Marcat este ce face
    // scrierea permisa: politica lasa un neadministrator sa insereze numai un
    // rand cu needs_review, deci fiecare rand pe care operatorul il aduce in
    // catalog este vizibil neterminat si asteapta administratorul.
    await page.goto("/inventar");
    const product = page.locator(`[data-testid="product-row"][data-name="${unknown}"]`);
    await expect(product).toHaveCount(1, { timeout: 20_000 });
    await expect(product).toHaveAttribute("data-needs-review", "true");
  });

  test("10. P3-33: tona si litrul sunt oferite pe linie si se salveaza pe produsul nou", async ({
    page,
    request,
  }) => {
    // P3-33. UN FURNIZOR CARE FACTUREAZA IN TONE NU AVEA O UNITATE.
    //
    // Fara `t`, cantitatea ateriza sub kg si numarul se inmultea in tacere cu o
    // mie. Acest caz dovedeste ca unitatea EXISTA pe ecran si ca AJUNGE pe
    // produs, care sunt doua lucruri diferite: un select care o ofera si o
    // scriere care o refuza ar arata identic pana la prima receptie.
    //
    // NU SE VERIFICA NICIO CONVERSIE, fiindca nu exista niciuna si nu trebuie sa
    // existe. Cardul adauga unitati; a invata sistemul ca o tona este o mie de
    // kilograme ar inlocui o inmultire invizibila cu alta.
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "tone");

    const unknown = `Produs in tone ${RUN}`;
    expect(
      (
        await post(
          request,
          callbackBody(orderId, { lines: [extractedLine(unknown, { category: MAPPED_CATEGORY })] }),
        )
      ).status(),
    ).toBe(202);

    await page.goto(UPLOAD);
    await openReview(page, orderId);

    // AMANDOUA sunt in lista, nu doar cea folosita mai jos. O lista care ofera
    // `t` si nu `l` ar trece un test care alege numai `t`.
    const unitSelect = page.getByTestId("review-line-unit-0");
    await expect(unitSelect.locator('option[value="t"]')).toHaveCount(1);
    await expect(unitSelect.locator('option[value="l"]')).toHaveCount(1);

    await unitSelect.selectOption("t");
    await page.getByTestId("review-expected-at").fill("2026-12-05");
    await page.getByTestId("review-confirm").click();
    await expect(page.getByTestId("review-created")).toBeVisible({ timeout: 30_000 });

    // Si a ajuns pe produs. Eticheta romaneasca este `t`, care este si tokenul:
    // asa se scrie pe documentul furnizorului, si acolo o citeste operatorul
    // intai.
    await page.goto("/inventar");
    const product = page.locator(`[data-testid="product-row"][data-name="${unknown}"]`);
    await expect(product).toHaveCount(1, { timeout: 20_000 });
    await expect(product).toContainText("t");
  });

  test("11. EXT-15: o scanare necitita arata antetul, spune ca nu a fost citita, si nu ofera nicio cale de acceptare", async ({
    page,
    request,
  }) => {
    // EXT-15. Cerinta tare a proprietarului: nicio cale de acceptare, niciun
    // camp de linie precompletat, si ecranul trebuie sa SPUNA ca continutul nu a
    // fost citit.
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "unread");

    expect(
      (
        await post(
          request,
          callbackBody(orderId, {
            status: "failed",
            error_code: "unreadable_document",
            reason: "Scanarea nu a putut fi citita.",
            document_source: "scan",
          }),
        )
      ).status(),
    ).toBe(202);

    const card = draftCard(page, orderId);
    await page.goto(UPLOAD);
    await expect(card).toHaveCount(1, { timeout: 30_000 });

    // NU EXISTA BUTON DE VERIFICARE PE O SCANARE NECITITA, si acela este primul
    // lucru afirmat: calea catre formular nu este ascunsa, ea nu exista.
    await expect(card.getByTestId("draft-review")).toHaveCount(0);
    await card.getByTestId("draft-header").click();

    // NU EXISTA FORMULAR. openReview() asteapta review-form, deci nu se poate
    // folosi aici, si aceea este exact afirmatia.
    await expect(page.getByTestId("review-unread-scan")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("review-form")).toHaveCount(0);

    // SPUNE CE S-A INTAMPLAT, ROMANESTE.
    await expect(page.getByTestId("review-unread-notice")).toContainText("nu a fost citit");

    // ANTETUL ESTE ACOLO, si el este rostul ecranului.
    const header = page.getByTestId("review-unread-header");
    await expect(header).toContainText("Bilka Steel SRL");
    await expect(header).toContainText("Furnizor");
    await expect(header).toContainText("Total document");

    // NICIUN CAMP DE LINIE, NICIUN BUTON DE ACCEPTARE. Fiecare enumerat separat:
    // o singura afirmatie pe un container ar trece daca oricare dintre ele ar
    // reaparea sub alt nume.
    for (const t of [
      "review-line",
      "review-confirm",
      "review-supplier",
      "review-currency",
      "review-ordered-at",
      "review-expected-at",
      "review-line-product-0",
      "review-line-quantity-0",
      "review-line-price-0",
    ]) {
      await expect(page.getByTestId(t), `EXT-15: ${t} nu are voie sa existe`).toHaveCount(0);
    }
  });

  test("12. EXT-17: liniile unei scanari care SE ADUNA CORECT sunt marcate PE LINIE ca citite dintr-o imagine", async ({
    page,
    request,
  }) => {
    // EXT-17. Marcajul nu depinde de reconciliere si acesta este cazul care o
    // spune: cifrele documentului se aduna, fisa se randeaza intreaga, si
    // fiecare linie poarta propozitia. Reconcilierea a prins esecul observat
    // NUMAI fiindca modelul citise corect totalurile si gresit liniile; un set
    // de linii fabricate care da totalul tiparit trece de aritmetica.
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "scanmark");

    // SE ADUNA CORECT. prices_include_vat false, deci tinta este subtotal, iar
    // singura linie il poarta exact. Toleranta pentru o linie este 0.05 si
    // diferenta este 0.
    expect(
      (
        await post(
          request,
          callbackBody(orderId, {
            document_source: "scan",
            subtotal: 18450.0,
            lines: [extractedLine(`Tigla scanata ${RUN}`, { line_total: 18450.0 })],
          }),
        )
      ).status(),
    ).toBe(202);

    await page.goto(UPLOAD);
    await openReview(page, orderId);

    // MARCAJUL ESTE PE LINIE. Se cere INAUNTRUL containerului liniei, si asta
    // este toata afirmatia: un banner in capul paginii ar trece o cautare pe
    // text si ar cadea aici, ceea ce este exact distinctia pe care o cere cardul.
    const line = page.locator('[data-testid="review-line"][data-index="0"]');
    await expect(line).toHaveCount(1);
    await expect(line).toHaveAttribute("data-scan-read", "true");
    const mark = line.getByTestId("review-line-scan-0");
    await expect(mark).toBeVisible();

    // TEXTUL ESTE CEL CARE SE LIVREAZA, citit din sursa si nu copiat aici. Doua
    // siruri, unul pe ecran si unul in test, pot ajunge sa nu fie de acord.
    await expect(mark).toHaveText(SCAN_LINE_NOTICE);

    // ROMANESTE, SI SPUNE CE S-A INTAMPLAT. Nu un cuvant de gravitate.
    await expect(mark).toContainText("imagine");

    // FISA ESTE INTREAGA. Marcajul informeaza, nu blocheaza: documentul se
    // aduna, deci operatorul are ce verifica si ce confirma.
    await expect(page.getByTestId("review-line-name-0")).toBeVisible();
    await expect(page.getByTestId("review-confirm")).toBeVisible();
  });

  test("13. EXT-17: aceleasi linii declarate DIGITAL nu poarta marcajul", async ({
    page,
    request,
  }) => {
    // CONTROLUL, PE ACEEASI FISA. Fara el, cazul 12 ar trece si pe un ecran care
    // marcheaza fiecare linie a fiecarui document, ceea ce nu ar spune nimic
    // despre sursa.
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "digmark");

    expect(
      (
        await post(
          request,
          callbackBody(orderId, {
            document_source: "digital",
            subtotal: 18450.0,
            lines: [extractedLine(`Tigla digitala ${RUN}`, { line_total: 18450.0 })],
          }),
        )
      ).status(),
    ).toBe(202);

    await page.goto(UPLOAD);
    await openReview(page, orderId);

    const line = page.locator('[data-testid="review-line"][data-index="0"]');
    await expect(line).toHaveCount(1);
    await expect(line).toHaveAttribute("data-scan-read", "false");
    await expect(page.getByTestId("review-line-scan-0")).toHaveCount(0);

    // SI NICAIERI PE PAGINA. Un marcaj mutat intr-un banner ar trece afirmatia
    // de mai sus si ar lasa ecranul spunand acelasi lucru gresit.
    await expect(page.getByText(SCAN_LINE_NOTICE)).toHaveCount(0);
  });

  test("14. EXT-19: cele doua coduri il trimit pe operator sa faca lucruri diferite, si niciunul nu poarta instructiunea celuilalt", async ({
    page,
    request,
  }) => {
    // EXT-19, PARTEA RAMASA. Eticheta de enum a venit cu EXT-16, prin migratia
    // 0034. Ce ramanea este jumatatea pe care o numeste chiar titlul cardului:
    // reconciliation_failed este DISTINCT de unreadable_document fiindca cele
    // doua il trimit pe om sa faca lucruri diferite.
    //
    //   unreadable_document    nu s-a putut citi     -> alta scanare
    //   reconciliation_failed  cifrele nu se aduna   -> batut de mana
    //
    // A-i spune omului pe cel gresit ii pierde timpul, si asta este tot cardul.
    await signIn(page, ownerAccount());

    // 1. LA NIVEL DE SURSA: fiecare propozitie poarta instructiunea EI si NU o
    //    poarta pe a celeilalte. Aceasta este afirmatia care cade prima daca
    //    cineva colapseaza cele doua texte intr-unul singur.
    expect(EXTRACTION_ERROR_LABEL.unreadable_document).toContain(ACTION_RESCAN);
    expect(EXTRACTION_ERROR_LABEL.unreadable_document).not.toContain(ACTION_ENTER_BY_HAND);
    expect(EXTRACTION_ERROR_LABEL.reconciliation_failed).toContain(ACTION_ENTER_BY_HAND);
    expect(EXTRACTION_ERROR_LABEL.reconciliation_failed).not.toContain(ACTION_RESCAN);
    expect(EXTRACTION_ERROR_LABEL.unreadable_document).not.toBe(
      EXTRACTION_ERROR_LABEL.reconciliation_failed,
    );
    // Si cele doua instructiuni sunt ele insele distincte, altfel afirmatiile de
    // mai sus s-ar putea satisface una pe alta fara ca ecranul sa spuna nimic
    // diferit.
    expect(ACTION_RESCAN).not.toBe(ACTION_ENTER_BY_HAND);

    // 2. PE ECRAN, care este singurul loc unde conteaza. Aceeasi ciorna, pe rand
    //    cu fiecare cod, si de fiecare data se citeste propozitia randata.
    const orderId = await uploadForExtraction(page, request, "distinct");

    const rendered: Record<string, string> = {};
    for (const [code, mine, theirs] of [
      ["unreadable_document", ACTION_RESCAN, ACTION_ENTER_BY_HAND],
      ["reconciliation_failed", ACTION_ENTER_BY_HAND, ACTION_RESCAN],
    ] as const) {
      expect(
        (
          await post(
            request,
            callbackBody(orderId, {
              status: "failed",
              error_code: code,
              reason: `Motiv ${RUN}`,
              // DIGITAL, ca liniile sa nu fie scoase de regula EXT-15 si ca
              // acest caz sa ramana despre COPIE si nu despre o alta regula.
              document_source: "digital",
              lines: [],
            }),
          )
        ).status(),
      ).toBeLessThan(300);

      await page.goto(UPLOAD);
      const card = draftCard(page, orderId);
      await expect(card).toHaveCount(1, { timeout: 30_000 });
      const sentence = card.getByTestId("draft-error-sentence");
      await expect(sentence).toHaveAttribute("data-error-code", code);
      await expect(sentence, `${code} isi poarta instructiunea`).toContainText(mine);
      await expect(sentence, `${code} NU poarta instructiunea celuilalt`).not.toContainText(theirs);
      rendered[code] = (await sentence.innerText()).trim();
    }

    // 3. SI CELE DOUA PROPOZITII RANDATE SUNT DIFERITE. Aceasta este afirmatia
    //    care cade daca cineva le colapseaza, chiar daca ambele coduri
    //    supravietuiesc in enum: cardul spune in terms ca ce conteaza este COPIA,
    //    nu eticheta.
    expect(rendered.unreadable_document).not.toBe(rendered.reconciliation_failed);
  });

  test("9. catalogul nu ii ofera operatorului nicio cale directa, iar administratorul creeaza in continuare nemarcat", async ({
    page,
  }) => {
    // Jumatatea de granita: dreptul s-a LARGIT, nu s-a mutat.
    await signIn(page, managerAccount());
    await page.goto("/inventar");
    await expect(page.getByTestId("product-count")).toBeVisible();
    await expect(page.getByTestId("product-new")).toHaveCount(0);

    // Si administratorul creeaza mai departe un produs direct, NEMARCAT, ceea ce
    // este chiar ramura pe care 0012 a pastrat-o neatinsa. Daca politica ar fi
    // fost inlocuita in loc de largita, acest rand ar fi refuzat.
    //
    // signOut si nu un goto catre /autentificare: proxy-ul redirecteaza o sesiune
    // valida de pe ecranul de autentificare inapoi la tabloul de bord, deci
    // formularul nu ar mai fi acolo de completat.
    await signOut(page);
    await signIn(page, ownerAccount());
    const sku = `TEST-OWNERDIRECT-${RUN}`;
    await createCatalogProduct(page, {
      sku,
      name: `Produs administrator direct ${RUN}`,
      category: MAPPED_CATEGORY,
      unit: "pcs",
      unitValue: "5",
    });
    const row = page.locator(`[data-testid="product-row"][data-sku="${sku}"]`);
    await expect(row).toHaveCount(1);
    await expect(row).toHaveAttribute("data-needs-review", "false");
  });
});
