import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { FIRE_FIELDS, MAKE_CALLBACK_SECRET, firedFor } from "./support/make";

// extraction.spec - linia de acceptanta a cardului P2-08a.
//
// Opt cazuri, unul per clauza, in ordinea in care cardul le enumera, PLUS trei
// adaugate de EXT-09 pentru numarul de pagini raportat de model. Cazurile 9 si
// 10 sunt cele doua pe care le cere cardul; 11 este partea din defaults care
// spune ca absenta nu este o eroare, si ea are nevoie de proba ei fiindca este o
// afirmatie despre ce NU se intampla.
//
// MAKE ESTE MOCAT LA TRANSPORT, nu printr-o ramura in aplicatie: serverul fals
// asculta pe 127.0.0.1 si aplicatia il vede prin MAKE_WEBHOOK_URL. Ea face
// fetch-ul real si nu stie ca ruleaza un test. Nimic nu pleaca de pe masina.
//
// CALLBACK-UL IL TRIMITE TESTUL, direct catre endpointul aplicatiei, nu
// serverul fals. Asa fiecare caz controleaza exact payload-ul care ajunge la
// receptor, ceea ce este tot rostul cazurilor 4 pana la 8.

const TEST_CATEGORY = "TEST-Categorie";
const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const CALLBACK = "/api/extraction/callback";

async function ensureTestCategory(page: Page) {
  await page.goto("/setari");
  const existing = page.locator(`[data-testid="category-row"][data-name="${TEST_CATEGORY}"]`);
  if ((await existing.count()) > 0) return;
  await page.getByTestId("category-name").fill(TEST_CATEGORY);
  await page.getByTestId("category-add").click();
  await expect(existing).toHaveCount(1, { timeout: 15_000 });
}

/** Creeaza o comanda cu document atasat. Intoarce order_id, care ESTE cheia de
 *  idempotenta a contractului, si referinta. */
async function orderWithDocument(page: Page, tag: string) {
  const sku = `TEST-EXT-${tag}-${RUN}`;
  await page.goto("/inventar");
  await page.getByTestId("product-new").click();
  await page.getByTestId("field-sku").fill(sku);
  await page.getByTestId("field-name").fill(`Produs extragere ${tag} ${RUN}`);
  await page.getByTestId("field-category").selectOption({ label: TEST_CATEGORY });
  await page.getByTestId("field-unit").selectOption("pcs");
  await page.getByTestId("field-unit-value").fill("10");
  await page.getByTestId("form-submit").click();
  await expect(page.locator(`[data-testid="product-row"][data-sku="${sku}"]`)).toHaveCount(1, {
    timeout: 20_000,
  });

  await page.goto("/incarca-comanda");
  await page.getByTestId("order-supplier").fill(`TEST Furnizor ${RUN}`);
  await page.getByTestId("order-expected-at").fill("2026-12-01");
  const option = page.getByTestId("line-product-0").locator("option").filter({ hasText: sku });
  await page.getByTestId("line-product-0").selectOption((await option.getAttribute("value")) ?? "");
  await page.getByTestId("line-quantity-0").fill("5");
  await page.getByTestId("order-confirm").click();
  await expect(page.getByTestId("order-created")).toBeVisible({ timeout: 20_000 });
  const reference = (await page.getByTestId("created-reference").innerText()).trim();

  // Documentul. Incarcarea este ce declanseaza trimiterea catre Make.
  await page.getByTestId("doc-input").setInputFiles(
    "tests/fixtures/confirmare-comanda-bilka-BLK-2026-14507.pdf",
  );
  await expect(page.getByTestId("doc-done")).toBeVisible({ timeout: 30_000 });

  // order_id se citeste din ecranul comenzilor, unde randul poarta id-ul.
  await page.goto("/comenzi");
  const item = page.locator(`[data-testid="inbound-item"][data-reference="${reference}"]`);
  await expect(item).toHaveCount(1, { timeout: 20_000 });
  const orderId = (await item.getAttribute("data-id")) ?? "";
  expect(orderId).toMatch(/^[0-9a-f-]{36}$/i);
  return { orderId, reference, sku };
}

function callbackBody(orderId: string, over: Record<string, unknown> = {}) {
  return {
    order_id: orderId,
    status: "extracted",
    error_code: null,
    reason: null,
    supplier_name: "Bilka Steel SRL",
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
        product_name: "Tigla metalica Bilka Classic 0.45mm visiniu",
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

function post(
  request: APIRequestContext,
  body: unknown,
  secret: string | null = MAKE_CALLBACK_SECRET,
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret !== null) headers["x-rc-callback-secret"] = secret;
  // maxRetries reincearca EXCLUSIV ECONNRESET, la nivel de socket, si niciodata
  // in functie de codul de raspuns. Vezi nota din review.spec: retries ramane 0
  // pentru teste, iar aceasta acopera un socket keep-alive inchis de serverul de
  // dezvoltare exact cand clientul scrie pe el.
  return request.post(CALLBACK, { headers, data: body, maxRetries: 2 });
}

/** Ciorna, citita prin ecranul de comenzi. P2-09 construieste ecranul de
 *  revizuire; pana atunci specul citeste starea prin acelasi endpoint pe care
 *  il foloseste si Make, ceea ce este suficient ca sa verifice ce s-a scris. */
async function draftState(request: APIRequestContext, orderId: string) {
  // Aceeasi poarta ca la scriere: citirea nu este publica. Endpointul cere
  // acelasi antet secret, ca o ciorna sa nu poata fi citita de oricine stie un
  // uuid.
  const r = await request.get(`${CALLBACK}?order_id=${orderId}`, {
    headers: { "x-rc-callback-secret": MAKE_CALLBACK_SECRET },
    maxRetries: 2,
  });
  return r.ok() ? await r.json() : null;
}

test.describe("Extragere documente", () => {
  test.describe.configure({ timeout: 120_000 });

  test("1. trimiterea poarta exact cele sase campuri si antetul secret", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { orderId } = await orderWithDocument(page, "fire");

    const fired = await firedFor(request, orderId);
    expect(fired).toHaveLength(1);
    // EXACT sase campuri, si nimic altceva.
    expect(fired[0]!.keys).toEqual(FIRE_FIELDS);
    expect(fired[0]!.hasSecretHeader).toBe(true);
    expect(fired[0]!.hasDocumentUrl).toBe(true);
    expect(fired[0]!.mimeType).toBe("application/pdf");
    expect(fired[0]!.sizeBytes).toBeGreaterThan(0);
    expect(fired[0]!.documentFilename).toContain(".pdf");
  });

  test("1c. EXT-15: o scanare esuata NU pastreaza nicio linie, iar antetul ramane", async ({
    page,
    request,
  }) => {
    // EXT-15. Regula proprietarului, din rezultatul scanarii din 2026-09-02:
    // calea de scanare a intors PATRU LINII GRESITE DIN SAPTE, fiecare
    // consistenta aritmetic. O linie marcata este tot o linie. Singura randare
    // sigura a unei linii care s-ar putea sa fie inventata este NICIO linie.
    await signIn(page, ownerAccount());
    const { orderId } = await orderWithDocument(page, "scanfail");

    const body = callbackBody(orderId, {
      status: "failed",
      error_code: "unreadable_document",
      reason: "Scanarea nu a putut fi cititaa.",
      document_source: "scan",
    });
    expect((await post(request, body)).status()).toBe(202);

    const d = await draftState(request, orderId);
    expect(d.status).toBe("failed");
    expect(d.document_source).toBe("scan");
    // ZERO LINII, desi payload-ul a trimis una.
    expect(d.lines).toHaveLength(0);
    // ANTETUL RAMANE, si acela este rostul ecranului: proprietarul identifica
    // documentul si bate liniile de mana contra unui total cunoscut.
    expect(d.supplier_name).toBe("Bilka Steel SRL");
    expect(Number(d.document_total)).toBe(22140);
    expect(Number(d.vat_rate)).toBe(20);
    expect(d.currency).toBe("MDL");
  });

  test("1d. EXT-15: acelasi payload marcat DIGITAL isi pastreaza liniile", async ({
    page,
    request,
  }) => {
    // MARTORUL, SI FARA EL CAZUL DE MAI SUS NU DOVEDESTE NIMIC. O implementare
    // care ar sterge liniile oricarui esec ar trece 1c si ar rupe calea
    // digitala, care ramane neschimbata. DISTINCTIA ESTE SURSA, NU ESECUL.
    await signIn(page, ownerAccount());
    const { orderId } = await orderWithDocument(page, "digitalfail");

    const body = callbackBody(orderId, {
      status: "partial",
      error_code: "extraction_failed",
      reason: "O linie nu a putut fi citita.",
      document_source: "digital",
    });
    expect((await post(request, body)).status()).toBe(202);

    const d = await draftState(request, orderId);
    expect(d.status).toBe("partial");
    expect(d.document_source).toBe("digital");
    expect(d.lines).toHaveLength(1);
  });

  test("1e. EXT-15: o sursa absenta se citeste ca scan, si una necunoscuta este 400", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    const { orderId } = await orderWithDocument(page, "srcdefault");

    // ABSENTA -> scan. Asimetria costurilor: a ghici digital pe o scanare
    // inseamna stoc inventat; a ghici scan pe un document digital inseamna ca
    // cineva bate documentul de mana.
    const body = callbackBody(orderId, {
      status: "failed",
      error_code: "unreadable_document",
      reason: "fara sursa declarata",
    });
    delete (body as Record<string, unknown>).document_source;
    expect((await post(request, body)).status()).toBe(202);

    const d = await draftState(request, orderId);
    expect(d.document_source).toBe("scan");
    expect(d.lines).toHaveLength(0);

    // O VALOARE NECUNOSCUTA ESTE REFUZATA, NU IGNORATA. Ignorata, ar cadea in
    // ramura sigura, ceea ce este corect din intamplare astazi si tacut in ziua
    // in care apare a treia valoare.
    const { orderId: other } = await orderWithDocument(page, "srcbad");
    const bad = callbackBody(other, { document_source: "photo" });
    expect((await post(request, bad)).status()).toBe(400);
  });

  test("2. un callback extracted scrie fiecare camp al contractului", async ({ page, request }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { orderId } = await orderWithDocument(page, "store");

    const r = await post(request, callbackBody(orderId));
    expect(r.status()).toBe(202);

    const d = await draftState(request, orderId);
    expect(d).not.toBeNull();
    expect(d.status).toBe("extracted");
    expect(Number(d.subtotal)).toBe(18450);
    expect(Number(d.vat_amount)).toBe(3690);
    expect(Number(d.document_total)).toBe(22140);
    expect(d.prices_include_vat).toBe(false);
    expect(Number(d.vat_rate)).toBe(20);
    expect(d.order_date).toBe("2026-08-14");
    expect(d.currency).toBe("MDL");
    expect(d.currency_raw).toBe("lei");
    expect(Number(d.confidence)).toBeCloseTo(0.94, 2);
    expect(d.meta?.prompt_version).toBe("v2.0");

    expect(d.lines).toHaveLength(1);
    const l = d.lines[0];
    expect(l.product_name).toBe("Tigla metalica Bilka Classic 0.45mm visiniu");
    expect(Number(l.quantity)).toBe(240.5);
    expect(l.unit).toBe("m2");
    expect(l.unit_raw).toBe("mp");
    expect(Number(l.unit_price)).toBe(76.72);
    expect(Number(l.line_total)).toBe(18452.36);
    expect(l.currency).toBe("MDL");
    expect(l.currency_raw).toBe("lei");
    expect(l.category).toBeNull();
    expect(l.category_raw).toBe("Invelitori");
    expect(Number(l.confidence)).toBeCloseTo(0.91, 2);
  });

  test("3. acelasi order_id de doua ori inlocuieste ciorna, 202 apoi 200", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { orderId } = await orderWithDocument(page, "idem");

    const first = await post(request, callbackBody(orderId));
    expect(first.status()).toBe(202);

    // A doua sosire, cu ALTE linii. Trebuie sa le inlocuiasca, nu sa adauge.
    const second = await post(
      request,
      callbackBody(orderId, {
        supplier_name: "Roben SRL",
        lines: [
          { product_name: "Caramida Roben", quantity: 1000, unit: "pcs", unit_raw: "buc" },
          { product_name: "Mortar Roben", quantity: 40, unit: "bag", unit_raw: "sac" },
        ],
      }),
    );
    expect(second.status()).toBe(200);

    const d = await draftState(request, orderId);
    expect(d.supplier_name).toBe("Roben SRL");
    // DOUA linii, nu trei: cea dintai a fost inlocuita, nu pastrata alaturi.
    expect(d.lines).toHaveLength(2);
  });

  test("4. secret gresit sau lipsa este 401 si nu scrie nimic", async ({ page, request }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { orderId } = await orderWithDocument(page, "secret");

    const wrong = await post(request, callbackBody(orderId), "gresit");
    expect(wrong.status()).toBe(401);

    const missing = await post(request, callbackBody(orderId), null);
    expect(missing.status()).toBe(401);

    // Nimic scris: statusul este inca null, adica trimis si fara raspuns.
    const d = await draftState(request, orderId);
    expect(d.status).toBeNull();
    expect(d.lines).toHaveLength(0);
  });

  test("5. un payload in afara contractului este 400 si nu scrie nimic", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { orderId } = await orderWithDocument(page, "schema");

    // error_code in afara multimii fixe.
    const badCode = await post(
      request,
      callbackBody(orderId, { status: "failed", error_code: "inventat_de_mana", lines: [] }),
    );
    expect(badCode.status()).toBe(400);

    // status in afara multimii.
    const badStatus = await post(request, callbackBody(orderId, { status: "aproape" }));
    expect(badStatus.status()).toBe(400);

    // failed fara error_code, ceea ce contractul interzice.
    const noCode = await post(
      request,
      callbackBody(orderId, { status: "failed", error_code: null, lines: [] }),
    );
    expect(noCode.status()).toBe(400);

    // o linie fara product_name, singurul camp obligatoriu al liniei.
    const noName = await post(
      request,
      callbackBody(orderId, { lines: [{ quantity: 1, unit: "pcs" }] }),
    );
    expect(noName.status()).toBe(400);

    const d = await draftState(request, orderId);
    expect(d.status).toBeNull();
    expect(d.lines).toHaveLength(0);
  });

  test("6. partial pastreaza liniile care AU fost extrase", async ({ page, request }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { orderId } = await orderWithDocument(page, "partial");

    const r = await post(
      request,
      callbackBody(orderId, {
        status: "partial",
        error_code: "unreadable_document",
        reason: "Ultima pagina este scanata strambn si nu a putut fi citita.",
        lines: [
          { product_name: "Prima linie citita", quantity: 10, unit: "pcs", unit_raw: "buc" },
          { product_name: "A doua linie citita", quantity: 20, unit: "pcs", unit_raw: "buc" },
        ],
      }),
    );
    expect(r.status()).toBe(202);

    const d = await draftState(request, orderId);
    expect(d.status).toBe("partial");
    expect(d.error_code).toBe("unreadable_document");
    expect(d.reason).toContain("scanata");
    // Documentul NU este aruncat fiindca o parte nu s-a citit.
    expect(d.lines.length).toBeGreaterThan(0);
    expect(d.lines).toHaveLength(2);
  });

  test("7. failed scrie motivul si nu creeaza linii", async ({ page, request }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { orderId } = await orderWithDocument(page, "failed");

    const r = await post(
      request,
      callbackBody(orderId, {
        status: "failed",
        error_code: "timeout",
        reason: "Extragerea a depasit limita scenariului.",
        lines: [],
      }),
    );
    expect(r.status()).toBe(202);

    const d = await draftState(request, orderId);
    expect(d.status).toBe("failed");
    expect(d.error_code).toBe("timeout");
    expect(d.reason).toContain("limita");
    expect(d.lines).toHaveLength(0);
  });

  test("8. absent este null, niciodata sir gol si niciodata zero", async ({ page, request }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { orderId } = await orderWithDocument(page, "nulls");

    const r = await post(
      request,
      callbackBody(orderId, {
        supplier_name: null,
        order_date: null,
        subtotal: null,
        vat_amount: null,
        document_total: null,
        prices_include_vat: null,
        vat_rate: null,
        currency: null,
        currency_raw: null,
        confidence: null,
        lines: [
          {
            product_name: "Linie fara nimic altceva",
            quantity: null,
            unit: null,
            unit_raw: null,
            unit_price: null,
            line_total: null,
            currency: null,
            currency_raw: null,
            category: null,
            category_raw: null,
            confidence: null,
          },
        ],
      }),
    );
    expect(r.status()).toBe(202);

    const d = await draftState(request, orderId);
    // NULL, si in mod explicit NU sirul gol si NU zero. Aceasta este intreaga
    // regula globala 2.1 a contractului, verificata camp cu camp.
    for (const f of [
      "supplier_name",
      "order_date",
      "subtotal",
      "vat_amount",
      "document_total",
      "prices_include_vat",
      "vat_rate",
      "currency",
      "currency_raw",
      "confidence",
    ]) {
      expect(d[f], `camp document ${f}`).toBeNull();
      expect(d[f], `camp document ${f}`).not.toBe("");
      expect(d[f], `camp document ${f}`).not.toBe(0);
    }
    const l = d.lines[0];
    for (const f of [
      "quantity",
      "unit",
      "unit_raw",
      "unit_price",
      "line_total",
      "currency",
      "currency_raw",
      "category",
      "category_raw",
      "confidence",
    ]) {
      expect(l[f], `camp linie ${f}`).toBeNull();
      expect(l[f], `camp linie ${f}`).not.toBe("");
      expect(l[f], `camp linie ${f}`).not.toBe(0);
    }

    // Un sir gol trimis EXPLICIT nu are voie sa fie stocat ca sir gol.
    const empty = await post(request, callbackBody(orderId, { supplier_name: "   " }));
    expect(empty.status()).toBe(200);
    const after = await draftState(request, orderId);
    expect(after.supplier_name).toBeNull();
  });

  // -------------------------------------------------------------------------
  // EXT-09. _meta.characters_extracted iese din contract, page_count ii ia locul
  // si devine o COLOANA, nu o cheie intr-un jsonb nevalidat.
  //
  // DE CE O COLOANA SI DE CE ACESTE CAZURI PICA INAINTE DE CARD. page_count era
  // deja o cheie in _meta si _meta se stocheaza verbatim, deci valoarea ajungea
  // si pana acum. Exact asta este problema: _meta este documentat ca "stocat si
  // niciodata aratat", nu este validat, si nimic din platforma nu ii poate pune
  // o intrebare. Cazul 9 cere valoarea de pe RAND, nu din bloc, si de aceea pica
  // fara 0032: draft.page_count nu exista.
  //
  // SEMNALUL PENTRU CARE EXISTA CAMPUL: un model care raporteaza o pagina pe un
  // document de trei a citit o treime din el si a intors un rezultat consistent
  // cu sine. NIMIC ALTCEVA DIN LANT NU PRINDE ASTA, si nici verificarea de
  // totaluri: totalurile primei pagini se potrivesc cu liniile primei pagini.
  // Comparatia cu numarul real de pagini este alt card si nu se face aici.
  // -------------------------------------------------------------------------

  test("9. _meta.page_count fara characters_extracted este acceptat si se citeste de pe rand", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { orderId } = await orderWithDocument(page, "pages");

    // _META EXACT CUM IL DESCRIE CONTRACTUL DUPA EXT-09: patru chei, si
    // characters_extracted NU este una dintre ele.
    const r = await post(
      request,
      callbackBody(orderId, {
        _meta: {
          model: "gpt-4o-mini",
          prompt_version: "v2.0",
          page_count: 3,
          duration_ms: 8140,
        },
      }),
    );
    // Codul de succes al contractului pentru un prim callback, sectiunea 6.
    expect(r.status()).toBe(202);

    const d = await draftState(request, orderId);
    // DE PE RAND, ca valoare de sine statatoare. Aceasta este linia care pica
    // fara migratia 0032 si fara poarta din ruta: campul nu exista pe ciorna.
    expect(d.page_count).toBe(3);
    // Blocul de diagnostic este pastrat verbatim alaturi, nu inlocuit de coloana.
    expect(d.meta?.page_count).toBe(3);
    expect(d.meta?.prompt_version).toBe("v2.0");
    // Nu am trimis campul, deci nu are ce sa apara.
    expect(d.meta?.characters_extracted).toBeUndefined();
  });

  test("10. un callback care inca poarta characters_extracted NU este respins pentru asta", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { orderId } = await orderWithDocument(page, "legacy");

    // callbackBody trimite _meta-ul VECHI, cu characters_extracted: 4820. Este
    // payload-ul de dinainte de acest card, si el trebuie sa treaca neatins.
    //
    // DE CE ESTE O REGULA SI NU O POLITETE: partea lui Andre si a noastra nu se
    // desfasoara in aceeasi secunda. O schimbare de contract care invalideaza
    // payload-ul versiunii precedente este o pana programata pentru ziua in care
    // el livreaza primul, si Make REINCEARCA, deci ar fi o bucla.
    const r = await post(request, callbackBody(orderId));
    expect(r.status()).toBe(202);

    const d = await draftState(request, orderId);
    expect(d.status).toBe("extracted");
    // Campul este IGNORAT, nu interzis: nimic nu il citeste si nimic nu il cere.
    // Ramane in blocul de diagnostic pentru ca acolo l-a pus expeditorul.
    expect(d.meta?.characters_extracted).toBe(4820);
    // Si numarul de pagini din acelasi _meta vechi este citit normal.
    expect(d.page_count).toBe(2);
  });

  test("11. un numar de pagini absent sau stricat este null si NU respinge documentul", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { orderId } = await orderWithDocument(page, "pagenull");

    // ABSENT. Defaults, verbatim: page_count este nullable si absenta lui nu este
    // o eroare. Este un semnal de siguranta, nu un camp obligatoriu, si un semnal
    // lipsa nu are voie sa respinga un document citit corect.
    const absent = await post(
      request,
      callbackBody(orderId, {
        _meta: { model: "gpt-4o-mini", prompt_version: "v2.0", duration_ms: 8140 },
      }),
    );
    expect(absent.status()).toBe(202);
    expect((await draftState(request, orderId)).page_count).toBeNull();

    // _meta LIPSA CU TOTUL, care este un caz diferit de "_meta fara cheia".
    const noMeta = await post(request, callbackBody(orderId, { _meta: null }));
    expect(noMeta.status()).toBe(200);
    expect((await draftState(request, orderId)).page_count).toBeNull();

    // RAPOARTELE STRICATE, fiecare separat, fiindca fiecare ar trece printr-o
    // implementare care il rateaza pe celalalt: zero ar trece printr-un test
    // `< 0`, fractionarul ar trece printr-un `typeof === "number"`, iar sirul ar
    // trece printr-un `Number(...)` care il converteste in tacere.
    //
    // ZERO NU ESTE UN NUMAR MAI MIC DE PAGINI. Un document are cel putin o
    // pagina, deci zero este o citire imposibila si nu una prudenta, iar
    // stocarea lui ar arata mai tarziu exact ca o citire reala.
    for (const broken of [0, -3, 2.5, "3", true, null]) {
      const r = await post(
        request,
        callbackBody(orderId, {
          _meta: { model: "gpt-4o-mini", prompt_version: "v2.0", page_count: broken },
        }),
      );
      // NU 400. Un camp de diagnostic stricat nu arunca un document intreg.
      expect(r.status(), `page_count ${JSON.stringify(broken)} nu are voie sa fie respins`).toBe(
        200,
      );
      const d = await draftState(request, orderId);
      expect(d.page_count, `page_count ${JSON.stringify(broken)} trebuie citit ca null`).toBeNull();
    }

    // Si dupa toate acestea un raport BUN se scrie in continuare, ca sa fie clar
    // ca poarta nu s-a inchis pe drum.
    const good = await post(
      request,
      callbackBody(orderId, {
        _meta: { model: "gpt-4o-mini", prompt_version: "v2.0", page_count: 7, duration_ms: 10 },
      }),
    );
    expect(good.status()).toBe(200);
    expect((await draftState(request, orderId)).page_count).toBe(7);
  });
});
