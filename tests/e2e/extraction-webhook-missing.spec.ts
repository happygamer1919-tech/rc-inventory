import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { MAKE_CALLBACK_SECRET, firedFor } from "./support/make";
import {
  EXTRACTION_ERROR_CODES,
  EXTRACTION_ERROR_LABEL,
  EXTRACTION_NOT_STARTED,
} from "@/lib/data/extraction-types";

// extraction-webhook-missing.spec - linia de acceptanta a cardului P3-71,
// constatarea F3 a lui Ivan: "silent upload failure when MAKE_WEBHOOK_URL is
// missing: a visible Romanian error on the upload screen and a named test".
//
// RULEAZA PE AL TREILEA SERVER, care porneste FARA MAKE_WEBHOOK_URL. Proiectul
// "fara-webhook" din playwright.config.ts il numeste, si acel fisier explica de
// ce cazul nu poate fi probat altfel: ramura care se probeaza este exact cea in
// care aplicatia nu face niciun fetch, deci nu exista nimic de mocat.
//
// DEFECTUL, ASA CUM ARATA INAINTE DE ACEST CARD. Incarcarea reusea, fisierul era
// stocat, si atat: fireExtraction se intorcea INAINTE de a scrie randul de
// ciorna, deci `.update(...).eq("order_id", ...)` de la apelant potrivea zero
// randuri. Pe ecran nu aparea nimic: nici macar o ciorna "in lucru". Documentul
// nu pleca nicaieri si nimeni nu afla.
//
// CE AFIRMA FIECARE CAZ, SI DE CE SUNT DOUA. Cazul 1 este calea de incarcare a
// documentului de extragere, /incarca-comanda, care este ecranul pe care il
// numeste constatarea. Cazul 2 este afirmatia de contract care tine ruta
// inghetata din R-202 in afara acestei schimbari, si o face din cod, nu dintr-o
// promisiune scrisa in raport.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const CALLBACK = "/api/extraction/callback";

/** Randul de ciorna, citit prin GET-ul rutei de callback, cu antetul ei secret.
 *  Aceeasi forma ca in extraction.spec: citirea nu este publica. */
async function draftState(request: APIRequestContext, orderId: string) {
  const r = await request.get(`${CALLBACK}?order_id=${orderId}`, {
    headers: { "x-rc-callback-secret": MAKE_CALLBACK_SECRET },
    maxRetries: 2,
  });
  return r.ok() ? await r.json() : null;
}

/** Incarca un document pe /incarca-comanda si intoarce order_id de pe cartonas.
 *
 *  NU PRIMESTE UN NUMAR DE TRIMITERI ASTEPTATE ca ajutorul din extraction.spec:
 *  aici raspunsul este intotdeauna zero, si cazul il afirma el insusi, ca sa fie
 *  o propozitie din test si nu un parametru al ajutorului. */
async function uploadForExtraction(page: Page, tag: string): Promise<string> {
  const filename = `TEST-P371-${tag}-${RUN}.pdf`;
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
  return orderId;
}

test.describe("Extragere fara MAKE_WEBHOOK_URL", () => {
  test.describe.configure({ timeout: 120_000 });

  test("1. P3-71 F3: o incarcare fara MAKE_WEBHOOK_URL esueaza VIZIBIL, romaneste, si nu in tacere", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, "missing");

    // NIMIC NU A PLECAT. Afirmatia este zero trimiteri catre transport, nu o
    // descriere a ei: serverul fals este acelasi pentru toate proiectele suitei,
    // deci o trimitere de pe acest server s-ar vedea acolo.
    expect(
      await firedFor(request, orderId),
      "fara adresa de webhook nu are unde sa plece nimic",
    ).toHaveLength(0);

    // RANDUL EXISTA, SI PANA LA ACEST CARD NU EXISTA DELOC. Acesta este defectul,
    // afirmat direct: fara rand, ecranul nu are ce arata si nimic nu se poate
    // interoga mai tarziu pentru o stare blocata.
    const d = await draftState(request, orderId);
    expect(d, "ciorna trebuie sa existe, altfel esecul este invizibil").not.toBeNull();
    expect(d.status).toBe("failed");
    expect(d.error_code).toBe("config_error");

    // MOTIVUL ESTE ROMANESC SI NUMESTE VARIABILA, pentru cine repara. Numele ei
    // este o eticheta de mediu, nu o valoare: sectiunea 7 din CLAUDE.md permite
    // numele si interzice valoarea, iar aici nu exista nicio valoare de scapat,
    // fiindca variabila lipseste.
    expect(d.reason).toContain("MAKE_WEBHOOK_URL");
    expect(d.reason).toContain("lipsește");
    expect(d.reason, "incarcarea a reusit si documentul este pastrat").toContain("păstrat");

    // PE ECRANUL DE INCARCARE, unde il vede operatorul. Propozitia codului vine
    // din EXTRACTION_ERROR_LABEL, deci testul citeste exact sirul care se
    // randeaza, si nu o a doua copie a lui.
    await page.goto("/incarca-comanda");
    const card = page.locator(`[data-testid="draft-card"][data-order-id="${orderId}"]`);
    await expect(card).toHaveCount(1, { timeout: 30_000 });
    await expect(card.getByTestId("draft-error-sentence")).toHaveText(
      EXTRACTION_ERROR_LABEL.config_error,
    );
    // SI MOTIVUL DE PE RAND, sub ea. Constatarea cere ca eroarea sa fie vizibila
    // si sa vina din extraction_drafts.reason, deci se afirma ca ecranul arata
    // chiar textul stocat, si nu unul construit in componenta.
    await expect(card.getByTestId("draft-reason")).toHaveText(String(d.reason));

    // NICIUN SIR ENGLEZESC PE ECRAN, sectiunea 11 din CLAUDE.md. Tokenul brut al
    // codului nu are voie sa fie textul vazut; el traieste numai in atribut.
    await expect(card.getByTestId("draft-error-sentence")).not.toHaveText(/config_error/);
    await expect(card.getByTestId("draft-error-sentence")).toHaveAttribute(
      "data-error-code",
      "config_error",
    );
  });

  test("2. P3-71 R-202: config_error NU intra in multimea de pe sarma, deci ruta de callback il refuza la fel ca inainte", async ({
    request,
  }) => {
    // DE CE ACEST CAZ EXISTA. Ruta app/api/extraction/callback/route.ts este
    // INGHETATA prin hotararea R-202: nimic nu are voie sa schimbe ce accepta, ce
    // refuza sau ce raspunde, textele de eroare incluse. Ea verifica payload-ul
    // prin isExtractionErrorCode, adica prin EXTRACTION_ERROR_CODES, asa ca a
    // adauga acolo eticheta noua ar fi transformat un callback care o poarta
    // dintr-un 400 intr-un payload acceptat. Eticheta a fost tinuta in afara, in
    // LOCAL_ERROR_CODES, si cazul acesta dovedeste ca a fost tinuta afara pe
    // bune: o promisiune scrisa intr-un raport nu se poate rula.
    expect(
      (EXTRACTION_ERROR_CODES as readonly string[]).includes("config_error"),
      "multimea inchisa a sectiunii 5.2 ramane exact cea dinainte",
    ).toBe(false);
    expect(EXTRACTION_ERROR_CODES).toHaveLength(9);

    // SI RUTA CHIAR REFUZA, cu acelasi 400 si acelasi text ca pana acum. Se
    // trimite cu secretul corect, ca refuzul sa fie despre cod si nu despre
    // autentificare.
    const r = await request.post(CALLBACK, {
      headers: {
        "x-rc-callback-secret": MAKE_CALLBACK_SECRET,
        "content-type": "application/json",
      },
      data: {
        order_id: "f3000000-0000-4000-8000-0000000000ff",
        status: "failed",
        error_code: "config_error",
        reason: "nu are voie sa vina de pe sarma",
        lines: [],
      },
    });
    expect(r.status(), "un cod din afara multimii contractului este 400, ca inainte").toBe(400);
    expect((await r.json()).error).toBe("error_code in afara multimii");
  });

  // P3-85, constatarea F21 a lui Ivan, partea 1: "a refused extraction fire must
  // show failure to the user at upload". Cazurile 1 si 2 de mai sus raman
  // neschimbate. Cele de mai jos afirma ce vede omul IN CLIPA incarcarii: pana la
  // P3-85 actiunea intorcea ok si ecranul nu spunea nimic, desi randul era scris.

  test("3. G40 F21: incarcarea pe /incarca-comanda fara MAKE_WEBHOOK_URL spune pe loc ca citirea nu a pornit, iar ciorna esuata apare in lista", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    const filename = `TEST-G40-draft-${RUN}.pdf`;
    await page.goto("/incarca-comanda");
    await page.getByTestId("extraction-input").setInputFiles({
      name: filename,
      mimeType: "application/pdf",
      buffer: Buffer.from(
        `%PDF-1.4\n% RC test g40 draft\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
        "utf8",
      ),
    });

    // FISA ESUATA APARE FARA NICIO NAVIGARE: asta dovedeste ca ecranul s-a
    // reimprospatat si dupa un esec, nu doar dupa o reusita.
    const card = page.locator('[data-testid="draft-card"]').filter({ hasText: filename });
    await expect(card).toHaveCount(1, { timeout: 30_000 });
    const orderId = (await card.getAttribute("data-order-id")) ?? "";
    expect(orderId).toMatch(/^[0-9a-f-]{36}$/i);

    expect(await firedFor(request, orderId), "nimic nu a plecat catre transport").toHaveLength(0);

    const d = await draftState(request, orderId);
    expect(d, "ciorna exista").not.toBeNull();
    expect(d.status).toBe("failed");
    expect(d.error_code).toBe("config_error");

    // MESAJUL, EXACT: inceputul numit plus motivul stocat pe rand, neschimbat.
    // Ambele se citesc din sursa lor, nu dintr-o a doua copie scrisa in test.
    const banner = page.getByTestId("extraction-error");
    await expect(banner).toBeVisible();
    await expect(banner).toHaveText(`${EXTRACTION_NOT_STARTED}${String(d.reason)}`);
    await expect(banner).toHaveAttribute("role", "alert");
  });

  test("4. G40 F21: documentul atasat unei comenzi fara MAKE_WEBHOOK_URL ramane atasat, dar ecranul spune ca citirea nu a pornit si nu scrie Document atasat", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const sku = await makeProduct(page, "g40doc");
    const reference = await createOrder(page, sku);

    await page.getByTestId("doc-input").setInputFiles({
      name: `TEST-G40-comanda-${RUN}.pdf`,
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"),
    });

    const error = page.getByTestId("doc-error");
    await expect(error).toBeVisible({ timeout: 30_000 });
    // Motivul lui fireExtraction pentru adresa lipsa, neschimbat, dupa inceputul
    // numit. Acelasi text pe care cazul 1 il citeste de pe rand.
    await expect(error).toHaveText(
      `${EXTRACTION_NOT_STARTED}Variabila de mediu MAKE_WEBHOOK_URL lipsește. ` +
        "Documentul a fost încărcat și păstrat, dar nu a fost trimis la extragere.",
    );
    await expect(page.getByTestId("doc-done")).toHaveCount(0);

    // DOCUMENTUL RAMANE ATASAT: nimic nu s-a desfacut din cauza refuzului.
    await page.goto("/comenzi");
    const item = page.locator(`[data-testid="inbound-item"][data-reference="${reference}"]`);
    await expect(item).toHaveCount(1, { timeout: 20_000 });
    await expect(item).toContainText("document atașat");
  });
});

/* ----------------------------------------------- ajutoare pentru cazul 4 -- */

// Aceeasi forma ca in inbound.spec, fiindca acela este ecranul pe care il
// probeaza: o comanda se creeaza intai, apoi i se ataseaza documentul.
const TEST_CATEGORY = "TEST-Categorie";

async function ensureTestCategory(page: Page) {
  await page.goto("/setari");
  const existing = page.locator(`[data-testid="category-row"][data-name="${TEST_CATEGORY}"]`);
  if ((await existing.count()) > 0) return;
  await page.getByTestId("category-name").fill(TEST_CATEGORY);
  await page.getByTestId("category-add").click();
  await expect(existing).toHaveCount(1, { timeout: 15_000 });
}

async function makeProduct(page: Page, tag: string): Promise<string> {
  await ensureTestCategory(page);
  const sku = `TEST-G40-${tag}-${RUN}`;
  await page.goto("/inventar");
  await page.getByTestId("product-new").click();
  await page.getByTestId("field-sku").fill(sku);
  await page.getByTestId("field-name").fill(`Produs G40 ${tag}`);
  await page.getByTestId("field-category").selectOption({ label: TEST_CATEGORY });
  await page.getByTestId("field-unit").selectOption("pcs");
  await page.getByTestId("field-unit-value").fill("10");
  await page.getByTestId("form-submit").click();
  await expect(page.locator(`[data-testid="product-row"][data-sku="${sku}"]`)).toHaveCount(1, {
    timeout: 20_000,
  });
  return sku;
}

async function createOrder(page: Page, sku: string): Promise<string> {
  await page.goto("/adauga-manual");
  await expect(page.getByTestId("inbound-form")).toBeVisible();
  await page.getByTestId("order-supplier").fill(`TEST Furnizor G40 ${RUN}`);
  await page.getByTestId("order-expected-at").fill("2026-12-01");
  const option = page.getByTestId("line-product-0").locator("option").filter({ hasText: sku });
  await page.getByTestId("line-product-0").selectOption((await option.getAttribute("value")) ?? "");
  await page.getByTestId("line-quantity-0").fill("2");
  await page.getByTestId("line-price-0").fill("5");
  await page.getByTestId("order-confirm").click();
  await expect(page.getByTestId("order-created")).toBeVisible({ timeout: 20_000 });
  return (await page.getByTestId("created-reference").innerText()).trim();
}
