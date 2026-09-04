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

  test("1b. EXT-14: un payload FARA confidence este acceptat la fel", async ({ page, request }) => {
    // EXT-14, cealalta jumatate. Cazul 1 dovedeste ca un payload care TRIMITE
    // confidence este acceptat si campul nu se stocheaza. Acesta dovedeste ca
    // unul care NU il trimite este acceptat identic.
    //
    // AMANDOUA SUNT NECESARE SI NICIUNA NU O IMPLICA PE CEALALTA. O
    // implementare care refuza payload-ul fara campul respectiv ar trece cazul
    // 1 si ar rupe extractorul in ziua in care Andre il scoate; una care refuza
    // payload-ul cu el ar trece acesta si ar rupe totul pana atunci.
    await signIn(page, ownerAccount());
    const { orderId } = await orderWithDocument(page, "ext14");
    const body = callbackBody(orderId);
    delete (body as Record<string, unknown>).confidence;
    for (const line of body.lines as Array<Record<string, unknown>>) delete line.confidence;

    const response = await post(request, body);
    expect(response.status()).toBe(202);

    const d = await draftState(request, orderId);
    expect(d.status).toBe("extracted");
    expect(d.confidence).toBeNull();
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0].confidence).toBeNull();
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
    // EXT-14. IT IS SENT AND IT IS NOT STORED, WHICH IS THE WHOLE CARD.
    //
    // callbackBody still carries confidence: 0.94, deliberately, because Andre's
    // side and ours do not deploy in the same second and a payload that still
    // sends it must still be ACCEPTED. What must be true is that it did not
    // reach the draft. Asserting only that the response was 202 would pass on a
    // version that stored it.
    expect(d.confidence, "EXT-14: confidence must not be stored").toBeNull();
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
    // EXT-14, the line half. Same reasoning as the document half above.
    expect(l.confidence, "EXT-14: line confidence must not be stored").toBeNull();
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
      // EXT-14 removed `confidence` from this list. It is asserted null in the
      // case above for a payload that DOES send it, which is a stronger claim
      // than asserting it is null in a payload that sends nothing.
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

  // -------------------------------------------------------------------------
  // EXT-16. RECONCILIEREA PE PARTEA NOASTRA.
  //
  // ANDRE'S OWN RESULT IS THE FIXTURE, OBSERVED AND NOT ROUNDED. Documentul
  // Matnord, 7 linii, total tiparit 50336.40 fara TVA. Trei rulari au intors
  // trei sume: 49035.40, 39242.00 si 38429.40, TOATE cu status extracted si
  // reason null. Nu se adauga o a patra suma inventata: ar face setul sa arate
  // mai ingrijit si nu ar fi dovada pentru nimic.
  //
  // Toleranta pentru 7 linii este max(0.05, 0.07) = 0.07. Cele trei rateaza cu
  // 1301.00, 11094.40 si 11907.00.
  // -------------------------------------------------------------------------

  /** Un payload de scanare cu liniile insumand `sum`, pe 7 linii, si totalul
   *  tiparit al documentului Matnord. Liniile sunt egale intre ele; ce conteaza
   *  este SUMA, fiindca ea este ce se compara. */
  function matnord(orderId: string, sum: number, over: Record<string, unknown> = {}) {
    const per = Math.round((sum / 7) * 100) / 100;
    const lines = Array.from({ length: 7 }, (_, i) => ({
      product_name: `Linie Matnord ${i + 1}`,
      quantity: 1,
      unit: "pcs",
      unit_raw: "buc",
      unit_price: per,
      // Ultima linie poarta restul, ca suma sa fie EXACT cea observata si nu
      // una apropiata: o fixtura care se rotunjeste catre valoarea dorita nu
      // mai testeaza aritmetica pe care o pretinde.
      line_total: i === 6 ? Math.round((sum - per * 6) * 100) / 100 : per,
      currency: "MDL",
      currency_raw: "lei",
      category: null,
      category_raw: null,
    }));
    return callbackBody(orderId, {
      status: "extracted",
      error_code: null,
      reason: null,
      document_source: "scan",
      prices_include_vat: false,
      subtotal: 50336.4,
      vat_amount: 10067.28,
      document_total: 60403.68,
      lines,
      ...over,
    });
  }

  test("12. cele trei sume observate ale lui Andre CAD toate la reconciliere, si forma refuzului este cea a EXT-15", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);

    for (const sum of [49035.4, 39242.0, 38429.4]) {
      const { orderId } = await orderWithDocument(page, `rec${String(sum).replace(".", "")}`);
      const r = await post(request, matnord(orderId, sum));
      // NU 400. Payload-ul respecta contractul; ce nu se potriveste este
      // aritmetica lui, si asta este o ciorna respinsa, nu un payload invalid.
      expect(r.status(), `suma ${sum} trebuie ACCEPTATA ca payload`).toBe(202);

      const d = await draftState(request, orderId);
      // FORMA REFUZULUI, exact cum o cere cardul.
      expect(d.status, `suma ${sum}`).toBe("failed");
      expect(d.error_code, `suma ${sum}`).toBe("reconciliation_failed");
      expect(d.document_source, `suma ${sum}`).toBe("scan");
      // ZERO LINII. Liniile care nu se aduna la totalul tiparit sunt exact
      // liniile care nu au voie sa ajunga pe un ecran de confirmare.
      expect(d.lines, `suma ${sum}`).toHaveLength(0);
      // ANTETUL RAMANE. Documentul se introduce manual, iar cine il introduce
      // are nevoie de furnizor, data si totaluri.
      expect(d.supplier_name, `suma ${sum}`).not.toBeNull();
      expect(Number(d.subtotal), `suma ${sum}`).toBe(50336.4);
      expect(Number(d.document_total), `suma ${sum}`).toBe(60403.68);
    }
  });

  test("13. o scanare INAUNTRUL tolerantei este acceptata si isi pastreaza liniile", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { orderId } = await orderWithDocument(page, "recok");

    // Exact totalul tiparit. Fara acest caz, o implementare care refuza TOT ar
    // trece cazul 12 in intregime.
    const r = await post(request, matnord(orderId, 50336.4));
    expect(r.status()).toBe(202);
    const d = await draftState(request, orderId);
    expect(d.status).toBe("extracted");
    expect(d.error_code).toBeNull();
    expect(d.lines).toHaveLength(7);
  });

  test("14. un document DIGITAL in afara tolerantei este neatins de acest card", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { orderId } = await orderWithDocument(page, "recdig");

    // Aceeasi aritmetica gresita, alta sursa. Acolo cifrele vin din text, nu
    // dintr-o citire, si o nepotrivire inseamna altceva. Cardul spune in terms
    // ca este neatins, deci trebuie sa ramana extracted CU liniile lui.
    const r = await post(request, matnord(orderId, 38429.4, { document_source: "digital" }));
    expect(r.status()).toBe(202);
    const d = await draftState(request, orderId);
    expect(d.status).toBe("extracted");
    expect(d.error_code).toBeNull();
    expect(d.document_source).toBe("digital");
    expect(d.lines).toHaveLength(7);
  });

  test("15. cele trei conditii in care verificarea nu poate rula, fiecare cu cazul ei", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);

    // 1. TINTA ESTE null -> REFUZ. Documentul nu tipareste totalul fata de care
    //    s-ar reconcilia, deci nu se stie nimic, si a nu sti nu este o trecere.
    {
      const { orderId } = await orderWithDocument(page, "rectgt");
      const r = await post(request, matnord(orderId, 50336.4, { subtotal: null }));
      expect(r.status()).toBe(202);
      const d = await draftState(request, orderId);
      expect(d.status, "tinta null trebuie sa REFUZE").toBe("failed");
      expect(d.error_code).toBe("reconciliation_failed");
      expect(d.lines).toHaveLength(0);
    }

    // 2. UN line_total ESTE null -> REFUZ. Suma este incompleta prin
    //    constructie, deci comparatia ar fi intre un numar si o parte dintr-un
    //    numar.
    {
      const { orderId } = await orderWithDocument(page, "reclt");
      const body = matnord(orderId, 50336.4) as Record<string, unknown>;
      (body.lines as Record<string, unknown>[])[3]!.line_total = null;
      const r = await post(request, body);
      expect(r.status()).toBe(202);
      const d = await draftState(request, orderId);
      expect(d.status, "un line_total null trebuie sa REFUZE").toBe("failed");
      expect(d.error_code).toBe("reconciliation_failed");
      expect(d.lines).toHaveLength(0);
    }

    // 3. prices_include_vat ESTE null -> se reconciliaza fata de AMANDOUA si se
    //    accepta numai daca UNA se potriveste. Doua sub-cazuri, fiindca o
    //    implementare care accepta mereu ar trece primul si ar cadea la al
    //    doilea.
    {
      const { orderId } = await orderWithDocument(page, "recvatok");
      // Suma se potriveste cu document_total, nu cu subtotal. UNA ajunge.
      const r = await post(
        request,
        matnord(orderId, 60403.68, { prices_include_vat: null }),
      );
      expect(r.status()).toBe(202);
      const d = await draftState(request, orderId);
      expect(d.status, "prices_include_vat null, una dintre tinte se potriveste").toBe("extracted");
      expect(d.lines).toHaveLength(7);
    }
    {
      const { orderId } = await orderWithDocument(page, "recvatno");
      // Nu se potriveste cu niciuna dintre cele doua.
      const r = await post(request, matnord(orderId, 38429.4, { prices_include_vat: null }));
      expect(r.status()).toBe(202);
      const d = await draftState(request, orderId);
      expect(d.status, "prices_include_vat null si niciuna nu se potriveste").toBe("failed");
      expect(d.error_code).toBe("reconciliation_failed");
      expect(d.lines).toHaveLength(0);
    }
  });
});
