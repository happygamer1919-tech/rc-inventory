import { expect, test, type Locator } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// list-filters-layout.spec - linia de acceptanta a cardului P3-52.
//
// Pe listele Leaduri si Proiecte cautarea si fiecare filtru stateau fiecare pe
// randul lui: randul era flex-wrap, iar Input si Select poarta w-full din clasa
// comuna a campurilor, deci fiecare Select cerea tot randul si trecea dedesubt.
// Inventar le tine deja pe un singur rand, cu o grila explicita.
//
// SE MASOARA ECRANUL, NU CLASELE. Un test care citeste className dovedeste doar
// ca s-a scris o clasa, nu ca ecranul arata un rand.
//
// METODA. Un control sta pe randul cautarii cand centrul lui vertical este la cel
// mult 4 pixeli de centrul casetei de cautare. INVENTAR ESTE CAZUL DE CONTROL: el
// trece si inainte si dupa card, deci dovedeste ca metoda recunoaste un rand
// adevarat; cazurile Leaduri si Proiecte cad pe arborele de dinainte de card.
//
// LATIMEA CAUTARII este de cel putin 240 de pixeli, ca randul sa nu fie obtinut
// micsorand caseta de cautare.
//
// Fereastra este cea din playwright.config.ts, 1440 pe 900. Ecranele mai inguste
// sunt in afara scopului, CLAUDE.md sectiunea 11.
//
// Spec-ul nu scrie niciun rand in baza. Filtrul se pune din URL, exact cum il
// pune ecranul cand se alege o optiune.

const CENTRE_TOLERANCE_PX = 4;
const MIN_SEARCH_WIDTH_PX = 240;

/**
 * Cere ca fiecare control sa aiba centrul vertical la cel mult 4 pixeli de al
 * cautarii si ca, atunci cand se cere, cautarea sa fie de cel putin 240 de pixeli.
 * Se reincearca pana la zece secunde, ca o masuratoare luata inainte ca pagina sa
 * se aseze sa nu decida nimic.
 */
async function expectOnSearchRow(
  search: Locator,
  controls: () => Promise<Locator[]>,
  opts: { checkSearchWidth: boolean },
): Promise<void> {
  await expect(search).toBeVisible();
  await expect(async () => {
    const searchBox = await search.boundingBox();
    expect(searchBox, "caseta de cautare nu are cutie pe ecran").not.toBeNull();
    const searchCentre = searchBox!.y + searchBox!.height / 2;

    const list = await controls();
    const readings: string[] = [];
    let worst = 0;
    for (const control of list) {
      const box = await control.boundingBox();
      const name =
        (await control.getAttribute("data-testid")) ??
        (await control.evaluate((el) => el.outerHTML.slice(0, 80)));
      expect(box, `controlul ${name} nu are cutie pe ecran`).not.toBeNull();
      const deviation = Math.abs(box!.y + box!.height / 2 - searchCentre);
      readings.push(`${name}: ${deviation.toFixed(1)}px`);
      worst = Math.max(worst, deviation);
    }

    expect(
      worst,
      `abaterea centrelor fata de cautare (${readings.join(", ")})`,
    ).toBeLessThanOrEqual(CENTRE_TOLERANCE_PX);

    if (opts.checkSearchWidth) {
      expect(searchBox!.width, "latimea casetei de cautare").toBeGreaterThanOrEqual(
        MIN_SEARCH_WIDTH_PX,
      );
    }
  }).toPass({ timeout: 10_000 });
}

test.describe("P3-52: cautarea si filtrele listelor stau pe un singur rand", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ownerAccount());
  });

  test("(1) Inventar, cazul de control: fiecare control vizibil sta pe randul cautarii", async ({
    page,
  }) => {
    await page.goto("/inventar");
    const search = page.getByPlaceholder("Caută după denumire sau cod SKU");
    await expect(search).toBeVisible();

    // Randul este parintele casetei de cautare. Cautarea si cele patru filtre:
    // un rand de mai putin de doua controale nu ar masura nimic.
    const controls = search
      .locator("xpath=..")
      .locator("input, select, button")
      .filter({ visible: true });
    await expect.poll(() => controls.count()).toBeGreaterThanOrEqual(5);

    await expectOnSearchRow(search, () => controls.all(), { checkSearchWidth: false });
  });

  test("(2) Leaduri: cautarea, tipul si starea stau pe un rand, cautarea de cel putin 240px", async ({
    page,
  }) => {
    await page.goto("/clienti?vedere=leaduri");
    const filters = page.getByTestId("clients-filters");
    await expect(filters).toBeVisible();
    // Fara niciun filtru ales butonul de golire nu exista.
    await expect(filters.getByTestId("clients-clear")).toHaveCount(0);

    await expectOnSearchRow(
      filters.getByTestId("clients-search"),
      async () => [filters.getByTestId("clients-type"), filters.getByTestId("clients-status")],
      { checkSearchWidth: true },
    );
  });

  test("(3) Proiecte: fiecare control vizibil sta pe randul cautarii, cautarea de cel putin 240px", async ({
    page,
  }) => {
    await page.goto("/proiecte");
    const filters = page.getByTestId("projects-filters");
    await expect(filters).toBeVisible();
    await expect(filters.getByTestId("projects-clear")).toHaveCount(0);

    const controls = filters.locator("input, select, button").filter({ visible: true });
    // Cautarea, starea si clientul.
    await expect.poll(() => controls.count()).toBeGreaterThanOrEqual(3);

    await expectOnSearchRow(filters.getByTestId("projects-search"), () => controls.all(), {
      checkSearchWidth: true,
    });
  });

  test("(5) Leaduri cu un filtru ales: Șterge filtrele apare si cautarea si selecturile raman pe un rand", async ({
    page,
  }) => {
    await page.goto("/clienti?vedere=leaduri&tip=company");
    const filters = page.getByTestId("clients-filters");
    await expect(filters.getByTestId("clients-clear")).toBeVisible();
    await expect(filters.getByTestId("clients-clear")).toHaveText("Șterge filtrele");

    await expectOnSearchRow(
      filters.getByTestId("clients-search"),
      async () => [filters.getByTestId("clients-type"), filters.getByTestId("clients-status")],
      { checkSearchWidth: true },
    );
  });

  test("(5) Proiecte cu un filtru ales: Șterge filtrele apare si cautarea si selecturile raman pe un rand", async ({
    page,
  }) => {
    await page.goto("/proiecte?stare=toate");
    const filters = page.getByTestId("projects-filters");
    await expect(filters.getByTestId("projects-clear")).toBeVisible();
    await expect(filters.getByTestId("projects-clear")).toHaveText("Șterge filtrele");

    const selects = filters.locator("select");
    await expect(selects).toHaveCount(2);

    await expectOnSearchRow(filters.getByTestId("projects-search"), () => selects.all(), {
      checkSearchWidth: true,
    });
  });
});
