import { expect, test, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// order-document-type.spec - linia de acceptanta a cardului P3-98 pentru
// constatarea F18 a maturarii din 2026-09-22.
//
// CE AFIRMA. Casuta "Atașează document" de pe o comanda judeca felul fisierului
// dupa ce este, nu dupa sirul exact pe care l-a nimerit sistemul de operare:
//   - un .pdf pe care browserul il da FARA niciun tip este primit;
//   - un .jpg dat ca `image/jpg`, aliasul pe care il scriu unele sisteme, este
//     primit;
//   - un fel chiar gresit este refuzat mai departe, cu mesajul romanesc.
//
// CUM SE FACE UN FISIER FARA TIP, SI DE CE NU CU setInputFiles. Playwright NU
// poate produce cazul: `setInputFiles({ mimeType: "" })` pune singur un tip
// dedus din extensie, si pe `factura.pdf` ajunge `application/pdf`, adica exact
// cazul care mergea si inainte (masurat local pe Chromium 1.62.1). Fisierul se
// construieste deci in pagina, cu `new File([octeti], nume)` fara al treilea
// argument, si se aseaza pe input printr-un DataTransfer, urmat de evenimentul
// `change` care porneste acelasi handler pe care il porneste si omul. Cazul isi
// verifica intai PREMISA, ca `files[0].type` chiar este sirul gol: fara asta ar
// putea trece degeaba, pe alt drum decat cel descris.
//
// DATELE DE TEST NU SE STERG NICIODATA. Produsele si comenzile poarta prefixul
// TEST si un sufix unic pe rulare, si raman in baza.

const TEST_CATEGORY = "TEST-Categorie";
const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const WRONG_KIND = "Se acceptă doar PDF, PNG sau JPG.";
/** FILE_EMPTY_LABEL din components/ui/FilePicker.tsx, scris aici din nou: un
 *  component .tsx cu React nu se importa intr-un spec. */
const NO_FILE = "Niciun fișier ales";

/** Un PDF minimal, acelasi ca in inbound.spec. */
function pdfBytes(): Buffer {
  return Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
}

/** Inceputul unui JPEG: marcajul SOI plus un antet JFIF. Serverul nu adulmeca
 *  octetii, dar un fisier care nu seamana deloc cu ce spune ca este nu are ce
 *  cauta intr-un test despre feluri de fisiere. */
function jpegBytes(): Buffer {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);
}

async function ensureTestCategory(page: Page) {
  await page.goto("/setari");
  const existing = page.locator(`[data-testid="category-row"][data-name="${TEST_CATEGORY}"]`);
  if ((await existing.count()) > 0) return;
  await page.getByTestId("category-name").fill(TEST_CATEGORY);
  await page.getByTestId("category-add").click();
  await expect(existing).toHaveCount(1, { timeout: 15_000 });
}

async function makeProduct(page: Page, tag: string): Promise<string> {
  const sku = `TEST-F18-${tag}-${RUN}`;
  await page.goto("/inventar");
  await page.getByTestId("product-new").click();
  await page.getByTestId("field-sku").fill(sku);
  await page.getByTestId("field-name").fill(`Produs F18 ${tag}`);
  await page.getByTestId("field-category").selectOption({ label: TEST_CATEGORY });
  await page.getByTestId("field-unit").selectOption("pcs");
  await page.getByTestId("field-unit-value").fill("10");
  await page.getByTestId("form-submit").click();
  await expect(page.locator(`[data-testid="product-row"][data-sku="${sku}"]`)).toHaveCount(1, {
    timeout: 20_000,
  });
  return sku;
}

/** O comanda manuala cu o pozitie. Lasa ecranul pe confirmare, adica exact
 *  acolo unde sta casuta "Atașează document". */
async function createOrderAndStay(page: Page, sku: string) {
  await page.goto("/adauga-manual");
  await expect(page.getByTestId("inbound-form")).toBeVisible({ timeout: 25_000 });
  await page.getByTestId("order-supplier").fill(`TEST Furnizor F18 ${RUN}`);
  await page.getByTestId("order-expected-at").fill("2026-12-01");
  const option = page.getByTestId("line-product-0").locator("option").filter({ hasText: sku });
  await page.getByTestId("line-product-0").selectOption((await option.getAttribute("value")) ?? "");
  await page.getByTestId("line-quantity-0").fill("2");
  await page.getByTestId("line-price-0").fill("5");
  await page.getByTestId("order-confirm").click();
  await expect(page.getByTestId("order-created")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId("doc-upload")).toBeVisible();
}

/** Aseaza pe input un fisier construit in pagina, FARA tip, si intoarce ce tip
 *  vede pagina inainte de a porni handlerul. */
async function typeOfPlacedFile(page: Page, name: string, bytes: Buffer): Promise<string> {
  return page.getByTestId("doc-input").evaluate(
    (element, payload) => {
      const input = element as HTMLInputElement;
      const binary = atob(payload.base64);
      const octets = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) octets[i] = binary.charCodeAt(i);
      // Fara al treilea argument: `type` ramane sirul gol, ca la un sistem care
      // nu are o potrivire pentru extensie.
      const file = new File([octets], payload.name);
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      return input.files[0]!.type;
    },
    { name, base64: bytes.toString("base64") },
  );
}

/** Porneste handlerul, exact ca alegerea unui fisier de catre om. */
async function fireChange(page: Page) {
  await page
    .getByTestId("doc-input")
    .evaluate((element) => element.dispatchEvent(new Event("change", { bubbles: true })));
}

test.describe("Felul documentului atașat unei comenzi (P3-98, F18)", () => {
  test.describe.configure({ timeout: 150_000 });

  test("F18: un .pdf pe care browserul îl dă fără niciun tip este primit, nu refuzat", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const sku = await makeProduct(page, "pdf");
    await createOrderAndStay(page, sku);

    const seen = await typeOfPlacedFile(page, `TEST-fara-tip-${RUN}.pdf`, pdfBytes());
    expect(seen, "premisa constatării F18: browserul nu dă niciun tip").toBe("");

    await fireChange(page);

    await expect(page.getByTestId("doc-done")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("doc-done")).toHaveText("Document atașat.");
    await expect(page.getByTestId("doc-error")).toHaveCount(0);
  });

  test("F18: un .jpg dat ca image/jpg este primit", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const sku = await makeProduct(page, "jpg");
    await createOrderAndStay(page, sku);

    await page.getByTestId("doc-input").setInputFiles({
      name: `TEST-alias-${RUN}.jpg`,
      mimeType: "image/jpg",
      buffer: jpegBytes(),
    });

    await expect(page.getByTestId("doc-done")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("doc-error")).toHaveCount(0);
  });

  // CELE DOUA REFUZURI STAU IN CAZURI SEPARATE, fiecare pe un ecran curat.
  // Mesajul este acelasi la amandoua, deci pe un singur ecran al doilea refuz nu
  // s-ar putea deosebi de primul, ramas pe ecran.

  test("F18: un tip spus și neacceptat este refuzat mai departe, în română", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const sku = await makeProduct(page, "tip-gresit");
    await createOrderAndStay(page, sku);
    await expect(page.getByTestId("doc-error")).toHaveCount(0);

    // Extensia nu salveaza un tip pe care browserul chiar l-a spus.
    await page.getByTestId("doc-input").setInputFiles({
      name: `TEST-note-${RUN}.txt`,
      mimeType: "text/plain",
      buffer: Buffer.from("nu este un document acceptat"),
    });

    await expect(page.getByTestId("doc-error")).toHaveText(WRONG_KIND);
    await expect(page.getByTestId("doc-chosen")).toHaveText(NO_FILE);
    await expect(page.getByTestId("doc-pending")).toHaveCount(0);
    await expect(page.getByTestId("doc-done")).toHaveCount(0);
  });

  test("F18: un fișier fără tip, cu extensie neacceptată, rămâne refuzat", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const sku = await makeProduct(page, "extensie-gresita");
    await createOrderAndStay(page, sku);
    await expect(page.getByTestId("doc-error")).toHaveCount(0);

    // Drumul nou nu deschide o usa pe care cel vechi o tinea inchisa.
    const seen = await typeOfPlacedFile(page, `TEST-unealta-${RUN}.exe`, Buffer.from("MZ"));
    expect(seen).toBe("");
    await fireChange(page);

    await expect(page.getByTestId("doc-error")).toHaveText(WRONG_KIND);
    await expect(page.getByTestId("doc-chosen")).toHaveText(NO_FILE);
    await expect(page.getByTestId("doc-pending")).toHaveCount(0);
    await expect(page.getByTestId("doc-done")).toHaveCount(0);
  });
});
