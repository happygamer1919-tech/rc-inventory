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

    // EXT-20 A INGUSTAT FORMA PE CARE ACEST CAZ O TRIMITEA. Pana la 2026-09-04
    // payload-ul de aici purta o linie si o vedea aruncata la scriere. De la
    // EXT-20 o scanare esuata care poarta CHEIA `lines`, goala sau nu, este
    // respinsa cu 400, deci forma aceea nu mai ajunge sa fie stocata.
    //
    // AFIRMATIA CARDULUI EXT-15 NU S-A PIERDUT, S-A MUTAT. Ca liniile TRIMISE
    // sunt aruncate se dovedeste acum pe calea EXT-16, cazul 12: o scanare
    // `extracted` cu sapte linii care nu se reconciliaza este stocata `failed`
    // cu ZERO linii. Ce ramane aici este cealalta jumatate a lui EXT-15, si ea
    // este intacta: o scanare esuata are zero linii si isi pastreaza antetul.
    const body = callbackBody(orderId, {
      status: "failed",
      error_code: "unreadable_document",
      reason: "Scanarea nu a putut fi cititaa.",
      document_source: "scan",
    });
    delete (body as Record<string, unknown>).lines;
    expect((await post(request, body)).status()).toBe(202);

    const d = await draftState(request, orderId);
    expect(d.status).toBe("failed");
    expect(d.document_source).toBe("scan");
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
    // EXT-20 SE APLICA SI CAND SURSA ESTE ABSENTA, fiindca absenta SE CITESTE ca
    // scanare. Cheia `lines` pleaca odata cu sursa, si asta este a doua
    // afirmatie a acestui caz: implicitul nu este o eticheta pe rand, este
    // regula pe care o aplica validatorul.
    delete (body as Record<string, unknown>).lines;
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
      // EXT-23, BRATUL target_missing. ASERTIUNEA S-A MUTAT, NU A FOST STEARSA:
      // pana la EXT-23 astepta `reconciliation_failed`. prices_include_vat este
      // false, deci reperul ESTE subtotalul, si subtotalul lipseste: nu exista
      // nimic fata de care suma liniilor sa poata rata.
      expect(d.error_code).toBe("unreadable_document");
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
      // EXT-23, BRATUL line_total_missing, CLASIFICAT DE PROPRIETAR IN ACEST
      // CARD fiindca hotararea R-187 l-a gasit neclasificat: o linie fara total
      // nu poate fi reconciliata, si actiunea este o copie mai buna.
      expect(d.error_code).toBe("unreadable_document");
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
      // EXT-23, BRATUL anchor_unknown. ASERTIUNEA S-A MUTAT, NU A FOST STEARSA.
      // Steagul lipseste, deci NU SE STIE CARE dintre cele doua totaluri este
      // reperul. Cand niciunul nu se potriveste, nu se poate spune ca suma a
      // ratat un reper: nu s-a stabilit niciun reper.
      expect(d.error_code).toBe("unreadable_document");
      expect(d.lines).toHaveLength(0);
    }

    // 4. STEAGUL LIPSESTE SI AMANDOUA TOTALURILE LIPSESC. Nu exista candidat
    //    deloc, ceea ce este bratul target_missing si nu anchor_unknown. Cele
    //    doua duc la acelasi cod si sunt cazuri diferite, deci fiecare are
    //    cazul ei.
    {
      const { orderId } = await orderWithDocument(page, "recvatnone");
      const r = await post(
        request,
        matnord(orderId, 38429.4, {
          prices_include_vat: null,
          subtotal: null,
          document_total: null,
        }),
      );
      expect(r.status()).toBe(202);
      const d = await draftState(request, orderId);
      expect(d.status, "niciun total tiparit deloc").toBe("failed");
      expect(d.error_code).toBe("unreadable_document");
      expect(d.lines).toHaveLength(0);
    }

    // 5. STEAGUL ESTE true SI document_total LIPSESTE. Simetricul sub-cazului
    //    1, pe cealalta ramura a lui prices_include_vat, fiindca o ramura
    //    testata pe o singura valoare a steagului este o ramura jumatate
    //    testata.
    {
      const { orderId } = await orderWithDocument(page, "rectgttrue");
      const r = await post(
        request,
        matnord(orderId, 50336.4, { prices_include_vat: true, document_total: null }),
      );
      expect(r.status()).toBe(202);
      const d = await draftState(request, orderId);
      expect(d.status, "reperul ales de steag lipseste").toBe("failed");
      expect(d.error_code).toBe("unreadable_document");
      expect(d.lines).toHaveLength(0);
    }
  });

  // -------------------------------------------------------------------------
  // EXT-23. ZERO LINII, SI CELE DOUA SUB-CAZURI CARE NU SUNT ACELASI CAZ.
  //
  // Hotararea R-187 a gasit ca un payload cu ZERO linii al carui total ales este
  // chiar 0 SE RECONCILIAZA astazi si nu este refuzat deloc: |0 - 0| <= 0.05.
  // Se stocheaza `extracted`, fara linii, ca o citire curata. Proprietarul l-a
  // hotarat in acest card: suma a nimic care da zero nu este dovada pentru
  // nimic.
  // -------------------------------------------------------------------------

  test("15b. EXT-23: zero linii este unreadable_document", async ({ page, request }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);

    // 1. ZERO LINII, TOTALURI TIPARITE NORMALE. Extractorul nu a intors nimic
    //    de pe o pagina care are cifre pe ea.
    {
      const { orderId } = await orderWithDocument(page, "zerolines");
      const r = await post(request, matnord(orderId, 50336.4, { lines: [] }));
      expect(r.status(), "un payload fara linii respecta contractul").toBe(202);
      const d = await draftState(request, orderId);
      expect(d.status, "zero linii trebuie sa REFUZE").toBe("failed");
      expect(d.error_code).toBe("unreadable_document");
      expect(d.lines).toHaveLength(0);
      // ANTETUL RAMANE, ca la orice refuz de scanare: cine bate documentul de
      // mana are nevoie de furnizor, data si totaluri.
      expect(d.supplier_name).not.toBeNull();
      expect(Number(d.subtotal)).toBe(50336.4);
    }

    // 2. CONTROLUL DIGITAL. Acelasi payload fara linii, declarat digital, este
    //    NEATINS, exact ca la cazurile 14 si 20.3. EXT-23 nu largeste suprafata
    //    pe care se aplica reconcilierea; schimba numai codul pe care il emite.
    {
      const { orderId } = await orderWithDocument(page, "zerodig");
      const r = await post(
        request,
        matnord(orderId, 50336.4, { lines: [], document_source: "digital" }),
      );
      expect(r.status()).toBe(202);
      const d = await draftState(request, orderId);
      expect(d.status, "calea digitala ramane neatinsa").toBe("extracted");
      expect(d.error_code).toBeNull();
    }
  });

  test("15c. EXT-23: zero linii SI totalul tiparit chiar 0 este unreadable_document, si acesta este cazul pe care R-187 l-a gasit trecand", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);

    // CAZUL ARE PROPRIUL TEST SI NU ESTE UN SUB-CAZ AL LUI 15b, fiindca 15b
    // cade primul si un sub-caz care nu se executa nu dovedeste nimic. Acesta
    // este exact defectul pe care R-187 l-a raportat: |0 - 0| <= 0.05, deci
    // payload-ul SE RECONCILIA si nu era refuzat deloc. O implementare care
    // refuza zero linii NUMAI cand totalul este diferit de zero trece 15b in
    // intregime si lasa gaura exact unde era.
    {
      const { orderId } = await orderWithDocument(page, "zerozero");
      const r = await post(
        request,
        matnord(orderId, 50336.4, {
          lines: [],
          prices_include_vat: false,
          subtotal: 0,
          vat_amount: 0,
          document_total: 0,
          vat_rate: 20.0,
        }),
      );
      expect(r.status()).toBe(202);
      const d = await draftState(request, orderId);
      expect(
        d.status,
        "suma a nimic care este de acord cu zero nu este dovada pentru nimic",
      ).toBe("failed");
      expect(d.error_code).toBe("unreadable_document");
      expect(d.error_code, "nu se accepta si nu se raporteaza ca reconciliat").not.toBeNull();
      expect(d.lines).toHaveLength(0);
    }
  });

  // -------------------------------------------------------------------------
  // EXT-17. RECONCILIAT NU INSEAMNA CITIT CORECT.
  //
  // Reconcilierea a prins esecul observat NUMAI fiindca modelul citise corect
  // totalurile si gresit liniile. Un set de linii fabricate care se intampla sa
  // dea totalul tiparit trece de aritmetica. Improbabil, nu imposibil, iar
  // costul este stoc inventat intr-un depozit real.
  //
  // CE MASOARA "NU SE INREGISTREAZA SINGURA". Numarul de comenzi de intrare,
  // citit de pe ecran INAINTE si DUPA callback. O inregistrare ar crea o comanda,
  // deci un numar neschimbat este afirmatia, nu o descriere a ei.
  // -------------------------------------------------------------------------

  /** Cate comenzi de intrare sunt pe ecran acum. */
  async function inboundCount(page: Page): Promise<number> {
    await page.goto("/comenzi");
    await expect(page.getByTestId("inbound-list")).toBeVisible({ timeout: 20_000 });
    return await page.locator('[data-testid="inbound-item"]').count();
  }

  /**
   * Incarca un document PE BANDA DE EXTRAGERE si intoarce order_id-ul mintit.
   *
   * NU ESTE orderWithDocument, SI DIFERENTA ESTE TOT ROSTUL ACESTOR DOUA CAZURI.
   * orderWithDocument ataseaza documentul unei comenzi care EXISTA DEJA, iar
   * listReviewDrafts exclude anume o astfel de ciorna: acolo comanda a fost deja
   * creata de om, pe cealalta banda. O ciorna de pe banda de extragere nu are
   * inca nicio comanda, deci "nu s-a inregistrat" se poate masura: o inregistrare
   * ar crea una.
   *
   * Aceasta greseala a fost facuta si prinsa de cazul insusi: prima varianta a
   * folosit orderWithDocument si a cautat ciorna in lista de verificare, unde
   * nu putea sa fie niciodata.
   */
  async function uploadForExtraction(
    page: Page,
    request: APIRequestContext,
    tag: string,
  ): Promise<string> {
    const filename = `TEST-EXT17-${tag}-${RUN}.pdf`;
    await page.goto("/incarca-comanda");
    await page.getByTestId("extraction-input").setInputFiles({
      name: filename,
      mimeType: "application/pdf",
      buffer: Buffer.from(
        `%PDF-1.4\n% RC test ${tag}\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
        "utf8",
      ),
    });
    const card = page.locator('[data-testid="draft-card"]').filter({ hasText: filename });
    await expect(card).toHaveCount(1, { timeout: 30_000 });
    const orderId = (await card.getAttribute("data-order-id")) ?? "";
    expect(orderId).toMatch(/^[0-9a-f-]{36}$/i);
    // Trimiterea chiar a plecat catre transport cu acest order_id.
    expect(await firedFor(request, orderId)).toHaveLength(1);
    return orderId;
  }

  test("16. EXT-17: o scanare care SE ADUNA CORECT ajunge tot la verificare si NU se inregistreaza singura", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const orderId = await uploadForExtraction(page, request, "scanok");

    const before = await inboundCount(page);

    // EXACT totalul tiparit, deci reconcilierea TRECE. Acesta este cazul pentru
    // care cardul exista: aritmetica este multumita si documentul este tot o
    // fotografie.
    const r = await post(request, matnord(orderId, 50336.4));
    expect(r.status()).toBe(202);

    const d = await draftState(request, orderId);
    expect(d.status, "o scanare reconciliata ramane extracted").toBe("extracted");
    expect(d.error_code).toBeNull();
    expect(d.document_source, "sursa ramane scanarea, si ea este ce decide marcajul").toBe("scan");
    expect(d.lines, "liniile se pastreaza: exista ceva de verificat").toHaveLength(7);

    // NU S-A INREGISTRAT. Doua masuri, fiindca una singura se poate satisface din
    // intamplare: ciorna nu poarta confirmarea, si nu a aparut nicio comanda.
    expect(d.confirmed_at, "callback-ul nu are voie sa confirme ciorna").toBeNull();
    expect(d.confirmed_inbound_order_id).toBeNull();
    expect(await inboundCount(page), "callback-ul nu are voie sa creeze o comanda").toBe(before);

    // SI A AJUNS LA VERIFICARE. Ciorna este in lista, cu starea ei, si poarta
    // butonul care duce la fisa: calea catre om exista si este singura.
    await page.goto("/incarca-comanda");
    const card = page.locator(`[data-testid="draft-card"][data-order-id="${orderId}"]`);
    await expect(card).toHaveCount(1, { timeout: 30_000 });
    await expect(card).toHaveAttribute("data-status", "extracted");
    await expect(card.getByTestId("draft-review")).toHaveCount(1);
  });

  test("17. EXT-17: acelasi payload marcat DIGITAL parcurge acelasi drum, neschimbat", async ({
    page,
    request,
  }) => {
    // CONTROLUL. Fara el, cazul 16 ar trece si pe o implementare care refuza sa
    // inregistreze ORICE, si nu ar spune nimic despre calea digitala.
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const orderId = await uploadForExtraction(page, request, "digok");

    const before = await inboundCount(page);

    const r = await post(request, matnord(orderId, 50336.4, { document_source: "digital" }));
    expect(r.status()).toBe(202);

    const d = await draftState(request, orderId);
    expect(d.status).toBe("extracted");
    expect(d.error_code).toBeNull();
    expect(d.document_source).toBe("digital");
    expect(d.lines).toHaveLength(7);

    expect(d.confirmed_at, "nici calea digitala nu se confirma singura").toBeNull();
    expect(d.confirmed_inbound_order_id).toBeNull();
    expect(await inboundCount(page), "nici calea digitala nu creeaza o comanda").toBe(before);

    await page.goto("/incarca-comanda");
    const card = page.locator(`[data-testid="draft-card"][data-order-id="${orderId}"]`);
    await expect(card).toHaveCount(1, { timeout: 30_000 });
    await expect(card).toHaveAttribute("data-status", "extracted");
    await expect(card.getByTestId("draft-review")).toHaveCount(1);
  });

  // -------------------------------------------------------------------------
  // EXT-18. AUTOCONSISTENTA ANTETULUI, PE ACEEASI TOLERANTA.
  //
  //   A.  subtotal + vat_amount  fata de  document_total
  //   B.  subtotal * vat_rate    fata de  vat_amount
  //
  // Payload-ul matnord de baza le TRECE pe amandoua exact, deci fiecare caz de
  // mai jos strica O SINGURA cifra. Un caz care le-ar strica pe amandoua ar trece
  // si pe o implementare care are numai una dintre cele doua verificari.
  // -------------------------------------------------------------------------

  test("18. EXT-18: subtotal plus TVA care nu da totalul documentului este RESPINS", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { orderId } = await orderWithDocument(page, "hdrsum");

    // NUMAI document_total se misca. prices_include_vat este false, deci
    // reconcilierea EXT-16 tinteste subtotalul si trece mai departe: singurul
    // lucru care poate respinge acest payload este verificarea A.
    //
    // 50336.40 + 10067.28 = 60403.68, si documentul pretinde 60410.00, adica
    // 6.32 peste o toleranta de 0.07.
    const r = await post(request, matnord(orderId, 50336.4, { document_total: 60410.0 }));
    expect(r.status()).toBe(202);
    const d = await draftState(request, orderId);
    expect(d.status, "un antet care nu se aduna trebuie sa REFUZE").toBe("failed");
    // EXT-23, BRATUL header_inconsistent. ASERTIUNEA S-A MUTAT, NU A FOST
    // STEARSA: pana la EXT-23 acest caz astepta `reconciliation_failed`, si
    // hotararea R-187 a numit-o o abatere de la impartirea hotarata. Un antet
    // care nu se aduna cu el insusi nu are niciun reper de incredere, deci suma
    // liniilor nu a ratat nimic: nu se stie fata de ce ar fi trebuit sa se
    // adune.
    expect(d.error_code).toBe("unreadable_document");
    expect(d.error_code, "un antet care se contrazice nu este o suma care a ratat").not.toBe(
      "reconciliation_failed",
    );
    expect(d.lines, "o scanare refuzata nu pastreaza nicio linie").toHaveLength(0);
  });

  test("19. EXT-18: TVA care nu este subtotalul ori cota este RESPINS", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { orderId } = await orderWithDocument(page, "hdrvat");

    // NUMAI vat_rate se misca, si acesta este tot rostul cazului: verificarea A
    // ramane satisfacuta, fiindca 50336.40 + 10067.28 este exact 60403.68, deci
    // numai verificarea B poate respinge.
    //
    // 50336.40 * 25% = 12584.10, si documentul pretinde 10067.28, adica 2516.82
    // peste o toleranta de 0.07.
    const r = await post(request, matnord(orderId, 50336.4, { vat_rate: 25.0 }));
    expect(r.status()).toBe(202);
    const d = await draftState(request, orderId);
    expect(d.status, "un TVA care nu iese din cota trebuie sa REFUZE").toBe("failed");
    // EXT-23, BRATUL header_inconsistent, a doua verificare. Aceeasi mutare ca
    // la cazul 18 si din acelasi motiv.
    expect(d.error_code).toBe("unreadable_document");
    expect(d.lines).toHaveLength(0);
  });

  test("20. EXT-18: un antet care se aduna este NEATINS, si o cifra absenta nu este nici trecere nici refuz", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);

    // 1. AMANDOUA SE POTRIVESC -> NEATINS. Fara acest caz, o implementare care
    //    respinge TOT ar trece cazurile 18 si 19 in intregime.
    {
      const { orderId } = await orderWithDocument(page, "hdrok");
      const r = await post(request, matnord(orderId, 50336.4));
      expect(r.status()).toBe(202);
      const d = await draftState(request, orderId);
      expect(d.status, "un antet consistent nu are voie sa fie atins").toBe("extracted");
      expect(d.error_code).toBeNull();
      expect(d.lines).toHaveLength(7);
    }

    // 2. O CIFRA ABSENTA: verificarea NU A RULAT, si asta nu este un refuz.
    //    vat_rate null face verificarea B imposibila; A ramane satisfacuta si
    //    reconcilierea liniilor la fel, deci documentul trece. Defaults-ul
    //    cardului o cere in terms: o verificare careia ii lipseste intrarea nu
    //    se raporteaza ca trecuta, si nici nu respinge de una singura.
    {
      const { orderId } = await orderWithDocument(page, "hdrnull");
      const r = await post(request, matnord(orderId, 50336.4, { vat_rate: null }));
      expect(r.status()).toBe(202);
      const d = await draftState(request, orderId);
      expect(d.status, "o cifra absenta nu respinge singura").toBe("extracted");
      expect(d.lines).toHaveLength(7);
    }

    // 3. CALEA DIGITALA ESTE NEATINSA, si aceasta este o DECIZIE, nu o scapare.
    //    Acelasi antet stricat ca la cazul 18, declarat digital, trece exact ca
    //    pana acum. EXT-16 a lasat calea digitala neatinsa in mod deliberat si
    //    cazul 14 o afirma; un refuz nou acolo ar schimba in tacere un
    //    comportament pe care Andre il livreaza astazi, iar hotararea R-098 cere
    //    ca un esec nou pe o suprafata sa fie comunicat INAINTE sa poata aparea.
    {
      const { orderId } = await orderWithDocument(page, "hdrdig");
      const r = await post(
        request,
        matnord(orderId, 50336.4, { document_total: 60410.0, document_source: "digital" }),
      );
      expect(r.status()).toBe(202);
      const d = await draftState(request, orderId);
      expect(d.status, "calea digitala ramane neatinsa de acest card").toBe("extracted");
      expect(d.error_code).toBeNull();
      expect(d.document_source).toBe("digital");
      expect(d.lines).toHaveLength(7);
    }
  });

  // -------------------------------------------------------------------------
  // EXT-26. CODUL EXPEDITORULUI ESTE AUTORITAR, AL NOSTRU SE INREGISTREAZA.
  //
  // HOTARAREA R-190, IN CUVINTELE PROPRIETARULUI: "when the payload carries an
  // error_code, it is authoritative. Our classification runs anyway and is
  // recorded, never substituted." Expeditorul testeaza `line_count` inaintea
  // comparatiei sumelor si vede numarul de pagini; noi nu vedem niciunul.
  //
  // DEZACORDUL ESTE DATE, NU O EROARE. Doi cititori cu dovezi diferite vor
  // ajunge la concluzii diferite, iar perechea stocata este singurul set de date
  // pe care il va avea cineva vreodata despre care cititor este mai bun.
  // -------------------------------------------------------------------------

  test("27. EXT-26: cand al nostru spune reconciliation_failed si al lui spune unreadable_document, AL LUI se stocheaza si al nostru se scrie alaturi", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { orderId } = await orderWithDocument(page, "ext26dis");

    // PARTIAL, SI ACEASTA ESTE SINGURA FORMA IN CARE DEZACORDUL POATE EXISTA.
    // EXT-20 ingusteaza numai `scan` plus `failed`, deci un `partial` isi pastreaza
    // liniile citite, expeditorul isi trimite codul odata cu ele, iar aritmetica
    // noastra poate ajunge la alta concluzie despre acele linii.
    //
    // Suma 38429.40 rateaza subtotalul tiparit 50336.40 cu 11907.00, la o
    // toleranta de 0.07, iar ANTETUL SE ADUNA CU EL INSUSI: 50336.40 + 10067.28
    // este exact 60403.68 si 50336.40 ori 20% este exact 10067.28. Deci bratul
    // nostru este line_sum_missed si codul nostru este reconciliation_failed.
    const r = await post(
      request,
      matnord(orderId, 38429.4, { status: "partial", error_code: "unreadable_document" }),
    );
    expect(r.status(), "payload-ul respecta contractul").toBe(202);

    const d = await draftState(request, orderId);
    // 1. AL LUI ESTE CE SE PASTREAZA.
    expect(d.error_code, "codul expeditorului este autoritar").toBe("unreadable_document");
    expect(d.status, "statusul lui nu este mutat de verdictul nostru").toBe("partial");
    // 2. AL NOSTRU ESTE SCRIS ALATURI, NU IN LOC.
    expect(d.platform_error_code, "verdictul nostru se inregistreaza").toBe(
      "reconciliation_failed",
    );
    // 3. SI BRATUL, fiindca cinci din cele sase brate poarta acelasi cod si
    //    codul singur nu poate spune DE CE.
    expect(d.platform_arm).toBe("line_sum_missed");
    // 4. CELE DOUA CHIAR NU SUNT DE ACORD, altfel cazul nu dovedeste nimic.
    expect(d.platform_error_code).not.toBe(d.error_code);
    // LINIILE UNUI `partial` RAMAN. EXT-15 scoate liniile unei SCANARI ESUATE, si
    // acesta nu este esuat: verdictul nostru nu are voie sa mute statusul.
    expect(d.lines.length, "un partial isi pastreaza liniile citite").toBe(7);
  });

  test("28. EXT-26: clasificarea noastra RULEAZA pe un payload care a venit cu un cod, ceea ce inainte nu se intampla", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { orderId } = await orderWithDocument(page, "ext26runs");

    // Antetul EXT-20, fara cheia lines. Pana la EXT-26 clasificarea noastra nu
    // rula deloc aici, fiindca poarta cerea `status === "extracted"`.
    const r = await post(request, scanFailureHeader(orderId));
    expect(r.status()).toBe(202);

    const d = await draftState(request, orderId);
    expect(d.error_code, "codul lui, neatins").toBe("unreadable_document");
    // Zero linii, deci bratul nostru este no_lines. Se NIMERESTE sa fie acelasi
    // cod, si tocmai de aceea bratul este campul care spune ceva: fara el nu s-ar
    // putea distinge un acord de o coincidenta.
    expect(d.platform_arm, "clasificarea a rulat").toBe("no_lines");
    expect(d.platform_error_code).toBe("unreadable_document");
  });

  test("29. EXT-26: un payload DIGITAL nu poarta niciun verdict al nostru, si null inseamna NU A RULAT", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { orderId } = await orderWithDocument(page, "ext26dig");

    // Aceeasi aritmetica gresita ca la cazul 27, declarata digital. Acolo cifrele
    // vin din text si o nepotrivire inseamna altceva, deci nu judecam nimic.
    const r = await post(request, matnord(orderId, 38429.4, { document_source: "digital" }));
    expect(r.status()).toBe(202);

    const d = await draftState(request, orderId);
    expect(d.status, "calea digitala ramane neatinsa").toBe("extracted");
    expect(d.error_code).toBeNull();
    // AMANDOUA NULL. Daca una ar fi scrisa si cealalta nu, un cititor nu ar putea
    // spune daca am judecat documentul si nu am gasit nimic, sau nu l-am judecat.
    expect(d.platform_error_code, "null inseamna nu a rulat").toBeNull();
    expect(d.platform_arm).toBeNull();
  });

  test("30. EXT-26: fara niciun cod trimis, al nostru il furnizeaza in continuare, exact ca la EXT-23", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { orderId } = await orderWithDocument(page, "ext26ours");

    // Scanare `extracted`, deci contractul interzice un error_code si nu vine
    // niciunul. Comportamentul EXT-23 este neschimbat, si acest caz este ce
    // dovedeste ca EXT-26 nu l-a inlocuit cu precedenta expeditorului.
    const r = await post(request, matnord(orderId, 38429.4));
    expect(r.status()).toBe(202);

    const d = await draftState(request, orderId);
    expect(d.status, "al nostru muta statusul cand nu exista niciunul al lui").toBe("failed");
    expect(d.error_code, "al nostru furnizeaza codul").toBe("reconciliation_failed");
    expect(d.platform_error_code, "si este inregistrat si ca al nostru").toBe(
      "reconciliation_failed",
    );
    expect(d.platform_arm).toBe("line_sum_missed");
    expect(d.lines).toHaveLength(0);
  });

  test("21. EXT-19: un esec de reconciliere se stocheaza ca reconciliation_failed si NU ca unreadable_document", async ({
    page,
    request,
  }) => {
    // EXT-19. Codul stocat este pe ce se ramifica ecranul, deci cele doua nu au
    // voie sa se amestece la scriere. Un document perfect lizibil ale carui
    // numere nu se aduna NU este un document ilizibil, iar a-l eticheta asa il
    // trimite pe operator sa incarce inca o data aceeasi scanare buna.
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { orderId } = await orderWithDocument(page, "e19code");

    const r = await post(request, matnord(orderId, 49035.4));
    expect(r.status()).toBe(202);
    const d = await draftState(request, orderId);
    expect(d.status).toBe("failed");
    expect(d.error_code).toBe("reconciliation_failed");
    expect(d.error_code, "un esec de aritmetica nu este un document ilizibil").not.toBe(
      "unreadable_document",
    );
  });

  // -------------------------------------------------------------------------
  // EXT-20. FORMA EXACTA A UNEI SCANARI ESUATE: ANTETUL, SI NICIO CHEIE `lines`.
  //
  // NICIO CHEIE, NU UN TABLOU GOL. Un tablou gol este un lucru pe care un ecran
  // il poate parcurge, la care poate adauga si in jurul caruia poate creste un
  // formular. O cheie absenta nu este. Regula va parea pedanta peste sase luni si
  // nu este: in ziua in care cineva adauga o bucla de randare pe ecranul acela,
  // bucla are ce parcurge si nu randeaza nimic, ceea ce se citeste ca "documentul
  // nu avea linii" in loc de "documentul nu a fost citit".
  // -------------------------------------------------------------------------

  /** Antetul unei scanari esuate, in forma pe care o da proprietarul, si FARA
   *  cheia `lines`. Cele saisprezece campuri sunt enumerate explicit in loc sa
   *  fie derivate din callbackBody, fiindca forma insasi este ce dovedeste cazul:
   *  o fixtura care sterge o cheie dintr-un obiect mai mare nu arata unui cititor
   *  CE anume trimite Andre. */
  function scanFailureHeader(orderId: string, over: Record<string, unknown> = {}) {
    return {
      order_id: orderId,
      status: "failed",
      error_code: "unreadable_document",
      reason: "Scanarea nu a putut fi citita.",
      supplier_name: "Matnord SRL",
      // order_ref SI client_ref SUNT IN FORMA PROPRIETARULUI SI NU SUNT CITITE
      // DE NOI ASTAZI. Sectiunea 2 din contract spune ca un camp care soseste si
      // nu este in contract este IGNORAT, niciodata ghicit, deci prezenta lor
      // aici este exact ce se intampla in productie. EXT-11 si P3-31 sunt
      // cardurile care le dau o forma.
      order_ref: "AV-0021884",
      client_ref: "RC-2026-0042",
      order_date: "2026-08-30",
      currency: "MDL",
      currency_raw: "lei",
      prices_include_vat: false,
      vat_rate: 20.0,
      subtotal: 50336.4,
      vat_amount: 10067.28,
      document_total: 60403.68,
      document_source: "scan",
      ...over,
    };
  }

  test("22. EXT-20: antetul cu cele saisprezece campuri si FARA cheia lines este acceptat", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { orderId } = await orderWithDocument(page, "e20ok");

    const body = scanFailureHeader(orderId);
    expect(Object.prototype.hasOwnProperty.call(body, "lines"), "fixtura nu are voie sa poarte cheia").toBe(false);

    const r = await post(request, body);
    expect(r.status(), "un antet fara cheia lines este acceptat").toBe(202);

    const d = await draftState(request, orderId);
    expect(d.status).toBe("failed");
    expect(d.error_code).toBe("unreadable_document");
    expect(d.document_source).toBe("scan");
    expect(d.lines).toHaveLength(0);
    // ANTETUL SE PASTREAZA, si acela este rostul formei: proprietarul identifica
    // documentul si il bate de mana contra unui total cunoscut.
    expect(d.supplier_name).toBe("Matnord SRL");
    expect(Number(d.subtotal)).toBe(50336.4);
    expect(Number(d.vat_amount)).toBe(10067.28);
    expect(Number(d.document_total)).toBe(60403.68);
    expect(Number(d.vat_rate)).toBe(20);
    expect(d.currency).toBe("MDL");
    expect(d.order_date).toBe("2026-08-30");
  });

  test("23. EXT-20: acelasi antet cu un tablou GOL de linii este RESPINS", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { orderId } = await orderWithDocument(page, "e20empty");

    const r = await post(request, scanFailureHeader(orderId, { lines: [] }));
    expect(r.status(), "un tablou gol este tot o cheie").toBe(400);

    // SI NU S-A SCRIS NIMIC. Un 400 care ar fi scris pe jumatate ar fi mai rau
    // decat unul care accepta, fiindca ar minti in amandoua directiile.
    const d = await draftState(request, orderId);
    expect(d.status, "un payload respins nu are voie sa scrie").toBeNull();
  });

  test("24. EXT-20: acelasi antet cu O SINGURA linie este RESPINS", async ({ page, request }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { orderId } = await orderWithDocument(page, "e20one");

    const r = await post(
      request,
      scanFailureHeader(orderId, {
        lines: [{ product_name: "Linie care nu are voie sa fie aici", quantity: 1, line_total: 1 }],
      }),
    );
    expect(r.status()).toBe(400);
    const d = await draftState(request, orderId);
    expect(d.status).toBeNull();
  });

  test("25. EXT-20: un esec DIGITAL care poarta cheia lines este in continuare acceptat", async ({
    page,
    request,
  }) => {
    // MARTORUL, SI FARA EL CELE DOUA DE MAI SUS NU DOVEDESC NIMIC. O
    // implementare care ar respinge cheia `lines` pe ORICE esec ar trece 23 si 24
    // si ar rupe calea digitala. Regula ingusteaza UN SINGUR caz: sectiunea 4.1
    // spune ca `lines` este non-nullable si poate fi gol pe `failed`, si asta
    // ramane adevarat peste tot altundeva.
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);

    {
      const { orderId } = await orderWithDocument(page, "e20dig");
      const r = await post(
        request,
        scanFailureHeader(orderId, { document_source: "digital", lines: [] }),
      );
      expect(r.status(), "un esec digital cu tablou gol ramane acceptat").toBe(202);
      const d = await draftState(request, orderId);
      expect(d.status).toBe("failed");
      expect(d.document_source).toBe("digital");
      expect(d.lines).toHaveLength(0);
    }

    // SI UN `partial` DE SCANARE NU ESTE ATINS. Regula numeste `failed`, si un
    // partial de scanare isi pastreaza liniile citite exact ca pana acum.
    {
      const { orderId } = await orderWithDocument(page, "e20part");
      const r = await post(
        request,
        scanFailureHeader(orderId, {
          status: "partial",
          error_code: "extraction_failed",
          lines: [
            {
              product_name: "Linie citita dintr-un partial de scanare",
              quantity: 2,
              unit: "pcs",
              unit_raw: "buc",
              unit_price: 10,
              line_total: 20,
              currency: "MDL",
              currency_raw: "lei",
              category: null,
              category_raw: null,
            },
          ],
        }),
      );
      expect(r.status(), "un partial de scanare nu este atins de aceasta regula").toBe(202);
      const d = await draftState(request, orderId);
      expect(d.status).toBe("partial");
      expect(d.lines).toHaveLength(1);
    }
  });

  // -------------------------------------------------------------------------
  // EXT-11. SERIA DOCUMENTULUI FURNIZORULUI, NU NUMAI NUMARUL LUI.
  //
  // In facturarea moldoveneasca seria face parte din identificator: doi
  // furnizori pot emite amandoi numarul 0009312, iar `TG 0009312` si
  // `AV 0009312` sunt doua documente diferite. Pana la acest card noi stocam
  // NIMIC din referinta furnizorului: sectiunea 4.1a din contract spune ca
  // `order_ref` soseste, este acceptat si este IGNORAT. Un identificator pe care
  // il aruncam nu poate ciocni, si de aceea defectul nu se vedea nicaieri.
  //
  // ACESTE DOUA CAZURI PICA INAINTE DE SCHIMBARE, si asta este dovada ceruta de
  // linia de acceptare a cardului: fara migratia 0036 coloanele nu exista, deci
  // `d.order_ref` si `d.order_ref_series` sosesc `undefined` de pe GET.
  // -------------------------------------------------------------------------

  test("25. EXT-11: seria si numarul furnizorului se stocheaza separat si se citesc inapoi", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { orderId } = await orderWithDocument(page, "e11serie");

    const r = await post(
      request,
      callbackBody(orderId, { order_ref: "0009312", order_ref_series: "TG" }),
    );
    expect(r.status(), "un payload cu serie este acceptat").toBe(202);

    const d = await draftState(request, orderId);
    expect(d.order_ref, "numarul documentului furnizorului").toBe("0009312");
    expect(d.order_ref_series, "seria documentului furnizorului").toBe("TG");

    // SERIA NU SE LIPESTE DE NUMAR. Doua fapte, doua coloane: un ecran care le
    // vrea impreuna le poate alatura, iar unul care cauta dupa numar nu poate
    // dezlipi ce a fost concatenat la scriere.
    expect(d.order_ref, "seria nu are voie sa intre in numar").not.toContain("TG");
  });

  test("26. EXT-11: un callback FARA serie este acceptat si seria ramane goala", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { orderId } = await orderWithDocument(page, "e11faraserie");

    // DEFAULTS, VERBATIM: nu orice document poarta o serie, iar un document fara
    // serie nu este un document stricat. Si: partea lui Andre si a noastra nu se
    // desfasoara in aceeasi secunda, deci payload-ul versiunii precedente, cel
    // care nu cunoaste deloc campul, trebuie sa treaca neatins.
    const r = await post(request, callbackBody(orderId, { order_ref: "0009312" }));
    expect(r.status(), "absenta seriei nu este o eroare").toBe(202);

    const d = await draftState(request, orderId);
    expect(d.order_ref).toBe("0009312");
    expect(d.order_ref_series, "seria absenta este NULL, nu un sir gol").toBeNull();
  });

});

// ---------------------------------------------------------------------------
// EXT-21. RUTA DE STARE, /api/state.
//
// Patru cazuri, unul per clauza a acceptantei cardului. INAINTE DE ACEST CARD
// TOATE PATRU PICA PE ACELASI MOTIV: ruta nu exista, deci raspunsul este 404 si
// nici macar nu este JSON.
//
// NEAUTENTIFICAT INSEAMNA NEAUTENTIFICAT. Se foloseste fixture-ul `request`, care
// este un context propriu, fara cookie-urile paginii, fiindca playwright.config
// nu ii da niciun storageState. Cazul 3 il si dovedeste: aceeasi cerere fara
// sesiune primeste 200, nu o redirectare catre ecranul de autentificare.
// ---------------------------------------------------------------------------

/**
 * Cuvintele care NU au voie sa apara in raspuns, in engleza si in romana.
 *
 * LISTA DE INTERZICERI PESTE CORPUL BRUT, NU O CITIRE A LUI, fiindca asa cere
 * cardul si fiindca o citire trece cu bine peste chiar campul pe care nimeni nu
 * s-a gandit sa il caute. Al treilea camp adaugat aici este un nume de furnizor,
 * si atunci acest test se face rosu inainte sa ajunga la Andre.
 *
 * Baza de date pe care ruleaza suita ARE toate aceste lucruri: seed-urile scriu
 * clienti, proiecte, furnizori, produse si comenzi. Absenta lor din raspuns este
 * deci o afirmatie despre ruta, nu despre o baza goala.
 */
const STATE_DENY = [
  "supplier",
  "furnizor",
  "product",
  "produs",
  "order",
  "comand",
  "price",
  "pret",
  "preț",
  "client",
  "sku",
  "quantity",
  "cantitate",
  "invoice",
  "factur",
  "batch",
];

test.describe("EXT-21 ruta de stare", () => {
  test("1. o cerere NEAUTENTIFICATA primeste 200 cu categoriile active, unitatile si versiunea", async ({
    request,
  }) => {
    const response = await request.get("/api/state");

    // 200 SI NU O REDIRECTARE. Fara linia din proxy.ts ruta ar raspunde 307
    // catre /login, iar un client care urmareste redirectarile ar primi 200 si
    // text/html, adica un cod de succes pentru o pagina de autentificare.
    expect(response.status(), "ruta trebuie sa fie publica").toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");

    const body = await response.json();

    // TREI CAMPURI SI AL PATRULEA ESTE CEASUL. Comparatia este pe multimea de
    // chei, nu pe prezenta lor: un camp adaugat face testul rosu, ceea ce este
    // exact rostul lui.
    expect(Object.keys(body).sort()).toEqual(["at", "categories", "ledger_version", "units"]);

    expect(Array.isArray(body.categories)).toBe(true);
    expect(body.categories.length).toBeGreaterThanOrEqual(19);
    expect(body.categories).toContain("Cimenturi și mortare");
    expect(body.categories).toContain("Vopsele, lacuri și solvenți");
    for (const name of body.categories) expect(typeof name).toBe("string");

    expect(Array.isArray(body.units)).toBe(true);
    expect(body.units.length).toBeGreaterThanOrEqual(9);
    for (const u of body.units) expect(Object.keys(u).sort()).toEqual(["code", "label"]);
    const codes = body.units.map((u: { code: string }) => u.code);
    // t si l sunt chiar cele doua valori pe care Andre le-a tinut pe loc o zi.
    expect(codes).toEqual(expect.arrayContaining(["m2", "lm", "pcs", "bag", "kg", "roll", "m3", "t", "l"]));
    expect(body.units.find((u: { code: string }) => u.code === "pcs")?.label).toBe("buc");

    // VERSIUNEA REGISTRULUI, CITITA DIN BAZA DE DATE. null se citeste "nu stiu"
    // si nu "niciuna", exact ca la /api/health, deci tipul este verificat si
    // valoarea nu este presupusa.
    expect(["string", "object"]).toContain(typeof body.ledger_version);
    if (body.ledger_version !== null) expect(String(body.ledger_version).length).toBeGreaterThan(0);

    expect(new Date(body.at).toString()).not.toBe("Invalid Date");
  });

  test("2. raspunsul NU poate fi pastrat in memorie intermediara", async ({ request }) => {
    const response = await request.get("/api/state");
    expect(response.status()).toBe(200);
    // Un raspuns servit din cache la intrebarea "ce acceptati ACUM" ar raporta
    // starea de dinaintea ultimei migratii, si ar face-o cu 200.
    expect(response.headers()["cache-control"]).toContain("no-store");
  });

  test("3. raspunsul nu poarta niciun camp de client, furnizor, produs, comanda sau pret", async ({
    request,
  }) => {
    const response = await request.get("/api/state");
    expect(response.status()).toBe(200);
    const raw = (await response.text()).toLowerCase();
    for (const word of STATE_DENY) {
      expect(raw, `raspunsul contine "${word}", deci poarta date care nu sunt vocabular`).not.toContain(
        word,
      );
    }
  });

  test("4. o categorie adaugata din ecranul de setari apare in raspuns FARA o desfasurare", async ({
    page,
    request,
  }) => {
    // NUME UNIC PE RULARE, ca stadiul "inainte" sa fie o absenta reala si nu o
    // ramasita de la o rulare anterioara pe o baza care nu a fost resetata.
    const fresh = `TEST-Vocabular-${RUN}`;

    // INAINTE: ruta nu il stie.
    const before = await (await request.get("/api/state")).json();
    expect(before.categories).not.toContain(fresh);

    // Se adauga prin ECRAN, nu prin baza de date, fiindca asta cere cardul: ce
    // se schimba este starea productiei, nu o unealta de test.
    await signIn(page, ownerAccount());
    await page.goto("/setari");
    await page.getByTestId("category-name").fill(fresh);
    await page.getByTestId("category-add").click();
    await expect(
      page.locator(`[data-testid="category-row"][data-name="${fresh}"]`),
    ).toHaveCount(1, { timeout: 20_000 });

    // DUPA: acelasi server, acelasi build, niciun restart intre cele doua
    // cereri. Daca lista ar fi o constanta compilata, aceasta linie ar pica.
    const after = await (await request.get("/api/state")).json();
    expect(after.categories).toContain(fresh);
    expect(after.categories.length).toBe(before.categories.length + 1);
  });
});
