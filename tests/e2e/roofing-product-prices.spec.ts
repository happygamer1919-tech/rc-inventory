import { expect, test, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// roofing-product-prices.spec - linia de acceptanta a cardului P3-58.
//
// Cele trei cazuri ale cardului, in ordinea lui:
//   1. alegerea unei combinatii completeaza Valoare unitara (MDL) cu pretul exact
//      al liniei ei din lista Dasterum verificata, iar produsul salvat asa poarta
//      acel pret;
//   2. pretul completat se poate scrie peste inainte de salvare, iar produsul
//      salvat poarta ce a scris operatorul, nu sugestia;
//   3. public.sheet_prices poarta exact 194 preturi, suma lor este cea a listei,
//      si fiecare dintre cele 225 de combinatii isi gaseste pretul dupa
//      price_group, serie, grosime si finisaj.
//
// PRETURILE ASTEPTATE SUNT SCRISE DE MANA, din
// inputs/dasterum-pret-2026-08-07-verificat.csv (verificata de Max 2026-09-15), si
// nu citite din baza: un test care isi ia asteptarea din acelasi loc din care
// ecranul isi ia valoarea ar trece si pe o lista de preturi gresita.
//
// CE SE CITESTE DIN BAZA SE CITESTE CU CHEIA service_role a stivei LOCALE, ca in
// roofing-product-picker.spec: valoarea salvata si tabela de preturi nu se vad pe ecran.
//
// DATELE DE TEST NU SE STERG NICIODATA, conform conventiei P2-07. Fiecare produs
// creat aici poarta prefixul TEST- in SKU, ca in products.spec.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

/** Sapte linii ale listei verificate, cu pretul lor in lei. */
const PICKS = [
  { model: "C-10", series: "Standart Zn", thickness: "0,45 mm", price: "144" },
  { model: "C-10", series: "Standart Zn", thickness: "0,45 mm, Cr matt", price: "134" },
  { model: "PS-8", series: "Standart Zn", thickness: "0,45 mm, W", price: "164" },
  // O singura linie de pret, doua profile: amandoua costa la fel.
  { model: "VP-20", series: "Econom", thickness: "0,30 mm", price: "82" },
  { model: "PK/PS-20", series: "Econom", thickness: "0,30 mm", price: "82" },
  // Singura linie vanduta la bucata.
  { model: "Dastera", series: "Standart Zn", thickness: "0,45 mm, Cr matt", price: "137" },
  { model: "H-57", series: "Zinc (România/Turcia)", thickness: "0,70 mm", price: "253" },
];

const PRICE_COUNT = 194;
const OPTION_COUNT = 225;
const TOTAL_LEI = 26832;

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    throw new Error(
      "roofing-product-prices.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL si SUPABASE_SERVICE_ROLE_KEY. " +
        "In CI sunt exportate de pasul 'Export local Supabase credentials'. Local: supabase status -o env.",
    );
  }
  return { origin: new URL(url).origin, service };
}

async function rest(path: string): Promise<Record<string, unknown>[]> {
  const { origin, service } = env();
  const response = await fetch(`${origin}/rest/v1/${path}`, {
    headers: { apikey: service, Authorization: `Bearer ${service}` },
  });
  if (!response.ok) {
    throw new Error(`rest ${path} a raspuns ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  return (await response.json()) as Record<string, unknown>[];
}

type ProductDbRow = { id: string; sku: string; unit_value_mdl: number | string };

async function productsWithSku(sku: string): Promise<ProductDbRow[]> {
  const rows = await rest(
    `products?select=id,sku,unit_value_mdl&sku=eq.${encodeURIComponent(sku)}`,
  );
  return rows as unknown as ProductDbRow[];
}

/** Cheia unei linii de pret, ca in lib/data/sheet-options.ts. */
function lineKey(priceGroup: unknown, series: unknown, thickness: unknown, finish: unknown): string {
  return `${String(priceGroup)}|${String(series)}|${Number(thickness).toFixed(2)}|${String(finish ?? "")}`;
}

/* ---------------------------------------------------------------- ecrane -- */

async function openNewProductForm(page: Page) {
  await page.goto("/inventar");
  await page.getByTestId("product-new").click();
  await expect(page.getByTestId("product-form")).toBeVisible();
  await expect(page.getByTestId("field-sheet")).toBeVisible();
}

async function pickSheet(page: Page, model: string, series: string, thickness: string) {
  await page.getByTestId("field-sheet-model").selectOption({ label: model });
  await page.getByTestId("field-sheet-series").selectOption({ label: series });
  await page.getByTestId("field-sheet-thickness").selectOption({ label: thickness });
}

/** Trimite formularul si asteapta sa se inchida: salvarea s-a terminat. */
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

test.describe("Prețurile Dasterum pe formularul de produs", () => {
  test.describe.configure({ timeout: 180_000 });

  test("1. alegerea combinației completează valoarea unitară cu prețul liniei ei", async ({ page }) => {
    await signIn(page, ownerAccount());

    const sku = `TEST-PRET-SUGERAT-${RUN}`;
    await openNewProductForm(page);

    // Campul porneste de la zero, ca pana acum.
    await expect(page.getByTestId("field-unit-value")).toHaveValue("0");

    for (const pick of PICKS) {
      await pickSheet(page, pick.model, pick.series, pick.thickness);
      await expect(
        page.getByTestId("field-unit-value"),
        `${pick.model} ${pick.series} ${pick.thickness}`,
      ).toHaveValue(pick.price);
      await expect(page.getByTestId("field-unit-value-note")).toContainText("Dasterum");
    }

    // Salvata asa cum a venit, valoarea sugerata ajunge pe produs.
    await pickSheet(page, "C-10", "Standart Zn", "0,45 mm");
    await expect(page.getByTestId("field-unit-value")).toHaveValue("144");
    await page.getByTestId("field-sku").fill(sku);
    await submitAndWaitClosed(page);

    const [row] = await productsWithSku(sku);
    expect(row, "produsul creat").toBeTruthy();
    expect(Number(row!.unit_value_mdl)).toBe(144);
  });

  test("2. prețul sugerat se poate scrie peste, și se salvează ce a scris operatorul", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());

    const sku = `TEST-PRET-SCRIS-${RUN}`;
    await openNewProductForm(page);
    await pickSheet(page, "C-10", "Standart Zn", "0,45 mm");
    await expect(page.getByTestId("field-unit-value")).toHaveValue("144");

    await page.getByTestId("field-unit-value").fill("150,50");
    // Nota dispare: valoarea nu mai este a listei.
    await expect(page.getByTestId("field-unit-value-note")).toHaveCount(0);

    await page.getByTestId("field-sku").fill(sku);
    await submitAndWaitClosed(page);

    const [row] = await productsWithSku(sku);
    expect(row, "produsul creat").toBeTruthy();
    expect(Number(row!.unit_value_mdl)).toBe(150.5);
    expect(Number(row!.unit_value_mdl)).not.toBe(144);
  });

  test("3. lista de prețuri are cele 194 de linii și acoperă fiecare combinație", async () => {
    // P3-68. LISTA VERIFICATA, FARA RANDURILE TEST-. De la P3-68 proprietarul poate
    // adauga combinatii si preturi din Setari, iar sheet-options-admin.spec adauga pe
    // aceeasi baza locala combinatii al caror model si grup de pret incep cu TEST-.
    // Numaratoarea de mai jos ramane exact cea a listei verificate: 194, 26832 lei si
    // 225. Pana atunci citea toate randurile, fiindca toate erau ale listei.
    const prices = await rest(
      "sheet_prices?select=price_group,series,thickness_mm,finish,price_lei&price_group=not.like.TEST-*",
    );
    expect(prices).toHaveLength(PRICE_COUNT);

    const total = prices.reduce((sum, row) => sum + Number(row.price_lei), 0);
    expect(total).toBe(TOTAL_LEI);

    const byLine = new Map(
      prices.map((row) => [
        lineKey(row.price_group, row.series, row.thickness_mm, row.finish),
        Number(row.price_lei),
      ]),
    );
    expect(byLine.size).toBe(PRICE_COUNT);

    const options = await rest(
      "sheet_options?select=model,series,thickness_mm,finish,price_group&model=not.like.TEST-*",
    );
    expect(options).toHaveLength(OPTION_COUNT);

    const withoutPrice = options.filter(
      (row) => !byLine.has(lineKey(row.price_group, row.series, row.thickness_mm, row.finish)),
    );
    expect(withoutPrice, "combinații fără preț").toHaveLength(0);

    // Linia comuna este un singur pret, si amandoua profilele il citesc.
    for (const model of ["PK/PS-20", "VP-20"]) {
      const option = options.find(
        (row) =>
          row.model === model &&
          row.series === "Econom" &&
          Number(row.thickness_mm) === 0.3 &&
          String(row.finish ?? "") === "",
      );
      expect(option, `${model} Econom 0,30 mm`).toBeTruthy();
      expect(
        byLine.get(lineKey(option!.price_group, option!.series, option!.thickness_mm, option!.finish)),
      ).toBe(82);
    }
  });
});
