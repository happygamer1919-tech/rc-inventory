import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { MAKE_CALLBACK_SECRET, firedFor } from "./support/make";

// extraction-units-and-zero-line.spec - linia de acceptanta a cardului P3-102,
// constatarea F23 a lui Ivan, tinta G59.
//
// CE S-A VAZUT IN PRODUCTIE PE 2026-09-24, pe confirmarea unei comenzi MPC:
//   - UM `set` (Șurub autoforant, cutie 1000 buc) si `litri` (Diluant nitro) nu
//     se mapeaza, deci lista de selectie arata "Alege unitatea" cu "Pe document:
//     set" dedesubt, si operatorul raspunde de mana la o intrebare pe care
//     documentul o lamureste;
//   - pozitia 5 sosise cu cantitatea 0 ("stoc epuizat"), nu spunea nimic pe ecran,
//     si numaratoarea de la capat nu se potrivea cu documentul fara niciun motiv
//     vizibil.
//
// CE DOVEDESTE FIECARE CAZ, si de ce cazul 1 nu este suficient singur:
//   1. `set` si `litri` se mapeaza, linia cu 0 este grizata si isi spune motivul,
//      confirmarea o lasa afara, iar comanda creata nu are pozitie pentru ea.
//   2. o cantitate peste zero tastata in acea casuta o include inapoi, prin
//      filtrul care exista deja si fara nicio a doua regula la confirmare.
//   3. un cuvant pe care harta NU il stie ramane pe "Alege unitatea", isi arata
//      cuvantul, primeste un raspuns de la operator, si raspunsul acela este
//      precompletat pe urmatorul document al ACELUIASI furnizor.
//   4. nicio cantitate nu s-a schimbat acolo unde s-a aplicat un sinonim. Un set
//      ramane un set si nu devine o mie de bucati.
//   5. fisa se poarta la 390x844.
//
// EXCLUDEREA NU ESTE NOUA SI CAZUL 1 NU PRETINDE CA ESTE. confirmExtractionDraft
// sare peste orice linie a carei cantitate nu este peste zero de cand exista.
// Ce lipsea era ca cineva sa AFLE. Cazul 1 cere amandoua in acelasi timp: ca
// propozitia sa fie pe ecran SI ca pozitia sa lipseasca din comanda.
//
// ACELASI TRANSPORT MOCAT CA IN review.spec: serverul fals de Make asculta pe
// 127.0.0.1 si aplicatia il vede prin MAKE_WEBHOOK_URL; callback-ul il trimite
// specul, direct catre endpointul aplicatiei, ca fiecare caz sa controleze exact
// payload-ul care ajunge la receptor.
//
// FIECARE CAZ ARE CIFRA LUI IN NUMELE FURNIZORULUI SI IN NUMELE PRODUSELOR.
// Unic pe RULARE nu ajunge: tabela de memorie a unitatilor se cauta pe cheia
// furnizorului peste tot tabelul, si datele de test nu se sterg niciodata aici,
// deci doua cazuri ale ACELEIASI rulari care ar imparti un furnizor ar vedea
// unul raspunsurile celuilalt. Este clasa numita in KNOWN-FAILURES dupa
// importul de leaduri din P3-101.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const CALLBACK = "/api/extraction/callback";
const UPLOAD = "/incarca-comanda";
const MACHINE_RETRIES = 2;

/** O categorie din cele semanate de migratia 0007: un produs nou are nevoie de
 *  una, si alegerea ei nu este subiectul acestui card. */
const MAPPED_CATEGORY = "Acoperișuri și tablă";

/** Numele furnizorului cazului. Vezi antetul: cifra cazului este obligatorie. */
function supplierFor(caseDigit: number): string {
  return `TEST F23 furnizor ${RUN} c${caseDigit}`;
}

/** Numele unui produs al cazului, la fel de unic si din acelasi motiv. */
function productFor(caseDigit: number, label: string): string {
  return `TEST F23 ${label} ${RUN} c${caseDigit}`;
}

function pdfBytes(tag: string): Buffer {
  return Buffer.from(
    `%PDF-1.4\n% RC test ${tag}\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
    "utf8",
  );
}

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

  const fired = await firedFor(request, orderId);
  expect(fired).toHaveLength(1);
  expect(fired[0]!.documentFilename).toBe(filename);
  return orderId;
}

type FixtureLine = {
  product_name: string;
  quantity: number;
  /** null peste tot in acest spec: TOT ROSTUL cardului este ce se intampla cand
   *  citirea NU a mapat unitatea. unit_raw poarta cuvantul hartiei. */
  unit: string | null;
  unit_raw: string;
  unit_price: number;
  line_total: number;
};

/**
 * Un payload al carui aritmetica se inchide.
 *
 * DELIBERAT, si nu din grija de stil: pe o forma `digital` reconcilierea nu
 * refuza, dar un fixture ale carui numere nu se aduna transforma fiecare caz
 * construit pe el intr-un al doilea test de reconciliere, mai slab, care pica din
 * alt motiv decat al lui. Antetul lui review.spec descrie aceeasi capcana, pe care
 * fixture-ul de acolo o ocoleste declarandu-se digital si atat.
 */
function callbackBody(orderId: string, supplierName: string, lines: FixtureLine[]) {
  const subtotal = Number(lines.reduce((s, l) => s + l.line_total, 0).toFixed(2));
  const vatAmount = Number((subtotal * 0.2).toFixed(2));
  return {
    order_id: orderId,
    status: "extracted",
    error_code: null,
    reason: null,
    supplier_name: supplierName,
    document_source: "digital",
    order_date: "2026-09-24",
    subtotal,
    vat_amount: vatAmount,
    document_total: Number((subtotal + vatAmount).toFixed(2)),
    prices_include_vat: false,
    vat_rate: 20.0,
    currency: "MDL",
    currency_raw: "lei",
    confidence: 0.93,
    lines: lines.map((l) => ({
      product_name: l.product_name,
      quantity: l.quantity,
      unit: l.unit,
      unit_raw: l.unit_raw,
      unit_price: l.unit_price,
      line_total: l.line_total,
      currency: "MDL",
      currency_raw: "lei",
      category: null,
      category_raw: null,
      confidence: 0.9,
    })),
    _meta: {
      model: "gpt-4o-mini",
      prompt_version: "v2.0",
      page_count: 1,
      characters_extracted: 1200,
      duration_ms: 3100,
    },
  };
}

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

function draftCard(page: Page, orderId: string) {
  return page.locator(`[data-testid="draft-card"][data-order-id="${orderId}"]`);
}

async function openReview(page: Page, orderId: string) {
  const card = draftCard(page, orderId);
  await expect(card).toHaveCount(1, { timeout: 30_000 });
  await card.getByTestId("draft-review").click();
  await expect(page.getByTestId("review-form")).toBeVisible({ timeout: 15_000 });
}

function reviewLine(page: Page, index: number) {
  return page.locator(`[data-testid="review-line"][data-index="${index}"]`);
}

/** Cele trei pozitii ale documentului MPC observat, reproduse de mana.
 *
 *  NIMIC DIN PRODUCTIE NU ESTE COPIAT AICI. Formele sunt cele pe care le-a numit
 *  constatarea, cu nume de produs si furnizor inventate pentru acest caz. */
function mpcLines(caseDigit: number): FixtureLine[] {
  return [
    {
      product_name: productFor(caseDigit, "Surub autoforant"),
      quantity: 6,
      unit: null,
      unit_raw: "set",
      unit_price: 250,
      line_total: 1500,
    },
    {
      product_name: productFor(caseDigit, "Diluant nitro"),
      quantity: 12,
      unit: null,
      unit_raw: "litri",
      unit_price: 80,
      line_total: 960,
    },
    {
      product_name: productFor(caseDigit, "Vopsea email stoc epuizat"),
      quantity: 0,
      unit: null,
      unit_raw: "l",
      unit_price: 45,
      line_total: 0,
    },
  ];
}

test.describe("Unitati de pe document si linia cu cantitatea zero", () => {
  test.describe.configure({ timeout: 180_000 });

  test("1. set si litri se mapeaza, iar linia cu cantitatea 0 spune pe ecran ca nu intra in stoc", async ({
    page,
    request,
  }) => {
    const supplier = supplierFor(1);
    const lines = mpcLines(1);

    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "f23-map");
    expect((await post(request, callbackBody(orderId, supplier, lines))).status()).toBe(202);

    await page.goto(UPLOAD);
    await openReview(page, orderId);

    // --- CLAUZA 1: NICIO LISTA GOALA PE set SI PE litri ----------------------
    // Citirea a trimis unit null pe amandoua, deci ce se vede aici este harta de
    // sinonime si nimic altceva.
    await expect(page.getByTestId("review-line-unit-0")).toHaveValue("set");
    await expect(page.getByTestId("review-line-unit-raw-0")).toContainText("Pe document: set");
    await expect(page.getByTestId("review-line-unit-1")).toHaveValue("l");
    await expect(page.getByTestId("review-line-unit-raw-1")).toContainText("Pe document: litri");

    // --- CLAUZA 2: LINIA CU 0 ESTE GRIZATA SI ISI SPUNE MOTIVUL --------------
    await expect(reviewLine(page, 2)).toHaveAttribute("data-zero-excluded", "true");
    await expect(page.getByTestId("review-line-zero-2")).toHaveText("Cantitate 0: nu intră în stoc");
    // Si celelalte doua NU sunt grizate, ceea ce este jumatatea pe care o
    // aserttiune despre linia a treia singura nu o poate dovedi.
    await expect(reviewLine(page, 0)).toHaveAttribute("data-zero-excluded", "false");
    await expect(reviewLine(page, 1)).toHaveAttribute("data-zero-excluded", "false");
    await expect(page.getByTestId("review-line-zero-0")).toHaveCount(0);

    // --- CLAUZA 3: CONFIRMAREA O LASA AFARA ----------------------------------
    // Cele doua linii bune sunt produse noi, deci au nevoie de o categorie. A
    // treia NU primeste una, deliberat: confirmarea sare peste ea inainte sa
    // ajunga la verificarea categoriei, iar daca nu ar sari, refuzul ar fi chiar
    // "Alege categoria pentru produsul nou" si cazul ar pica aici.
    await page.getByTestId("review-expected-at").fill("2026-12-10");
    await page.getByTestId("review-line-category-0").selectOption({ label: MAPPED_CATEGORY });
    await page.getByTestId("review-line-category-1").selectOption({ label: MAPPED_CATEGORY });
    await page.getByTestId("review-confirm").click();

    const created = page.getByTestId("review-created");
    await expect(created).toBeVisible({ timeout: 30_000 });
    const reference = (await created.getAttribute("data-reference")) ?? "";
    expect(reference.length).toBeGreaterThan(0);

    // --- CLAUZA 4: COMANDA CREATA NU ARE POZITIE PENTRU LINIA CU 0 -----------
    await page.goto("/comenzi");
    await page.locator(`[data-testid="inbound-item"][data-reference="${reference}"]`).click();
    const inboundLines = page.getByTestId("inbound-lines");
    await expect(inboundLines).toContainText(lines[0]!.product_name, { timeout: 20_000 });
    await expect(inboundLines).toContainText(lines[1]!.product_name);
    await expect(inboundLines).not.toContainText(lines[2]!.product_name);
    await expect(page.getByTestId("inbound-line")).toHaveCount(2);
  });

  test("2. o cantitate peste zero tastata in linia cu 0 o include inapoi", async ({
    page,
    request,
  }) => {
    const supplier = supplierFor(2);
    const lines = mpcLines(2);

    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "f23-typed");
    expect((await post(request, callbackBody(orderId, supplier, lines))).status()).toBe(202);

    await page.goto(UPLOAD);
    await openReview(page, orderId);

    await expect(reviewLine(page, 2)).toHaveAttribute("data-zero-excluded", "true");

    // Se tasteaza o cantitate peste zero: grizarea si propozitia pleaca IMEDIAT,
    // pe ecran, inainte de orice salvare.
    await page.getByTestId("review-line-quantity-2").fill("3");
    await expect(reviewLine(page, 2)).toHaveAttribute("data-zero-excluded", "false");
    await expect(page.getByTestId("review-line-zero-2")).toHaveCount(0);

    // Si inapoi la zero, ca sa se vada ca nu este un drum cu sens unic.
    await page.getByTestId("review-line-quantity-2").fill("0");
    await expect(reviewLine(page, 2)).toHaveAttribute("data-zero-excluded", "true");
    await page.getByTestId("review-line-quantity-2").fill("3");
    await expect(reviewLine(page, 2)).toHaveAttribute("data-zero-excluded", "false");

    await page.getByTestId("review-expected-at").fill("2026-12-11");
    for (const index of [0, 1, 2]) {
      await page.getByTestId(`review-line-category-${index}`).selectOption({ label: MAPPED_CATEGORY });
    }
    await page.getByTestId("review-confirm").click();

    const created = page.getByTestId("review-created");
    await expect(created).toBeVisible({ timeout: 30_000 });
    const reference = (await created.getAttribute("data-reference")) ?? "";

    // TREI pozitii de data aceasta, si a treia poarta cantitatea TASTATA.
    await page.goto("/comenzi");
    await page.locator(`[data-testid="inbound-item"][data-reference="${reference}"]`).click();
    await expect(page.getByTestId("inbound-line")).toHaveCount(3, { timeout: 20_000 });
    const third = page
      .locator(`[data-testid="inbound-line"]`)
      .filter({ hasText: lines[2]!.product_name });
    await expect(third).toHaveCount(1);
    // "3 l" si nu "3": numele produsului poarta deja cifra 3, din "F23", deci o
    // aserttiune pe cifra singura ar trece fara sa citeasca nimic.
    await expect(third).toContainText("3 l");
  });

  test("3. un cuvant care nu se mapeaza se alege o data si se tine minte pentru urmatorul document al aceluiasi furnizor", async ({
    page,
    request,
  }) => {
    const supplier = supplierFor(3);
    const unmapped: FixtureLine[] = [
      {
        product_name: productFor(3, "Holsuruburi la cutie"),
        quantity: 4,
        unit: null,
        // `cutie` NU ESTE IN HARTA, deliberat: tinta G59 pomeneste cuvantul fara
        // sa il treaca printre unitatile de creat. Exact de asta este cuvantul
        // potrivit pentru acest caz.
        unit_raw: "cutie",
        unit_price: 120,
        line_total: 480,
      },
    ];

    await signIn(page, ownerAccount());

    // --- PRIMUL DOCUMENT: nu se stie, si ecranul o spune ---------------------
    const first = await uploadForExtraction(page, request, "f23-learn-1");
    expect((await post(request, callbackBody(first, supplier, unmapped))).status()).toBe(202);

    await page.goto(UPLOAD);
    await openReview(page, first);
    await expect(page.getByTestId("review-line-unit-0")).toHaveValue("");
    await expect(page.getByTestId("review-line-unit-raw-0")).toContainText("Pe document: cutie");

    // Operatorul alege o unitate care EXISTA. Nu poate crea una, si ecranul de
    // setari spune de ce: fiecare cantitate salvata este citita prin unitatea
    // produsului ei.
    await page.getByTestId("review-line-unit-0").selectOption("pcs");
    await page.getByTestId("review-expected-at").fill("2026-12-12");
    await page.getByTestId("review-line-category-0").selectOption({ label: MAPPED_CATEGORY });
    await page.getByTestId("review-confirm").click();
    await expect(page.getByTestId("review-created")).toBeVisible({ timeout: 30_000 });

    // --- AL DOILEA DOCUMENT, ACELASI FURNIZOR, ACELASI CUVANT ---------------
    const second = await uploadForExtraction(page, request, "f23-learn-2");
    expect(
      (
        await post(
          request,
          callbackBody(second, supplier, [
            { ...unmapped[0]!, product_name: productFor(3, "Holsuruburi la cutie, alt cod") },
          ]),
        )
      ).status(),
    ).toBe(202);

    await page.goto(UPLOAD);
    await openReview(page, second);

    // Raspunsul de data trecuta este precompletat, si cuvantul documentului este
    // TOT acolo: tinerea de minte nu are voie sa ascunda ce a scris furnizorul.
    await expect(page.getByTestId("review-line-unit-0")).toHaveValue("pcs");
    await expect(page.getByTestId("review-line-unit-raw-0")).toContainText("Pe document: cutie");

    // SI NU ESTE O HOTARARE. Operatorul o poate schimba, ca orice valoare extrasa.
    await page.getByTestId("review-line-unit-0").selectOption("bag");
    await expect(page.getByTestId("review-line-unit-0")).toHaveValue("bag");
  });

  test("4. niciun numar nu s-a schimbat acolo unde s-a aplicat un sinonim", async ({
    page,
    request,
  }) => {
    const supplier = supplierFor(4);
    const lines = mpcLines(4);

    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "f23-no-conversion");
    expect((await post(request, callbackBody(orderId, supplier, lines))).status()).toBe(202);

    await page.goto(UPLOAD);
    await openReview(page, orderId);

    // Cantitatile de pe ecran sunt cele de pe document, nu cele inmultite cu
    // continutul ambalajului. Documentul spune "cutie 1000 buc" in DENUMIRE, si
    // asta nu este o conversie: sunt sase seturi.
    await expect(page.getByTestId("review-line-quantity-0")).toHaveValue("6");
    await expect(page.getByTestId("review-line-quantity-1")).toHaveValue("12");

    await page.getByTestId("review-expected-at").fill("2026-12-13");
    await page.getByTestId("review-line-category-0").selectOption({ label: MAPPED_CATEGORY });
    await page.getByTestId("review-line-category-1").selectOption({ label: MAPPED_CATEGORY });
    await page.getByTestId("review-confirm").click();

    const created = page.getByTestId("review-created");
    await expect(created).toBeVisible({ timeout: 30_000 });
    const reference = (await created.getAttribute("data-reference")) ?? "";

    await page.goto("/comenzi");
    await page.locator(`[data-testid="inbound-item"][data-reference="${reference}"]`).click();

    const setLine = page
      .locator(`[data-testid="inbound-line"]`)
      .filter({ hasText: lines[0]!.product_name });
    await expect(setLine).toHaveCount(1, { timeout: 20_000 });
    // Sase seturi. NU sase mii de bucati, care este exact ce ar scrie aici daca
    // cineva ar fi invatat sistemul ca un set este o mie de bucati.
    await expect(setLine).toContainText("6 set");
    await expect(setLine).not.toContainText("6000");

    const litreLine = page
      .locator(`[data-testid="inbound-line"]`)
      .filter({ hasText: lines[1]!.product_name });
    await expect(litreLine).toHaveCount(1);
    await expect(litreLine).toContainText("12 l");
    // Eticheta de langa numar VINE DE PE PRODUS, prin unitLabel(l.unit) in
    // InboundPanel, deci cele doua randuri de mai sus dovedesc in acelasi timp ca
    // unitatea salvata pe produsul nou este cea mapata si ca numarul nu s-a atins.
  });

  test("5. fisa de verificare se poarta la 390x844, cu propozitia liniei de zero pe ecran", async ({
    page,
    request,
  }) => {
    const supplier = supplierFor(5);
    const lines = mpcLines(5);

    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "f23-phone");
    expect((await post(request, callbackBody(orderId, supplier, lines))).status()).toBe(202);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(UPLOAD);
    await openReview(page, orderId);

    await expect(page.getByTestId("review-line-zero-2")).toBeVisible();
    await expect(page.getByTestId("review-line-unit-0")).toHaveValue("set");

    // DERULARE LATERALA: documentul nu are voie sa fie mai lat decat ecranul.
    // Aceeasi masura pe care o face phone-forms.spec, scrisa aici ca acest caz sa
    // se poata citi singur.
    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth };
    });
    expect(overflow.scrollWidth, "derulare laterala pe fisa de verificare la 390px").toBeLessThanOrEqual(
      overflow.clientWidth + 1,
    );
  });
});
