import { expect, test } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// inbound.spec - linia de acceptanta a cardului P2-04.
//
// Acopera exact ce numeste cardul: o comanda introdusa manual persista cu
// pozitiile ei; un document se incarca si se poate citi DOAR prin URL semnat;
// receptia creeaza cate un lot pe pozitie si ridica stocul calculat exact cu
// cantitatile receptionate; al doilea clic pe receptie nu creeaza al doilea lot;
// fiecare tranzitie a scris un rand de istoric.
//
// DATELE DE TEST NU SE STERG. Produsele poarta prefixul TEST- si raman in baza;
// comenzile raman si ele, pentru ca o comanda receptionata este istoricul unui
// lot si nu poate disparea fara sa faca stocul de necitit.

const TEST_CATEGORY = "TEST-Categorie";
const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

type Page = import("@playwright/test").Page;

async function ensureTestCategory(page: Page) {
  await page.goto("/setari");
  const existing = page.locator(`[data-testid="category-row"][data-name="${TEST_CATEGORY}"]`);
  if ((await existing.count()) > 0) return;
  await page.getByTestId("category-name").fill(TEST_CATEGORY);
  await page.getByTestId("category-add").click();
  await expect(existing).toHaveCount(1, { timeout: 15_000 });
}

/** Creeaza un produs si intoarce SKU-ul. Stocul lui porneste de la zero. */
async function makeProduct(page: Page, tag: string): Promise<string> {
  const sku = `TEST-IN-${tag}-${RUN}`;
  await page.goto("/inventar");
  await page.getByTestId("product-new").click();
  await page.getByTestId("field-sku").fill(sku);
  await page.getByTestId("field-name").fill(`Produs intrare ${tag}`);
  await page.getByTestId("field-category").selectOption({ label: TEST_CATEGORY });
  await page.getByTestId("field-unit").selectOption("pcs");
  await page.getByTestId("field-unit-value").fill("10");
  await page.getByTestId("form-submit").click();
  await expect(page.locator(`[data-testid="product-row"][data-sku="${sku}"]`)).toHaveCount(1, {
    timeout: 20_000,
  });
  return sku;
}

/** Stocul afisat pentru un SKU, ca numar. "Epuizat" inseamna zero. */
async function stockFor(page: Page, sku: string): Promise<number> {
  await page.goto("/inventar");
  await page.getByTestId("product-search").fill(sku);
  const row = page.locator(`[data-testid="product-row"][data-sku="${sku}"]`);
  await expect(row).toHaveCount(1);
  const text = (await row.innerText()).replace(/ /g, " ");
  if (text.includes("Epuizat")) return 0;
  // Coloana de stoc este a cincea: "123,00 buc".
  const match = text.match(/(\d[\d.,]*)\s*buc/);
  if (!match) return Number.NaN;
  return Number(match[1]!.replace(/\./g, "").replace(",", "."));
}

/** Introduce o comanda manuala cu o singura pozitie. Intoarce referinta. */
async function createOrder(page: Page, productLabelSku: string, quantity: string) {
  await page.goto("/adauga-manual");
  await expect(page.getByTestId("inbound-form")).toBeVisible();
  await page.getByTestId("order-supplier").fill(`TEST Furnizor ${RUN}`);
  await page.getByTestId("order-expected-at").fill("2026-12-01");
  const option = page
    .getByTestId("line-product-0")
    .locator("option")
    .filter({ hasText: productLabelSku });
  await page.getByTestId("line-product-0").selectOption(await option.getAttribute("value") ?? "");
  await page.getByTestId("line-quantity-0").fill(quantity);
  await page.getByTestId("line-price-0").fill("5");
  await page.getByTestId("order-confirm").click();
  await expect(page.getByTestId("order-created")).toBeVisible({ timeout: 20_000 });
  return (await page.getByTestId("created-reference").innerText()).trim();
}

function orderItem(page: Page, reference: string) {
  return page.locator(`[data-testid="inbound-item"][data-reference="${reference}"]`);
}

test.describe("Comenzi de intrare", () => {
  test("o comandă introdusă manual persistă cu pozițiile ei", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const sku = await makeProduct(page, "persist");

    const reference = await createOrder(page, sku, "40");
    expect(reference).toMatch(/^INT-\d{4}-\d{4}$/);

    await page.goto("/comenzi");
    await expect(orderItem(page, reference)).toHaveCount(1);
    await expect(orderItem(page, reference)).toContainText("În așteptare");

    // Reincarcare completa: daca ar fi stat in memoria browserului, ar dispărea.
    await page.reload();
    await orderItem(page, reference).click();
    await expect(page.getByTestId("inbound-panel")).toBeVisible();
    await expect(page.getByTestId("inbound-line")).toHaveCount(1);
    await expect(page.getByTestId("inbound-lines")).toContainText(sku);
  });

  test("recepția creează câte un lot pe poziție și ridică stocul exact cu cantitatea", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const sku = await makeProduct(page, "stock");

    const before = await stockFor(page, sku);
    expect(before).toBe(0);

    const reference = await createOrder(page, sku, "40");

    // Comanda in asteptare nu misca stocul: lotul se creeaza la receptie.
    expect(await stockFor(page, sku)).toBe(0);

    await page.goto("/comenzi");
    await orderItem(page, reference).click();
    await expect(page.getByTestId("inbound-panel")).toBeVisible();
    // Nu se verifica vizibilitatea lui <tbody>: un tbody gol are inaltime zero,
    // deci Playwright il considera ascuns. Se numara randurile.
    await expect(page.getByTestId("inbound-batch")).toHaveCount(0);

    await page.getByTestId("receive-order").click();
    await expect(page.getByTestId("receive-notice")).toContainText("S-au creat 1 lot", {
      timeout: 20_000,
    });
    await expect(page.getByTestId("inbound-batch")).toHaveCount(1);

    expect(await stockFor(page, sku)).toBe(before + 40);
  });

  test("un al doilea clic pe recepție nu creează al doilea lot", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const sku = await makeProduct(page, "idem");
    const reference = await createOrder(page, sku, "25");

    await page.goto("/comenzi");
    await orderItem(page, reference).click();
    await page.getByTestId("receive-order").click();
    await expect(page.getByTestId("receive-notice")).toContainText("S-au creat 1 lot", {
      timeout: 20_000,
    });
    const afterFirst = await stockFor(page, sku);
    expect(afterFirst).toBe(25);

    // Al doilea clic. Idempotenta este garantata de blocajul de rand plus
    // constrangerea unica pe batches.order_line_id din migratia 0001.
    await page.goto("/comenzi");
    await orderItem(page, reference).click();
    await page.getByTestId("receive-order").click();
    await expect(page.getByTestId("receive-notice")).toContainText("era deja recepționată", {
      timeout: 20_000,
    });
    await expect(page.getByTestId("inbound-batch")).toHaveCount(1);

    expect(await stockFor(page, sku)).toBe(afterFirst);
  });

  test("fiecare tranziție a scris un rând de istoric", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const sku = await makeProduct(page, "hist");
    const reference = await createOrder(page, sku, "7");

    await page.goto("/comenzi");
    await orderItem(page, reference).click();

    // Crearea scrie deja primul rand: o comanda al carei istoric incepe la a
    // doua stare nu poate fi auditata inapoi pana la creare.
    await expect(page.getByTestId("history-event")).toHaveCount(1);
    await expect(page.getByTestId("inbound-history")).toContainText("În așteptare");

    await page.getByTestId("receive-order").click();
    await expect(page.getByTestId("receive-notice")).toBeVisible({ timeout: 20_000 });

    await expect(page.getByTestId("history-event")).toHaveCount(2);
    await expect(page.getByTestId("inbound-history")).toContainText("Recepționată");
  });

  test("documentul se încarcă și se citește doar prin legătură semnată", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const sku = await makeProduct(page, "doc");
    const reference = await createOrder(page, sku, "3");

    // Un PDF minimal, valid cat sa aiba tipul corect.
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
    await page.getByTestId("doc-input").setInputFiles({
      name: `confirmare-${RUN}.pdf`,
      mimeType: "application/pdf",
      buffer: pdf,
    });
    await expect(page.getByTestId("doc-done")).toBeVisible({ timeout: 30_000 });

    await page.goto("/comenzi");
    await expect(orderItem(page, reference)).toContainText("document atașat");
    await orderItem(page, reference).click();

    // Legatura semnata se genereaza pe server, la cerere, si apare ca <a href>.
    await page.getByTestId("doc-open").click();
    const link = page.getByTestId("doc-link");
    await expect(link).toBeVisible({ timeout: 30_000 });
    const signed = (await link.getAttribute("href")) ?? "";

    expect(signed).toContain("/storage/v1/object/sign/rc-docs/");
    expect(signed).toContain("token=");

    // BUCKETUL ESTE PRIVAT: aceeasi cale fara semnatura nu returneaza fisierul.
    const unsigned = signed.split("?")[0]!.replace("/object/sign/", "/object/public/");
    const bare = await page.request.get(unsigned);
    expect(bare.ok()).toBe(false);
  });

  test("o comandă fără poziții este refuzată în română", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    await makeProduct(page, "empty");

    await page.goto("/adauga-manual");
    await page.getByTestId("order-supplier").fill("TEST Furnizor");
    await page.getByTestId("order-expected-at").fill("2026-12-01");
    await page.getByTestId("order-confirm").click();

    await expect(page.getByTestId("order-problems")).toContainText(
      "Adaugă cel puțin o poziție cu produs și cantitate.",
    );
    await expect(page.getByTestId("order-created")).toHaveCount(0);
  });

  test("un fișier de tip greșit este refuzat înainte de încărcare", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const sku = await makeProduct(page, "badtype");
    await createOrder(page, sku, "2");

    await page.getByTestId("doc-input").setInputFiles({
      name: "note.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("nu este un document acceptat"),
    });

    await expect(page.getByTestId("doc-error")).toHaveText("Se acceptă doar PDF, PNG sau JPG.");
    await expect(page.getByTestId("doc-done")).toHaveCount(0);
  });
});

// P3-94, CONSTATAREA F8 A MATURARII DIN 2026-09-22. O POZITIE UMPLUTA PE
// JUMATATE ERA ARUNCATA IN TACERE.
//
// Fisa trimitea catre server doar randurile cu produs SI cantitate pozitiva, iar
// singura plangere despre pozitii aparea cand TOATE randurile cadeau. Operatorul
// care umplea trei pozitii din patru si lasa cantitatea celei de a patra goala
// primea ecranul de reusita, iar pozitia a patra disparea fara un cuvant.
//
// Cazurile de mai jos merg pe /adauga-manual. Drumul comenzii tastate din josul
// paginii /incarca-comanda deseneaza ACELASI component, InboundOrderForm cu
// mode="manual" (components/orders/UploadOrderScreen.tsx:104-107), deci aceeasi
// verificare il acopera; nu se dubleaza aici, se spune in raport.
test.describe("G50: o poziție umplută pe jumătate", () => {
  /** Deschide fisa manuala cu antetul completat. Intoarce valoarea optiunii produsului. */
  async function openManualForm(page: Page, sku: string): Promise<string> {
    await page.goto("/adauga-manual");
    await expect(page.getByTestId("inbound-form")).toBeVisible();
    await page.getByTestId("order-supplier").fill(`TEST Furnizor ${RUN}`);
    await page.getByTestId("order-expected-at").fill("2026-12-01");
    const option = page.getByTestId("line-product-0").locator("option").filter({ hasText: sku });
    return (await option.getAttribute("value")) ?? "";
  }

  /** Umple complet pozitia de pe indicele dat. Randul trebuie sa existe deja. */
  async function fillPosition(page: Page, index: number, value: string, quantity: string) {
    await page.getByTestId(`line-product-${index}`).selectOption(value);
    await page.getByTestId(`line-quantity-${index}`).fill(quantity);
    await page.getByTestId(`line-price-${index}`).fill("5");
  }

  test("G50: o poziție cu produs și fără cantitate este refuzată pe nume", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const sku = await makeProduct(page, "halfqty");
    const value = await openManualForm(page, sku);

    // Doua pozitii complete. Acelasi produs pe mai multe randuri este permis:
    // order_lines nu are constrangere de unicitate pe (comanda, produs), iar o
    // comanda poate cumpara acelasi material la doua preturi.
    await fillPosition(page, 0, value, "10");
    await page.getByTestId("order-add-line").click();
    await fillPosition(page, 1, value, "20");

    // A treia: produs ales, cantitate lasata goala. Exact cazul din constatare.
    await page.getByTestId("order-add-line").click();
    await page.getByTestId("line-product-2").selectOption(value);

    await page.getByTestId("order-confirm").click();

    const problems = page.getByTestId("order-problems");
    await expect(problems).toBeVisible();
    await expect(problems).toContainText("Poziția 3 nu are cantitate.");
    // Un singur mesaj: antetul este complet si celelalte doua pozitii sunt bune.
    // Mesajul general NU apare, fiindca exista o pozitie care poate fi numita.
    await expect(problems.locator("li")).toHaveCount(1);
    await expect(problems).not.toContainText("Adaugă cel puțin o poziție cu produs și cantitate.");

    // Salvarea chiar este oprita: nu se ajunge la ecranul de reusita.
    await expect(page.getByTestId("order-created")).toHaveCount(0);

    // Se completeaza cantitatea lipsa si aceeasi comanda trece, cu trei pozitii.
    await page.getByTestId("line-quantity-2").fill("30");
    await page.getByTestId("line-price-2").fill("5");
    await page.getByTestId("order-confirm").click();
    await expect(page.getByTestId("order-created")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("order-created")).toContainText("cu 3 poziții");
  });

  test("G50: o cantitate fără produs ales este refuzată pe nume", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const sku = await makeProduct(page, "halfprod");
    const value = await openManualForm(page, sku);

    await fillPosition(page, 0, value, "10");
    await page.getByTestId("order-add-line").click();
    await fillPosition(page, 1, value, "20");

    // A treia: cantitate tastata, niciun produs ales. Acelasi defect, campurile
    // inversate, aruncat de acelasi filtru.
    await page.getByTestId("order-add-line").click();
    await page.getByTestId("line-quantity-2").fill("7");

    await page.getByTestId("order-confirm").click();

    const problems = page.getByTestId("order-problems");
    await expect(problems).toBeVisible();
    await expect(problems).toContainText("Poziția 3 nu are produs ales.");
    await expect(problems.locator("li")).toHaveCount(1);
    await expect(problems).not.toContainText("Adaugă cel puțin o poziție cu produs și cantitate.");
    await expect(page.getByTestId("order-created")).toHaveCount(0);
  });

  test("G50: un rând complet gol nu oprește salvarea", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const sku = await makeProduct(page, "emptyrow");
    const value = await openManualForm(page, sku);

    await fillPosition(page, 0, value, "10");
    await page.getByTestId("order-add-line").click();
    await fillPosition(page, 1, value, "20");
    await page.getByTestId("order-add-line").click();
    await fillPosition(page, 2, value, "30");

    // Al patrulea rand: adaugat si niciodata atins. Nu este o pozitie umpluta pe
    // jumatate, deci nu se semnaleaza si nu opreste nimic.
    await page.getByTestId("order-add-line").click();

    await page.getByTestId("order-confirm").click();
    await expect(page.getByTestId("order-created")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("order-created")).toContainText("cu 3 poziții");
    const reference = (await page.getByTestId("created-reference").innerText()).trim();

    // Si in baza sunt exact trei pozitii, nu patru.
    await page.goto("/comenzi");
    await orderItem(page, reference).click();
    await expect(page.getByTestId("inbound-panel")).toBeVisible();
    await expect(page.getByTestId("inbound-line")).toHaveCount(3);
  });

  test("G50: fără nicio poziție, mesajul general rămâne", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const sku = await makeProduct(page, "allempty");
    await openManualForm(page, sku);

    // Operatorul a apasat de doua ori pe Adaugă poziție si nu a atins niciun rand.
    await page.getByTestId("order-add-line").click();
    await page.getByTestId("order-add-line").click();

    await page.getByTestId("order-confirm").click();

    const problems = page.getByTestId("order-problems");
    await expect(problems).toContainText("Adaugă cel puțin o poziție cu produs și cantitate.");
    // Niciun rand gol nu este numit: mesajul pe pozitie este pentru jumatati.
    await expect(problems).not.toContainText("Poziția");
    await expect(problems.locator("li")).toHaveCount(1);
    await expect(page.getByTestId("order-created")).toHaveCount(0);
  });
});

// P3-41. ZIUA ALEASA, SCRISA IN CUVINTE LANGA FIECARE CAMP DE DATA.
//
// Campul nativ <input type="date"> aseaza ziua si luna dupa LIMBA BROWSERULUI, nu
// dupa locale-ul paginii si nici dupa lang="ro". Masurat in Chromium cu locale
// ro-RO: tastele 01122026 pastreaza 2026-01-12 cand browserul este in engleza si
// 2026-12-01 cand este lansat cu --lang=ro-RO. Un operator cu browser in engleza
// poate deci salva alta zi decat cea la care se gandeste, fara sa vada nimic.
//
// De aceea cazul NU foloseste browserul din configuratie: lanseaza el unul in
// engleza, explicit. Un browser lansat aici nu se poate cere prin test.use
// intr-un grup, fiindca optiunile de lansare tin de proces, iar la nivelul
// fisierului ar schimba limba pentru toate celelalte cazuri.
//
// P3-49 A SCOS DIVERGENTA DIN RADACINA. Campul nativ nu se mai vede nicaieri;
// in locul lui sta campul romanesc zz.ll.aaaa, care citeste intai ziua pe orice
// browser. Browserul in engleza ramane deci conditia cazului, fiindca sub el se
// vedea greseala, dar prima clauza nu mai fixeaza greseala ca pe un fapt: spune
// ca aceleasi taste stocheaza acum ziua gandita. Textul scris in cuvinte, care
// este chiar subiectul cardului P3-41, se verifica mai jos neschimbat.
test.describe("Data aleasă, scrisă în cuvinte", () => {
  test("fiecare câmp de dată arată în română ziua care se salvează", async ({
    playwright,
    baseURL,
  }) => {
    const browser = await playwright.chromium.launch({ args: ["--lang=en-US"] });
    try {
      const context = await browser.newContext({
        baseURL,
        locale: "ro-RO",
        viewport: { width: 1440, height: 900 },
      });
      const page = await context.newPage();

      await signIn(page, ownerAccount());
      await ensureTestCategory(page);
      const sku = await makeProduct(page, "data");

      await page.goto("/adauga-manual");
      await expect(page.getByTestId("inbound-form")).toBeVisible();

      const orderedAt = page.getByTestId("order-ordered-at");
      const expectedAt = page.getByTestId("order-expected-at");
      const orderedWords = page.getByTestId("order-ordered-at-words");
      const expectedWords = page.getByTestId("order-expected-at-words");

      // Fara nicio data aleasa nu se scrie nicio data, nici una de umplutura.
      await expect(orderedAt).toHaveValue("");
      await expect(expectedAt).toHaveValue("");
      await expect(orderedWords).toHaveCount(0);
      await expect(expectedWords).toHaveCount(0);

      // CLAUZA 1, REFACUTA DE CARDUL P3-49. Pana la P3-49 aici se reproducea
      // divergenta: aceleasi taste 01122027 pastrau 2027-01-12 pe un browser in
      // engleza, si clauza aceasta fixa purtarea aceea ca pe un fapt. P3-49 a
      // scos campul nativ de sub ochii operatorului, deci faptul nu mai exista:
      // campul romanesc citeste intai ziua pe ORICE browser, iar clauza spune
      // acum ce se stocheaza. Nu este o verificare slabita, este verificarea unui
      // defect care a fost reparat.
      await expectedAt.pressSequentially("01122027");
      await expect(expectedAt).toHaveValue("01.12.2027");
      await expect(page.getByTestId("order-expected-at-native")).toHaveValue("2027-12-01");
      await expect(expectedWords).toHaveText("miercuri, 1 decembrie 2027");

      // Restul cazului P3-41 lucreaza pe 12 ianuarie 2027, deci tastele se scriu
      // de aici incolo in ordinea romaneasca. Ce se asteapta pe ecran nu se
      // schimba cu nimic.
      await expectedAt.fill("");
      await expectedAt.pressSequentially("12012027");
      await expect(expectedAt).toHaveValue("12.01.2027");
      await expect(page.getByTestId("order-expected-at-native")).toHaveValue("2027-01-12");

      // Textul scris se vede si spune ziua care chiar se va salva, nu cea gandita.
      await expect(expectedWords).toBeVisible();
      await expect(expectedWords).toHaveText("marți, 12 ianuarie 2027");
      await expect(orderedWords).toHaveCount(0);

      // Al doilea camp, alta data, tot tastata: fiecare text isi urmeaza campul lui.
      // Tot 10 septembrie 2026, tastat acum ziua intai.
      await orderedAt.pressSequentially("10092026");
      await expect(orderedAt).toHaveValue("10.09.2026");
      await expect(page.getByTestId("order-ordered-at-native")).toHaveValue("2026-09-10");
      await expect(orderedWords).toBeVisible();
      await expect(orderedWords).toHaveText("joi, 10 septembrie 2026");
      await expect(expectedWords).toHaveText("marți, 12 ianuarie 2027");

      // Golirea campului optional sterge textul lui si nu atinge celalalt.
      await orderedAt.fill("");
      await expect(orderedAt).toHaveValue("");
      await expect(orderedWords).toHaveCount(0);
      await expect(expectedWords).toHaveText("marți, 12 ianuarie 2027");

      // INTRODUCEREA MERGE CA INAINTE: comanda se salveaza cu data campului
      // optional goala si cu exact ziua scrisa sub livrarea estimata.
      await page.getByTestId("order-supplier").fill(`TEST Furnizor ${RUN}`);
      const option = page.getByTestId("line-product-0").locator("option").filter({ hasText: sku });
      await page.getByTestId("line-product-0").selectOption((await option.getAttribute("value")) ?? "");
      await page.getByTestId("line-quantity-0").fill("4");
      await page.getByTestId("line-price-0").fill("5");
      await page.getByTestId("order-confirm").click();
      await expect(page.getByTestId("order-created")).toBeVisible({ timeout: 20_000 });
      const reference = (await page.getByTestId("created-reference").innerText()).trim();

      await page.goto("/comenzi");
      await expect(orderItem(page, reference)).toContainText("estimat 12.01.2027");
    } finally {
      await browser.close();
    }
  });
});
