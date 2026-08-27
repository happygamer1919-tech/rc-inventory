import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { MAKE_CALLBACK_SECRET, firedFor } from "./support/make";
import { EXTRACTION_ERROR_CODES, EXTRACTION_ERROR_LABEL } from "@/lib/data/extraction-types";

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

function post(request: APIRequestContext, body: unknown) {
  return request.post(CALLBACK, {
    headers: {
      "Content-Type": "application/json",
      "x-rc-callback-secret": MAKE_CALLBACK_SECRET,
    },
    data: body,
  });
}

/** Ciorna citita pe drumul masinii, cu acelasi antet secret ca scrierea. */
async function draftState(request: APIRequestContext, orderId: string) {
  const r = await request.get(`${CALLBACK}?order_id=${orderId}`, {
    headers: { "x-rc-callback-secret": MAKE_CALLBACK_SECRET },
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
    await page.getByTestId("review-confirm").click();

    const created = page.getByTestId("review-created");
    await expect(created).toBeVisible({ timeout: 30_000 });
    const reference = (await created.getAttribute("data-reference")) ?? "";

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
    const orderId = await uploadForExtraction(page, request, "flag");

    // Numele nu exista in catalog si nu seamana cu nimic din el.
    const unknown = `Produs necunoscut extras ${RUN}`;
    expect(
      (
        await post(
          request,
          callbackBody(orderId, {
            lines: [
              {
                product_name: unknown,
                quantity: 3,
                unit: "pcs",
                unit_raw: "buc",
                unit_price: 25.5,
                line_total: 76.5,
                currency: "MDL",
                currency_raw: "lei",
                category: null,
                category_raw: null,
                confidence: 0.8,
              },
            ],
          }),
        )
      ).status(),
    ).toBe(202);

    await page.goto(UPLOAD);
    await openReview(page, orderId);

    // NIMIC NU S-A LIPIT SINGUR PE UN SKU ASEMANATOR: selectorul de produs este
    // gol, si asta este ce face din linie un produs marcat la confirmare.
    await expect(page.getByTestId("review-line-product-0")).toHaveValue("");

    await page.getByTestId("review-expected-at").fill("2026-12-03");
    await page.getByTestId("review-confirm").click();
    await expect(page.getByTestId("review-created")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("review-flagged")).toContainText("marcat");

    // Produsul exista in catalog, cu numele de pe document, VERBATIM, si cu
    // needs_review pus.
    await page.goto("/inventar");
    const product = page.locator(`[data-testid="product-row"][data-name="${unknown}"]`);
    await expect(product).toHaveCount(1, { timeout: 20_000 });
    await expect(product).toHaveAttribute("data-needs-review", "true");
    await expect(product).toContainText("De verificat");
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
});
