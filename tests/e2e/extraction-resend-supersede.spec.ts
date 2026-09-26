import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { MAKE_CALLBACK_SECRET, MAKE_MOCK_URL, firedFor } from "./support/make";

// extraction-resend-supersede.spec - linia de acceptanta a cardului P3-103,
// constatarea F25 a lui Ivan, citata in termeni:
//
//   "'Retrimite' leaves the old draft in the queue. Two TEST-R199 documents
//    resent on 2026-09-24 each minted a new order_id (Andre confirmed five
//    executions, five order_ids, three documents), and the original row stayed,
//    so a retried failed read shows twice."
//
// TITLUL CONSTATARII NUMESTE CALEA GRESITA, SI CAZUL 5 DE MAI JOS O DOVEDESTE.
// refireExtraction trimite ACELASI order_id, deliberat: comentariul lui spune ca
// prin regula de idempotenta a contractului rezultatul INLOCUIESTE extragerea
// precedenta in loc sa adauge a doua ciorna, si ca "un order_id nou ar produce
// exact duplicatul pe care cheia de idempotenta exista sa il previna". Butonul nu
// poate deci sa bata un order_id si nu poate lasa un al doilea rand.
//
// Cifrele lui Ivan spun care cale l-a produs: CINCI executii si CINCI
// order_id-uri pentru TREI documente. O retrimitere adauga o executie FARA sa
// adauge un order_id, deci daca butonul ar fi fost apasat macar o data executiile
// ar fi depasit order_id-urile. Sunt egale, deci toate cinci au fost INCARCARI
// noi, iar startExtraction bate randomUUID() la fiecare incarcare.
//
// CE AFIRMA SPECUL. Un document incarcat a doua oara lasa UN rand in coada, nu
// doua. Randul inlocuit ramane in baza, neconfirmat, marcat cu cine si cand,
// legat de cel nou, si se citeste DE PE cel nou, scris "Înlocuit de retrimiterea
// din <data>". Niciun numar de pe ecran nu il mai numara. O ciorna confirmata nu
// se inlocuieste niciodata, iar una la care s-a renuntat este in continuare
// refuzata la retrimitere.
//
// POTRIVIREA ESTE PE BYTES SI NU PE NUMELE FISIERULUI, si cazul 1 o verifica
// direct: a doua incarcare poarta ALT NUME si aceiasi bytes, si inlocuieste.
// Multi furnizori trimit "factura.pdf", iar o potrivire pe nume ar scoate din
// coada un document diferit.
//
// DATELE DE TEST SE INLOCUIESC SAU SE RENUNTA, NU SE STERG. Specul nu sterge
// niciun rand; fiecare fisier poarta eticheta RUN si eticheta cazului, ca bytes-ii
// unui caz sa nu se potriveasca niciodata cu ai altuia.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const CALLBACK = "/api/extraction/callback";
const UPLOAD = "/incarca-comanda";
const MACHINE_RETRIES = 2;

const CANCELLED_REFUSAL = "S-a renunțat la acest document. Nu mai poate fi confirmat sau retrimis.";
const MAPPED_CATEGORY = "Acoperișuri și tablă";

/** Bytes DETERMINISTI PENTRU O ETICHETA. Doua incarcari cu aceeasi eticheta dau
 *  acelasi sha256, ceea ce este chiar lucrul pe care cardul il foloseste; doua
 *  etichete diferite nu se pot potrivi niciodata, nici intre cazuri, nici intre
 *  rulari. */
function pdfBytes(tag: string): Buffer {
  return Buffer.from(
    `%PDF-1.4\n% RC test F25 ${tag}\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
    "utf8",
  );
}

/** Incarca bytes-ii dati sub numele dat si asteapta ca trimiterea sa plece.
 *  Intoarce order_id-ul NOU, citit din ce a primit serverul fals de Make si nu
 *  din ecran: ecranul arata una sau doua fise in timp ce se reimprospateaza, iar
 *  ce a plecat spre extragere nu are nicio ambiguitate. */
async function uploadBytes(
  page: Page,
  request: APIRequestContext,
  filename: string,
  tag: string,
  seen: readonly string[],
): Promise<string> {
  await page.goto(UPLOAD);
  await page.getByTestId("extraction-input").setInputFiles({
    name: filename,
    mimeType: "application/pdf",
    buffer: pdfBytes(tag),
  });

  let fresh = "";
  await expect
    .poll(
      async () => {
        const ids = await firedOrderIdsFor(request, filename);
        fresh = ids.find((id) => !seen.includes(id)) ?? "";
        return fresh;
      },
      { timeout: 30_000 },
    )
    .not.toBe("");
  expect(fresh).toMatch(/^[0-9a-f-]{36}$/i);

  // BARIERA, SI NU O POLITETE. Trimiterea catre Make pleaca INAINTE ca
  // startExtraction sa scrie suma de control si sa marcheze trimiterile mai
  // vechi, deci order_id-ul se stie mai devreme decat se termina actiunea. Fisa
  // noua apare in coada abia dupa router.refresh(), care ruleaza dupa ce actiunea
  // s-a intors, deci asteptarea ei este momentul in care TOATE scrierile acestei
  // incarcari s-au terminat. Fara ea un caz care citeste "superseded_at este
  // gol" l-ar putea citi pur si simplu prea devreme si ar trece degeaba.
  await expect(draftCard(page, fresh), "fisa noua a ajuns in coada").toHaveCount(1, {
    timeout: 30_000,
  });
  return fresh;
}

/** Order_id-urile pe care serverul fals de Make le-a primit pentru un nume de
 *  fisier. `firedFor` filtreaza pe order_id, care este exact ce nu se stie inca
 *  imediat dupa o incarcare, deci lista bruta se citeste aici. */
async function firedOrderIdsFor(request: APIRequestContext, filename: string): Promise<string[]> {
  const r = await request.get(`${MAKE_MOCK_URL}/__fired`);
  if (!r.ok()) return [];
  const body = (await r.json()) as {
    fired: { orderId: string | null; documentFilename: string | null }[];
  };
  return body.fired
    .filter((f) => f.documentFilename === filename && typeof f.orderId === "string")
    .map((f) => String(f.orderId));
}

/** Un payload digital cu o linie, aceeasi forma ca in review.spec. */
function callbackBody(orderId: string, tag: string, over: Record<string, unknown> = {}) {
  return {
    order_id: orderId,
    status: "extracted",
    error_code: null,
    reason: null,
    supplier_name: `Furnizor F25 ${tag} ${RUN}`,
    document_source: "digital",
    order_date: "2026-09-14",
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
        product_name: `Tigla metalica F25 ${tag} ${RUN}`,
        quantity: 240.5,
        unit: "m2",
        unit_raw: "mp",
        unit_price: 76.72,
        line_total: 18450.0,
        currency: "MDL",
        currency_raw: "lei",
        category: null,
        category_raw: "Invelitori",
        confidence: 0.91,
      },
    ],
    _meta: { model: "gpt-4o-mini", prompt_version: "v2.0", page_count: 1, duration_ms: 1200 },
    ...over,
  };
}

function post(request: APIRequestContext, body: unknown) {
  return request.post(CALLBACK, {
    headers: { "Content-Type": "application/json", "x-rc-callback-secret": MAKE_CALLBACK_SECRET },
    data: body,
    maxRetries: MACHINE_RETRIES,
  });
}

/** Randul citit pe drumul masinii: `select *`, deci si cele patru coloane noi. */
async function draftState(request: APIRequestContext, orderId: string) {
  const r = await request.get(`${CALLBACK}?order_id=${orderId}`, {
    headers: { "x-rc-callback-secret": MAKE_CALLBACK_SECRET },
    maxRetries: MACHINE_RETRIES,
  });
  expect(r.status(), "randul exista si se poate citi").toBe(200);
  return (await r.json()) as Record<string, unknown> & { lines: Record<string, unknown>[] };
}

function draftCard(page: Page, orderId: string) {
  return page.locator(`[data-testid="draft-card"][data-order-id="${orderId}"]`);
}

/** Toate order_id-urile din coada, asa cum le vede ecranul. */
async function queueIds(page: Page): Promise<string[]> {
  return page
    .getByTestId("draft-card")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-order-id") ?? ""));
}

/** Renuntarea prin ecran, acelasi drum ca in extraction-cancel-draft.spec. */
async function cancelFromScreen(page: Page, orderId: string, reason: string) {
  await page.goto(UPLOAD);
  const card = draftCard(page, orderId);
  await expect(card).toHaveCount(1, { timeout: 30_000 });
  await card.getByTestId("draft-cancel").click();
  const block = card.getByTestId("draft-cancel-block");
  await expect(block).toBeVisible();
  if (reason) await block.getByTestId("draft-cancel-reason").fill(reason);
  await block.getByTestId("draft-cancel-confirm").click();
  await expect(draftCard(page, orderId)).toHaveCount(0, { timeout: 30_000 });
}

/** Data in forma pe care o scrie ecranul, zz.ll.aaaa, din acelasi sir ISO.
 *  Repetata aici si nu importata din lib/data/format, ca specul sa citeasca
 *  ecranul si nu sa isi confirme propriul ajutor. */
function dayOf(iso: string): string {
  const [y, m, d] = iso.split("T")[0]!.split("-");
  return `${d}.${m}.${y}`;
}

test.describe("G60 F25: un document trimis a doua oara lasa un singur rand in coada", () => {
  test.describe.configure({ timeout: 180_000 });

  test("G60 F25: 1. aceiași bytes încărcați a doua oară lasă UN rând în coadă, iar cel vechi rămâne în bază marcat", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    const tag = `unu-${RUN}`;
    const first = await uploadBytes(page, request, `TEST-F25-unu-${RUN}.pdf`, tag, []);

    // Prima citire cade, adica situatia din constatare: o citire esuata reincercata.
    expect(
      (
        await post(
          request,
          callbackBody(first, tag, {
            status: "failed",
            error_code: "extraction_failed",
            reason: `Documentul nu a putut fi citit ${RUN}`,
          }),
        )
      ).status(),
    ).toBe(202);

    await page.goto(UPLOAD);
    await expect(draftCard(page, first), "documentul este in coada").toHaveCount(1, { timeout: 30_000 });
    const before = await draftState(request, first);
    expect(before.superseded_at, "inainte de a doua trimitere coloana este goala").toBeNull();
    expect(before.document_sha256, "suma de control s-a scris la incarcare").not.toBeNull();

    // A DOUA INCARCARE, CU ALT NUME SI ACEIASI BYTES. Potrivirea este pe bytes.
    const second = await uploadBytes(page, request, `TEST-F25-unu-redenumit-${RUN}.pdf`, tag, [first]);
    expect(second, "o incarcare noua bate un order_id nou").not.toBe(first);

    // UN SINGUR RAND IN COADA, SI ESTE CEL NOU. Aceasta este linia cardului.
    await page.goto(UPLOAD);
    await expect(draftCard(page, second), "trimiterea noua este in coada").toHaveCount(1, {
      timeout: 30_000,
    });
    await expect(draftCard(page, first), "cea veche nu mai este").toHaveCount(0, { timeout: 30_000 });

    // RANDUL VECHI ESTE INCA ACOLO, NESTERS, CU CINE SI CAND.
    const after = await draftState(request, first);
    expect(after.order_id, "randul exista inca").toBe(first);
    expect(after.superseded_at, "superseded_at scris").not.toBeNull();
    expect(after.superseded_by, "legat de trimiterea noua").toBe(second);
    expect(after.superseded_by_user, "cine a incarcat din nou").not.toBeNull();
    expect(after.confirmed_at, "nicio comanda creata").toBeNull();
    expect(after.cancelled_at, "nu s-a renuntat la el").toBeNull();
    expect(after.status, "starea citita ramane cum era").toBe("failed");
    expect(after.reason).toBe(`Documentul nu a putut fi citit ${RUN}`);
    expect(after.document_sha256, "aceiasi bytes, aceeasi suma").toBe(before.document_sha256);

    // Si trimiterea noua nu este inlocuita de nimeni.
    const newer = await draftState(request, second);
    expect(newer.superseded_at, "cea noua nu este inlocuita").toBeNull();
    expect(newer.document_sha256, "poarta aceeasi suma de control").toBe(before.document_sha256);
  });

  test("G60 F25: 2. rândul înlocuit se citește de pe fișa care l-a înlocuit", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    const tag = `doi-${RUN}`;
    const filename = `TEST-F25-doi-${RUN}.pdf`;
    const first = await uploadBytes(page, request, filename, tag, []);
    expect((await post(request, callbackBody(first, tag))).status()).toBe(202);

    const second = await uploadBytes(page, request, filename, tag, [first]);
    const replaced = await draftState(request, first);
    const day = dayOf(String(replaced.superseded_at));

    await page.goto(UPLOAD);
    const card = draftCard(page, second);
    await expect(card).toHaveCount(1, { timeout: 30_000 });

    const block = card.getByTestId("draft-superseded");
    await expect(block, "fisa noua poarta blocul").toHaveCount(1);
    await expect(block).toHaveAttribute("data-count", "1");
    await expect(block.locator("summary")).toHaveText("1 trimitere anterioară înlocuită");

    // PLIAT IMPLICIT: coada ramane curata pana cand cineva intreaba.
    expect(await block.getAttribute("open"), "inchis implicit").toBeNull();
    await block.locator("summary").click();

    const row = block.locator(`[data-testid="superseded-send"][data-order-id="${first}"]`);
    await expect(row, "randul inlocuit este acolo").toHaveCount(1);
    await expect(row.getByTestId("superseded-notice")).toHaveText(
      `Înlocuit de retrimiterea din ${day}`,
    );
    await expect(row, "cu numele documentului inlocuit").toContainText(filename);
    await expect(row.getByTestId("superseded-kept")).toContainText("păstrat, nu a fost șters");

    // PE TELEFON, la 390px, blocul nu iese din ecran.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(UPLOAD);
    const phoneBlock = draftCard(page, second).getByTestId("draft-superseded");
    await expect(phoneBlock).toHaveCount(1, { timeout: 30_000 });
    await phoneBlock.locator("summary").click();
    for (const id of ["draft-superseded-toggle", "superseded-notice", "superseded-kept"]) {
      const box = await phoneBlock.getByTestId(id).first().boundingBox();
      expect(box, `${id} este pe ecran`).not.toBeNull();
      expect(box!.x + box!.width, `${id} nu iese din ecran la 390px`).toBeLessThanOrEqual(390 + 0.5);
    }
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test("G60 F25: 3. niciun număr de pe ecranul de verificare nu numără un document înlocuit", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    const tag = `trei-${RUN}`;
    const filename = `TEST-F25-trei-${RUN}.pdf`;
    const first = await uploadBytes(page, request, filename, tag, []);
    expect((await post(request, callbackBody(first, tag))).status()).toBe(202);
    const second = await uploadBytes(page, request, filename, tag, [first]);

    // Un document la care s-a renuntat, ca sectiunea si numarul ei sa existe.
    const cancelTag = `trei-renuntat-${RUN}`;
    const cancelled = await uploadBytes(
      page,
      request,
      `TEST-F25-trei-renuntat-${RUN}.pdf`,
      cancelTag,
      [],
    );
    await cancelFromScreen(page, cancelled, `Renunțare G60 ${RUN}`);

    await page.goto(UPLOAD);
    await expect(draftCard(page, second)).toHaveCount(1, { timeout: 30_000 });
    await expect(draftCard(page, first)).toHaveCount(0, { timeout: 30_000 });

    // COADA nu il numara.
    const inQueue = await queueIds(page);
    expect(inQueue, "documentul inlocuit nu este in coada").not.toContain(first);
    expect(inQueue, "cel care l-a inlocuit este").toContain(second);

    // SECTIUNEA DOCUMENTELOR LA CARE S-A RENUNTAT nu il numara nici ea, iar
    // numarul din titlul ei este exact numarul randurilor ei.
    const section = page.getByTestId("cancelled-section");
    await expect(section).toHaveCount(1, { timeout: 20_000 });
    if ((await section.getAttribute("open")) === null) await section.locator("summary").click();
    const rows = page.getByTestId("cancelled-card");
    const shown = await rows.count();
    expect(shown).toBeGreaterThanOrEqual(1);
    await expect(section.locator("summary")).toHaveText(
      `Documente la care s-a renunțat (${shown})`,
    );
    const cancelledIds = await rows.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-order-id") ?? ""),
    );
    expect(cancelledIds, "documentul inlocuit nu este printre cele renuntate").not.toContain(first);
    expect(cancelledIds, "cel la care s-a renuntat este").toContain(cancelled);

    // Si randul inlocuit este in continuare in baza, nesters.
    expect((await draftState(request, first)).order_id, "randul exista inca").toBe(first);
  });

  test("G60 F25: 4. o ciornă confirmată nu se înlocuiește niciodată, iar una abandonată este în continuare refuzată la retrimitere", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());

    // --- CONFIRMATA -------------------------------------------------------
    const tag = `patru-${RUN}`;
    const filename = `TEST-F25-patru-${RUN}.pdf`;
    const confirmedId = await uploadBytes(page, request, filename, tag, []);
    expect((await post(request, callbackBody(confirmedId, tag))).status()).toBe(202);

    await page.goto(UPLOAD);
    const card = draftCard(page, confirmedId);
    await expect(card).toHaveCount(1, { timeout: 30_000 });
    await card.getByTestId("draft-review").click();
    await expect(page.getByTestId("review-form")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("review-expected-at").fill("2026-12-01");
    await page.getByTestId("review-line-category-0").selectOption({ label: MAPPED_CATEGORY });
    await page.getByTestId("review-confirm").click();
    await expect(page.getByTestId("review-created")).toBeVisible({ timeout: 30_000 });

    const confirmedRow = await draftState(request, confirmedId);
    expect(confirmedRow.confirmed_at, "ciorna este confirmata").not.toBeNull();

    // ACELASI DOCUMENT, INCARCAT DIN NOU. Nu are ce sa inlocuiasca.
    const afterConfirm = await uploadBytes(page, request, filename, tag, [confirmedId]);
    expect(afterConfirm).not.toBe(confirmedId);
    const stillConfirmed = await draftState(request, confirmedId);
    expect(stillConfirmed.superseded_at, "o ciorna confirmata nu se inlocuieste").toBeNull();
    expect(stillConfirmed.superseded_by).toBeNull();
    expect(stillConfirmed.confirmed_at, "si ramane confirmata").toBe(confirmedRow.confirmed_at);

    // --- ABANDONATA -------------------------------------------------------
    // Fila deschisa cat documentul se mai poate retrimite, renuntare in alta
    // fila, apoi butonul apasat din prima: forma reala a refuzului, aceeasi pe
    // care o foloseste extraction-cancel-draft.spec pentru F15.
    const cancelTag = `patru-renuntat-${RUN}`;
    const cancelledId = await uploadBytes(
      page,
      request,
      `TEST-F25-patru-renuntat-${RUN}.pdf`,
      cancelTag,
      [],
    );
    expect(
      (
        await post(
          request,
          callbackBody(cancelledId, cancelTag, {
            status: "partial",
            error_code: "extraction_failed",
            reason: `O pozitie nu a putut fi citita ${RUN}`,
          }),
        )
      ).status(),
    ).toBe(202);

    await page.goto(UPLOAD);
    const openTab = draftCard(page, cancelledId);
    await expect(openTab).toHaveCount(1, { timeout: 30_000 });
    await expect(openTab.getByTestId("draft-refire")).toHaveText("Retrimite");

    const other = await page.context().newPage();
    await cancelFromScreen(other, cancelledId, `Renunțare G60 caz 4 ${RUN}`);
    await other.close();

    const firedBefore = (await firedFor(request, cancelledId)).length;
    await openTab.getByTestId("draft-refire").click();
    const message = openTab.getByTestId("draft-refire-error");
    await expect(message, "refuzul ajunge pe ecran").toBeVisible({ timeout: 20_000 });
    await expect(message).toHaveText(CANCELLED_REFUSAL);
    expect((await firedFor(request, cancelledId)).length, "nicio trimitere noua").toBe(firedBefore);

    const refused = await draftState(request, cancelledId);
    expect(refused.cancelled_at, "a ramas abandonata").not.toBeNull();
    expect(refused.superseded_at, "si nu a fost inlocuita de nimic").toBeNull();
  });

  test("G60 F25: 5. \"Retrimite\" folosește ACELAȘI order_id, nu adaugă niciun rând, și nu golește callback_at", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    const tag = `cinci-${RUN}`;
    const filename = `TEST-F25-cinci-${RUN}.pdf`;
    const orderId = await uploadBytes(page, request, filename, tag, []);

    // "Partial" este starea pe care fisa arata butonul "Retrimite".
    expect(
      (
        await post(
          request,
          callbackBody(orderId, tag, {
            status: "partial",
            error_code: "extraction_failed",
            reason: `O pozitie nu a putut fi citita ${RUN}`,
          }),
        )
      ).status(),
    ).toBe(202);

    const before = await draftState(request, orderId);
    expect(before.callback_at, "un raspuns a sosit").not.toBeNull();
    const firedBefore = (await firedFor(request, orderId)).length;

    await page.goto(UPLOAD);
    const card = draftCard(page, orderId);
    await expect(card).toHaveCount(1, { timeout: 30_000 });
    const queueBefore = (await queueIds(page)).length;

    await card.getByTestId("draft-refire").click();
    await expect(page.getByTestId("draft-refire-error"), "nimic refuzat").toHaveCount(0);

    // O EXECUTIE IN PLUS, PE ACELASI order_id. Aceasta este premisa constatarii,
    // verificata direct: butonul nu bate niciodata un order_id nou.
    await expect
      .poll(async () => (await firedFor(request, orderId)).length, { timeout: 30_000 })
      .toBe(firedBefore + 1);
    expect(
      await firedOrderIdsFor(request, filename),
      "toate trimiterile acestui document poarta acelasi order_id",
    ).toEqual(Array(firedBefore + 1).fill(orderId));

    // SI NICIUN RAND IN PLUS IN COADA.
    await page.goto(UPLOAD);
    await expect(draftCard(page, orderId)).toHaveCount(1, { timeout: 30_000 });
    expect((await queueIds(page)).length, "coada are exact atatea fise").toBe(queueBefore);

    // callback_at NU SE GOLESTE, pe nicio cale. Receptorul citeste exact acel
    // camp ca sa aleaga intre 202 acceptat si 200 duplicat.
    const after = await draftState(request, orderId);
    expect(after.callback_at, "callback_at neatins").toBe(before.callback_at);
    expect(after.superseded_at, "o retrimitere nu inlocuieste nimic").toBeNull();
    expect(after.confirmed_at, "nicio comanda creata").toBeNull();

    // Datele de test ies din coada: se renunta la document, nu se sterge.
    await cancelFromScreen(page, orderId, `Curățenie după cazul 5 ${RUN}`);
  });
});
