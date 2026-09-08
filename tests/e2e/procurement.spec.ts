import { expect, test, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// procurement.spec - linia de acceptanta a cardului P3-18.
//
// Acopera exact ce numeste cardul: proiectele in lead, offer, contract SAU
// active cu deviz ACCEPTAT intra, si un proiect in active cu deviz acceptat
// INTRA; un proiect suspendat sau inchis nu intra nici cu deviz acceptat; un
// proiect al carui singur deviz este ciorna, trimis, respins sau expirat este
// EXCLUS si raportat in numarul de excluse; un proiect fara niciun deviz este
// exclus si RAPORTAT, cu o legatura catre ele; necesarul este suma cantitatilor
// din devizele acceptate MINUS ce s-a emis deja acelor proiecte, podit la zero;
// un proiect care a emis peste estimare contribuie zero si nu un numar negativ;
// deficitul este necesar minus stoc podit la zero, iar un produs cu stoc
// suficient nu are deficit; un produs cerut de doua proiecte se aduna intr-un
// singur rand si proiectele care contribuie se vad pe rand; necesarul este
// defalcat pe stare si NU este ponderat cu probabilitate; fiecare sir vizibil
// este romanesc.
//
// DATELE VIN DIN scripts/seed-test-procurement.mjs SI SUNT FIXE. Aritmetica este
// scrisa in capul acelui fisier si repetata aici.
//
// AFIRMATIILE SUNT PE SKU, NU PE NUMARUL DE RANDURI. Ecranul citeste TOATE
// santierele vii din baza, inclusiv cele semanate de alte carduri, deci un
// numar total de randuri ar fi o afirmatie despre ce altcineva a semanat.

const NEC_01 = "TEST-NEC-01";
const NEC_02 = "TEST-NEC-02";
const NEC_03 = "TEST-NEC-03";
const NEC_04 = "TEST-NEC-04";
const NEC_05 = "TEST-NEC-05";

const PROJECT_LEAD = "7e57c051-0000-4000-8000-000000000701";
const PROJECT_OFFER = "7e57c051-0000-4000-8000-000000000702";
const PROJECT_DRAFT_ONLY = "7e57c051-0000-4000-8000-000000000707";
const PROJECT_NO_DEVIZ = "7e57c051-0000-4000-8000-000000000708";

async function needScreen(page: Page) {
  await page.goto("/necesar");
  await expect(page.getByTestId("need-excluse")).toBeVisible({ timeout: 25_000 });
}

/** Cantitatea afisata, citita din atributul de date si nu din textul formatat. */
async function qtyOf(page: Page, testId: string): Promise<number> {
  const raw = await page.getByTestId(testId).getAttribute("data-qty");
  return Number(raw);
}

test.describe("Necesar de materiale", () => {
  test.describe.configure({ timeout: 120_000 });

  test("necesarul este devizul acceptat minus ce s-a emis, podit la zero", async ({ page }) => {
    await signIn(page, ownerAccount());
    await needScreen(page);

    // 10 din prospect plus 5 din oferta, fara nicio emitere.
    expect(await qtyOf(page, `need-necesar-${NEC_01}`)).toBe(15);
    // 4 din contract minus 1 emis.
    expect(await qtyOf(page, `need-necesar-${NEC_03}`)).toBe(3);
  });

  test("un proiect care a emis peste estimare contribuie ZERO, nu un negativ", async ({ page }) => {
    await signIn(page, ownerAccount());
    await needScreen(page);

    // Prospectul cere 7. Santierul in lucru a emis 9 dintr-o estimare de 6, deci
    // contribuie 0. Un negativ ar da 4 si comanda ar fi cu trei prea mica.
    expect(await qtyOf(page, `need-necesar-${NEC_04}`)).toBe(7);
    expect(await qtyOf(page, `need-stare-${NEC_04}-lead`)).toBe(7);
    expect(await qtyOf(page, `need-stare-${NEC_04}-active`)).toBe(0);
  });

  test("un proiect în active cu deviz acceptat ESTE inclus", async ({ page }) => {
    await signIn(page, ownerAccount());
    await needScreen(page);

    // Santierul in lucru cere 3 din NEC-02, si se vede in defalcarea pe stare.
    expect(await qtyOf(page, `need-stare-${NEC_02}-active`)).toBe(3);
    expect(await qtyOf(page, `need-necesar-${NEC_02}`)).toBe(11); // 8 ofertă + 3 în lucru
  });

  test("un proiect suspendat sau închis nu intră nici cu deviz acceptat", async ({ page }) => {
    await signIn(page, ownerAccount());
    await needScreen(page);

    // NEC-05 este estimat DOAR de proiectul suspendat, de cel inchis si de cel
    // ramas ciorna. Daca vreunul dintre ei ar intra, randul ar exista.
    await expect(page.getByTestId(`need-row-${NEC_05}`)).toHaveCount(0);
  });

  test("un proiect fără deviz acceptat este exclus ȘI raportat, cu o legătură", async ({ page }) => {
    await signIn(page, ownerAccount());
    await needScreen(page);

    const block = page.getByTestId("need-excluse");
    const ids = (await block.getAttribute("data-ids")) ?? "";
    // Cel al carui singur deviz este ciorna.
    expect(ids.split(",")).toContain(PROJECT_DRAFT_ONLY);
    // Si cel care nu are niciun deviz.
    expect(ids.split(",")).toContain(PROJECT_NO_DEVIZ);

    const count = Number(await block.getAttribute("data-count"));
    expect(count).toBeGreaterThanOrEqual(2);
    await expect(block).toContainText("fără deviz acceptat");
    await expect(page.getByTestId("need-excluse-link")).toBeVisible();
  });

  test("deficitul este necesar minus stoc, podit la zero", async ({ page }) => {
    await signIn(page, ownerAccount());
    await needScreen(page);

    expect(await qtyOf(page, `need-stoc-${NEC_01}`)).toBe(4);
    expect(await qtyOf(page, `need-deficit-${NEC_01}`)).toBe(11); // 15 - 4
    expect(await qtyOf(page, `need-deficit-${NEC_03}`)).toBe(2); // 3 - 1
    expect(await qtyOf(page, `need-deficit-${NEC_04}`)).toBe(6); // 7 - 1
  });

  test("un produs cu stoc suficient nu are deficit, și nu un deficit negativ", async ({ page }) => {
    await signIn(page, ownerAccount());
    await needScreen(page);

    expect(await qtyOf(page, `need-stoc-${NEC_02}`)).toBe(20);
    expect(await qtyOf(page, `need-deficit-${NEC_02}`)).toBe(0);
    // Si se randeaza ca o liniuta, nu ca minus noua.
    await expect(page.getByTestId(`need-deficit-${NEC_02}`)).toHaveText("-");
    await expect(page.getByTestId(`need-row-${NEC_02}`)).toHaveAttribute("data-has-shortfall", "false");
  });

  test("un produs cerut de două proiecte se adună într-un singur rând", async ({ page }) => {
    await signIn(page, ownerAccount());
    await needScreen(page);

    await expect(page.getByTestId(`need-row-${NEC_01}`)).toHaveCount(1);
    await expect(page.getByTestId(`need-projects-${NEC_01}`)).toHaveAttribute("data-count", "2");
    // Si amandoua se vad pe rand, nu doar numarate.
    await expect(page.getByTestId(`need-project-${NEC_01}-${PROJECT_LEAD}`)).toBeVisible();
    await expect(page.getByTestId(`need-project-${NEC_01}-${PROJECT_OFFER}`)).toBeVisible();
  });

  test("necesarul este defalcat pe stare și NU este ponderat cu probabilitate", async ({ page }) => {
    await signIn(page, ownerAccount());
    await needScreen(page);

    const lead = await qtyOf(page, `need-stare-${NEC_01}-lead`);
    const offer = await qtyOf(page, `need-stare-${NEC_01}-offer`);
    expect(lead).toBe(10);
    expect(offer).toBe(5);
    // NEPONDERAT: defalcarea se aduna EXACT la necesar. O pondere pe stare ar da
    // orice altceva decat 15.
    expect(lead + offer).toBe(await qtyOf(page, `need-necesar-${NEC_01}`));
  });

  test("fiecare șir vizibil este românesc", async ({ page }) => {
    await signIn(page, ownerAccount());
    await needScreen(page);

    for (const label of [
      "Necesar de materiale",
      "Necesar pe produs",
      "Necesar",
      "În stoc",
      "Deficit",
      "Prospect",
      "Ofertă",
      "Contract",
      "În lucru",
      "Neponderat",
    ]) {
      await expect(page.locator("main")).toContainText(label);
    }

    const text = (await page.locator("main").innerText()).toLowerCase();
    for (const english of ["required", "in stock", "shortfall", "unweighted", "procurement", "no accepted"]) {
      expect(text).not.toContain(english);
    }
  });
});
