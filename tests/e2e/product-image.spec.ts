import { deflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// product-image.spec - linia de acceptanta a cardului P3-56.
//
// Cele cinci cazuri ale cardului, in ordinea lui:
//   1. un produs creat din formular cu o imagine PNG o arata in panou, desenata,
//      intr-un bloc aflat sub Miscari, iar calea din baza este
//      product/<id produs>/<uuid>.png;
//   2. o imagine noua pe formularul de modificare schimba calea, panoul arata
//      imaginea noua, iar obiectul vechi nu mai exista in depozit;
//   3. un GIF si un PDF sunt refuzate cu mesajul romanesc care numeste tipurile
//      acceptate, si nu exista niciun produs cu acel SKU;
//   4. o imagine de 10 MB plus un octet este refuzata cu mesajul romanesc care
//      numeste limita, si nu exista niciun produs cu acel SKU;
//   5. un produs fara imagine arata "Nicio imagine pentru acest produs.".
//
// CE SE CITESTE DIN BAZA SI DIN DEPOZIT SE CITESTE CU CHEIA service_role a stivei
// LOCALE, ca documents.spec: "obiectul vechi nu mai exista" nu se poate dovedi de
// pe ecran.
//
// DATELE DE TEST NU SE STERG NICIODATA, conform conventiei P2-07. Fiecare produs
// creat aici poarta prefixul TEST- in SKU, ca in products.spec. Singura stergere
// este cea pe care o testeaza cazul 2: obiectul vechi, inlocuit de aplicatie.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const MB = 1024 * 1024;
const TEST_CATEGORY = "TEST-Categorie";
const ALLOWED = "JPG, JPEG, PNG, WEBP";

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    throw new Error(
      "product-image.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL si SUPABASE_SERVICE_ROLE_KEY. " +
        "In CI sunt exportate de pasul 'Export local Supabase credentials'. Local: supabase status -o env.",
    );
  }
  return { origin: new URL(url).origin, service };
}

function serviceHeaders() {
  const { service } = env();
  return { apikey: service, Authorization: `Bearer ${service}` };
}

type ProductDbRow = { id: string; sku: string; image_path: string | null };

async function productsWithSku(sku: string): Promise<ProductDbRow[]> {
  const response = await fetch(
    `${env().origin}/rest/v1/products?select=id,sku,image_path&sku=eq.${encodeURIComponent(sku)}`,
    { headers: serviceHeaders() },
  );
  if (!response.ok) {
    throw new Error(`rest products a raspuns ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  return (await response.json()) as ProductDbRow[];
}

/** Statusul obiectului din depozit, citit cu cheia service_role. */
async function objectStatus(path: string): Promise<number> {
  const response = await fetch(`${env().origin}/storage/v1/object/rc-docs/${path}`, {
    headers: serviceHeaders(),
  });
  return response.status;
}

/* ---------------------------------------------------------------- fisiere -- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * UN PNG ADEVARAT, pe care browserul il deseneaza, de width x height pixeli de o
 * singura culoare. Doar semnatura PNG ar trece verificarea de continut, dar nu s-ar
 * desena, iar cazul 1 cere o imagine desenata. Latimea deosebeste imaginea veche
 * de cea noua in cazul 2.
 */
function png(width: number, height: number, rgb: [number, number, number]): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // 8 biti pe canal
  header[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(new Array(width).fill(rgb).flat())]);
  const pixels = Buffer.concat(new Array(height).fill(row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function gif(): Buffer {
  return Buffer.concat([Buffer.from("GIF89a", "ascii"), Buffer.alloc(58, 0)]);
}

function pdf(): Buffer {
  const head = Buffer.from("%PDF-1.4\n% product-image.spec\n");
  return Buffer.concat([head, Buffer.alloc(64, 0x20)]);
}

/* ---------------------------------------------------------------- ecrane -- */

async function ensureTestCategory(page: Page) {
  await page.goto("/setari");
  const existing = page.locator(`[data-testid="category-row"][data-name="${TEST_CATEGORY}"]`);
  if ((await existing.count()) > 0) return;
  await page.getByTestId("category-name").fill(TEST_CATEGORY);
  await page.getByTestId("category-add").click();
  await expect(existing).toHaveCount(1, { timeout: 15_000 });
}

async function openNewProductForm(page: Page, sku: string, name: string) {
  await page.goto("/inventar");
  await page.getByTestId("product-new").click();
  await expect(page.getByTestId("product-form")).toBeVisible();
  await page.getByTestId("field-sku").fill(sku);
  await page.getByTestId("field-name").fill(name);
  await page.getByTestId("field-category").selectOption({ label: TEST_CATEGORY });
}

async function chooseImage(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  await page.getByTestId("field-image-input").setInputFiles(file);
  await expect(page.getByTestId("field-image-chosen")).toHaveText(file.name);
}

/** Trimite formularul si asteapta sa se inchida: salvarea, incarcarea si confirmarea s-au terminat. */
async function submitAndWaitClosed(page: Page) {
  await page.getByTestId("form-submit").click();
  await expect(async () => {
    const error = page.getByTestId("form-error");
    if ((await error.count()) > 0) {
      throw new Error(`formularul a raspuns cu eroare: ${await error.innerText()}`);
    }
    expect(await page.getByTestId("product-form").count()).toBe(0);
  }).toPass({ timeout: 60_000 });
}

async function openPanel(page: Page, sku: string) {
  await page.goto("/inventar");
  await page.locator(`[data-testid="product-row"][data-sku="${sku}"]`).click();
  await expect(page.getByTestId("product-panel")).toBeVisible();
}

/** Latimea imaginii desenate in panou, 0 cat timp nu este desenata. */
function drawnWidth(page: Page): Promise<number> {
  return page
    .getByTestId("panel-image")
    .evaluate((el) => {
      const img = el as HTMLImageElement;
      return img.complete ? img.naturalWidth : 0;
    });
}

function pngPath(productId: string): RegExp {
  return new RegExp(`^product/${productId}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.png$`);
}

test.describe("Imaginea produsului", () => {
  test.describe.configure({ timeout: 180_000 });

  test("1. un produs creat cu imagine o arată în panou, sub Mișcări", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);

    const sku = `TEST-IMG-CREARE-${RUN}`;
    await openNewProductForm(page, sku, "Produs cu imagine");
    await expect(page.getByTestId("field-image")).toContainText("Imagine produs");
    await chooseImage(page, { name: `Poza produs ${RUN}.png`, mimeType: "image/png", buffer: png(40, 20, [200, 60, 40]) });
    await submitAndWaitClosed(page);

    // IN BAZA: calea structurata, in dosarul produsului, fara numele fisierului.
    const [row] = await productsWithSku(sku);
    expect(row, "produsul creat").toBeTruthy();
    expect(row!.image_path).toMatch(pngPath(row!.id));
    expect(await objectStatus(row!.image_path!), "obiectul din depozit").toBe(200);

    // IN PANOU: imaginea desenata, prin ruta /api/documents.
    await openPanel(page, sku);
    const image = page.getByTestId("panel-image");
    await expect(image).toBeVisible({ timeout: 20_000 });
    await expect(image).toHaveAttribute("src", new RegExp(`^/api/documents/rc-docs/product/${row!.id}/`));
    await expect.poll(() => drawnWidth(page), { timeout: 20_000 }).toBe(40);

    // SUB MISCARI, pe toata latimea, si ultimul bloc al panoului.
    const panel = page.getByTestId("product-panel");
    const movements = panel
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: /^Mișcări/ }) });
    const imageSection = panel.getByTestId("panel-image-section");
    const movementsBox = await movements.boundingBox();
    const imageBox = await imageSection.boundingBox();
    expect(movementsBox && imageBox, "cele doua sectiuni").toBeTruthy();
    expect(imageBox!.y).toBeGreaterThanOrEqual(movementsBox!.y + movementsBox!.height - 1);
    expect(Math.abs(imageBox!.width - movementsBox!.width)).toBeLessThanOrEqual(1);
    await expect(panel.locator(":scope > section").last()).toHaveAttribute("data-testid", "panel-image-section");
  });

  test("2. o imagine nouă pe formularul de modificare o înlocuiește, iar obiectul vechi dispare", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);

    const sku = `TEST-IMG-INLOCUIRE-${RUN}`;
    await openNewProductForm(page, sku, "Produs cu imagine înlocuită");
    await chooseImage(page, { name: "Poza veche.png", mimeType: "image/png", buffer: png(40, 20, [200, 60, 40]) });
    await submitAndWaitClosed(page);

    const [before] = await productsWithSku(sku);
    expect(before!.image_path).toMatch(pngPath(before!.id));
    const oldPath = before!.image_path!;
    expect(await objectStatus(oldPath), "obiectul vechi inainte de inlocuire").toBe(200);

    await openPanel(page, sku);
    await expect.poll(() => drawnWidth(page), { timeout: 20_000 }).toBe(40);

    await page.getByTestId("panel-edit").click();
    await expect(page.getByTestId("product-form")).toBeVisible();
    await expect(page.getByTestId("field-image")).toContainText("O imagine nouă o înlocuiește pe cea existentă.");
    await chooseImage(page, { name: "Poza nouă.png", mimeType: "image/png", buffer: png(30, 60, [40, 60, 200]) });
    await submitAndWaitClosed(page);

    // IN BAZA: alta cale, tot in dosarul produsului.
    const [after] = await productsWithSku(sku);
    expect(after!.image_path).toMatch(pngPath(after!.id));
    expect(after!.image_path).not.toBe(oldPath);

    // IN DEPOZIT: obiectul nou exista, cel vechi nu mai exista.
    expect(await objectStatus(after!.image_path!), "obiectul nou").toBe(200);
    expect(await objectStatus(oldPath), "obiectul vechi dupa inlocuire").toBeGreaterThanOrEqual(400);

    // IN PANOU: imaginea noua.
    await openPanel(page, sku);
    const image = page.getByTestId("panel-image");
    await expect(image).toHaveAttribute(
      "src",
      new RegExp(`^/api/documents/rc-docs/${after!.image_path!.replace(/\./g, "\\.")}\\?token=`),
    );
    await expect.poll(() => drawnWidth(page), { timeout: 20_000 }).toBe(30);
  });

  test("3. un tip nepermis este refuzat cu mesaj românesc și nu salvează produsul", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);

    const refused = [
      { tag: "GIF", file: { name: `Poza animată ${RUN}.gif`, mimeType: "image/gif", buffer: gif() } },
      { tag: "PDF", file: { name: `Fișă tehnică ${RUN}.pdf`, mimeType: "application/pdf", buffer: pdf() } },
    ];
    for (const { tag, file } of refused) {
      const sku = `TEST-IMG-TIP-${tag}-${RUN}`;
      await openNewProductForm(page, sku, "Produs cu imagine de tip greșit");
      await chooseImage(page, file);
      await page.getByTestId("form-submit").click();

      await expect(page.getByTestId("form-error")).toHaveText(
        `Tipul imaginii nu este acceptat. Se acceptă doar ${ALLOWED}.`,
        { timeout: 30_000 },
      );
      await expect(page.getByTestId("product-form"), `formularul ramane deschis pentru ${tag}`).toBeVisible();
      expect(await productsWithSku(sku), `niciun produs pentru ${tag}`).toHaveLength(0);
    }
  });

  test("4. o imagine peste 10 MB este refuzată cu limita numită și nu salvează produsul", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);

    const sku = `TEST-IMG-MARIME-${RUN}`;
    await openNewProductForm(page, sku, "Produs cu imagine prea mare");
    const head = png(1, 1, [0, 0, 0]);
    const big = Buffer.concat([head, Buffer.alloc(10 * MB + 1 - head.length, 0)]);
    expect(big.length).toBe(10 * MB + 1);
    await chooseImage(page, { name: `Poza uriașă ${RUN}.png`, mimeType: "image/png", buffer: big });
    await page.getByTestId("form-submit").click();

    await expect(page.getByTestId("form-error")).toHaveText("Imaginea depășește limita de 10 MB.", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("product-form")).toBeVisible();
    expect(await productsWithSku(sku)).toHaveLength(0);
  });

  test("5. un produs fără imagine arată mesajul românesc în panou", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);

    const sku = `TEST-IMG-FARA-${RUN}`;
    await openNewProductForm(page, sku, "Produs fără imagine");

    // CAMPUL ESTE ROMANESC: butonul nativ scrie in engleza, deci este ascuns vizual.
    const field = page.getByTestId("field-image");
    await expect(field).toContainText("Imagine produs");
    await expect(page.getByTestId("field-image-choose")).toHaveText("Alege imaginea");
    await expect(page.getByTestId("field-image-chosen")).toHaveText("Nicio imagine aleasă");
    await expect(field).toContainText(`Se acceptă ${ALLOWED}, de cel mult 10 MB.`);
    const inputBox = await page.getByTestId("field-image-input").boundingBox();
    expect(inputBox === null || (inputBox.width <= 1 && inputBox.height <= 1)).toBe(true);

    await submitAndWaitClosed(page);
    const [row] = await productsWithSku(sku);
    expect(row, "produsul creat").toBeTruthy();
    expect(row!.image_path).toBeNull();

    await openPanel(page, sku);
    await expect(page.getByTestId("panel-image-empty")).toHaveText("Nicio imagine pentru acest produs.", {
      timeout: 20_000,
    });
    await expect(page.getByTestId("panel-image-section")).toContainText("Imagine produs");
    await expect(page.getByTestId("panel-image")).toHaveCount(0);
  });
});
