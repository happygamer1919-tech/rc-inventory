import {
  expect,
  test,
  type ConsoleMessage,
  type Page,
} from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { NAV } from "@/lib/nav";
import {
  SETTINGS_SECTIONS,
  settingsSectionHref,
  type SettingsSectionId,
} from "@/lib/data/setari-sections";

// setari-sections.spec - linia de acceptanta a cardului P3-113 (goal G69 partea 2).
//
// CE PROBEAZA, in ordinea in care conteaza:
//   1. /setari NU REDIRECTEAZA si casuta de adaugare a unei categorii este pe adresa
//      goala, fara niciun clic. Acestea doua sunt tot riscul cardului: zece fisiere de
//      test isi fac o categorie exact asa, inainte de a putea crea un produs, si un
//      caz din auth.spec cere ca adresa sa ramana /setari.
//   2. Fiecare secțiune are adresa ei, arata continutul ei si numai pe el, iar
//      sub-meniul o marcheaza pe cea deschisa.
//   3. Unitatile de masura au rams DOAR DE CITIT, iar Opțiuni produse PLEACA tot la
//      /setari/tabla, cum pleaca si azi.
//   4. Pe un telefon de 390x844 sub-meniul incape, se poate atinge si se poate folosi.
//   5. Nicio adresa adaugata de acest card nu scoate erori in consola, iar titlul din
//      bara de sus ramane Setări pe fiecare, fiindca labelForPath citeste numai calea.
//   6. Linia de sub Setări din meniul din stanga nu mai spune "Categorii și unități de
//      măsură", care ar fi devenit falsa in ziua livrarii.
//
// NU SCRIE NIMIC IN BAZA. Fiecare caz citeste ecranul: nicio categorie adaugata, nicio
// setare de facturare salvata, niciun rand atins. Cazurile care chiar scriu in blocul
// Facturare sunt ale lui tests/e2e/facturare-settings.spec.ts si nu se dubleaza aici.

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const MIN_TAP = 44;

/** Ce data-testid trebuie sa fie pe ecran pentru fiecare secțiune, si numai el. */
const SECTION_MARKER: Record<Exclude<SettingsSectionId, "toate">, string> = {
  catalog: "settings-catalog",
  // P3-116, goal G69 partea 4. A SASEA SECTIUNE, si acelasi lucru s-a intamplat ca la
  // a cincea: tipul a cerut randul, deci fisierul a refuzat sa compileze pana cand
  // cineva a spus dupa ce se recunoaste secțiunea pe ecran. RANDUL NU SLABESTE NIMIC,
  // ci intareste: de acum cazul (2) cere si ca settings-date-firma sa NU apara pe
  // catalog, pe facturare si pe optiuni, iar cazul (5) matura si adresa ei.
  "date-firma": "settings-date-firma",
  facturare: "settings-facturare",
  optiuni: "settings-optiuni",
  // P3-114. TIPUL A CERUT ACEST RAND SI ASTA ESTE O PROPRIETATE, NU UN DERANJ,
  // exact ca la UNIT_MEANING in P3-33: SECTION_MARKER este
  // Record<Exclude<SettingsSectionId, "toate">, string>, deci a cincea secțiune a
  // facut acest fisier sa nu compileze pana cand cineva a spus dupa ce se recunoaste
  // pe ecran. Un Partial aici ar fi lasat secțiunea nemasurata si nimic nu ar fi
  // observat. Randul NU SLABESTE NIMIC, ci intareste: de acum cazul (2) cere si ca
  // settings-utilizatori sa NU apara pe catalog, pe facturare si pe optiuni.
  utilizatori: "settings-utilizatori",
};

const MARKERS = Object.values(SECTION_MARKER);

/** Colecteaza erorile de consola si exceptiile necapturate, ca in headers.spec. */
function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

/** Id-urile secțiunilor marcate deschise in sub-meniu. Trebuie sa fie exact una. */
async function activeInMenu(page: Page): Promise<string[]> {
  const menu = page.getByTestId("settings-sections");
  await expect(menu).toBeVisible({ timeout: 25_000 });
  return menu.evaluate((nav) =>
    Array.from(nav.querySelectorAll("a[data-active='true']")).map(
      (a) => a.getAttribute("data-testid") ?? "",
    ),
  );
}

test.describe("P3-113: Setări ca sub-meniu de secțiuni", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    await signIn(page, ownerAccount());
  });

  test("(1) adresa goală nu redirectează, iar căsuța de categorie este acolo fără niciun clic", async ({
    page,
  }) => {
    await page.goto("/setari");

    // FARA REDIRECTARE. Exact adresa cerută, fara parametru adaugat pe drum: asa o
    // cere si cazul din auth.spec, si o legatura trimisa de cineva trebuie sa
    // deschida exact ce a trimis.
    await expect(page).toHaveURL(/\/setari$/);

    // CASUTA DE ADAUGARE, FARA CLIC. Zece fisiere de test incep asa.
    await expect(page.getByTestId("category-name")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("category-add")).toBeVisible();
    // Tabelul categoriilor exista in document. Nu se cere VIZIBIL: un <tbody> gol nu
    // are cutie, iar acest caz nu are voie sa depinda de ce a semanat alt spec.
    await expect(page.getByTestId("category-rows")).toHaveCount(1);

    // Si celelalte doua blocuri sunt tot pe adresa goala. Blocul Facturare este
    // motivul pentru care implicitul este "Toate setările": ajutorul openSettings al
    // lui facturare-settings.spec cere settings-facturare vizibil dupa un simplu
    // goto("/setari"), iar niciun test existent nu are voie sa fie atins.
    await expect(page.getByTestId("settings-facturare")).toBeVisible();
    await expect(page.getByTestId("settings-optiuni")).toBeVisible();

    // Sub-meniul exista si marcheaza "Toate setările".
    expect(await activeInMenu(page)).toEqual(["settings-section-toate"]);

    // Cipul portocaliu al ecranului este neatins de mutare.
    await expect(page.getByText("Doar administrator", { exact: true })).toBeVisible();
  });

  test("(2) fiecare secțiune se deschide la adresa ei și sub-meniul o marchează pe ea", async ({
    page,
  }) => {
    for (const id of ["catalog", "facturare", "optiuni"] as const) {
      const href = settingsSectionHref(id);
      await page.goto(href);

      // Adresa nu se schimba, deci secțiunea se poate trimite ca legatura.
      await expect(page, `adresa secțiunii ${id}`).toHaveURL(new RegExp(`/setari\\?sectiune=${id}$`));

      // Continutul ei, si numai al ei.
      await expect(
        page.getByTestId(SECTION_MARKER[id]),
        `secțiunea ${id} nu este pe ecran`,
      ).toBeVisible({ timeout: 25_000 });
      for (const other of MARKERS.filter((m) => m !== SECTION_MARKER[id])) {
        await expect(
          page.getByTestId(other),
          `${other} apare pe secțiunea ${id}`,
        ).toHaveCount(0);
      }

      // Sub-meniul marcheaza exact una, si este ea.
      expect(await activeInMenu(page), `marcajul pe secțiunea ${id}`).toEqual([
        `settings-section-${id}`,
      ]);
    }

    // O valoare necunoscuta in adresa nu da eroare: cade pe "Toate setările", cum
    // cade si o filă necunoscuta pe fisa clientului.
    await page.goto("/setari?sectiune=nu-exista");
    await expect(page.getByTestId("category-add")).toBeVisible({ timeout: 25_000 });
    expect(await activeInMenu(page)).toEqual(["settings-section-toate"]);

    // PESTE LATIMEA DE TELEFON BANDA STA PE UN SINGUR RAND: ruperea pe doua randuri
    // este numai a telefonului, fiindca poarta prefixul max-md.
    await page.setViewportSize(DESKTOP);
    await page.goto("/setari");
    const tops = await page
      .getByTestId("settings-sections")
      .evaluate((nav) =>
        Array.from(nav.querySelectorAll("a")).map((a) => Math.round(a.getBoundingClientRect().top)),
      );
    expect(tops.length, "sub-meniul nu are patru intrari").toBe(SETTINGS_SECTIONS.length);
    expect(new Set(tops).size, `banda s-a rupt pe desktop: ${tops.join(",")}`).toBe(1);
  });

  test("(3) unitățile de măsură rămân doar de citit, iar Opțiuni produse pleacă la ecranul ei", async ({
    page,
  }) => {
    await page.goto(settingsSectionHref("catalog"));

    const units = page.getByTestId("settings-unitati");
    await expect(units).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("unit-row").first()).toBeVisible();
    await expect(units.getByText("Doar vizualizare", { exact: true })).toBeVisible();

    // DOAR DE CITIT, masurat si nu declarat: in tot blocul nu exista niciun control
    // care ar putea scrie o unitate. Motivul este in comentariul componentei: setul
    // este fixat de enumul unit_code, deci o unitate noua este o migratie numerotata
    // si nu un rand introdus dintr-un ecran. Acelasi raspuns a primit si G59.
    await expect(units.locator("input, select, textarea, button")).toHaveCount(0);

    await page.goto(settingsSectionHref("optiuni"));
    const link = page.getByTestId("settings-sheet-options-link");
    await expect(link).toBeVisible({ timeout: 25_000 });
    await expect(link).toHaveAttribute("href", "/setari/tabla");

    // PLEACA CHIAR ACOLO. 225 de randuri nu incap intr-un card de pe un ecran comun,
    // deci secțiunea este o intrare care duce mai departe, exact ca azi.
    await link.click();
    await page.waitForURL((url) => new URL(url).pathname === "/setari/tabla", { timeout: 30_000 });
    await expect(page.getByTestId("sheet-admin-back")).toBeVisible({ timeout: 25_000 });
  });

  test("(4) pe telefon (390x844) sub-meniul încape, se poate atinge și se poate folosi", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/setari");
    await expect(page.getByTestId("settings-sections")).toBeVisible({ timeout: 25_000 });

    const fits = async (where: string) => {
      const reading = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(reading.scrollWidth, `derulare laterala pe ${where}`).toBeLessThanOrEqual(
        reading.clientWidth,
      );
    };

    await fits("/setari");

    // Fiecare intrare a sub-meniului este o tinta de cel putin 44px.
    const heights = await page
      .getByTestId("settings-sections")
      .evaluate((nav) =>
        Array.from(nav.querySelectorAll("a")).map((a) => ({
          id: a.getAttribute("data-testid") ?? "",
          height: a.getBoundingClientRect().height,
        })),
      );
    expect(heights.length).toBe(SETTINGS_SECTIONS.length);
    expect(
      heights.filter((h) => h.height < MIN_TAP).map((h) => `${h.id} ${h.height.toFixed(1)}px`),
      `intrari sub ${MIN_TAP}px in sub-meniu`,
    ).toEqual([]);

    // SE POATE FOLOSI: o atingere pe Facturare deschide Facturare si lasa vocabularul.
    await page.getByTestId("settings-section-facturare").click();
    await page.waitForURL((url) => url.searchParams.get("sectiune") === "facturare", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("settings-facturare")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("settings-catalog")).toHaveCount(0);
    expect(await activeInMenu(page)).toEqual(["settings-section-facturare"]);
    await fits("/setari?sectiune=facturare");
  });

  test("(5) fiecare adresă adăugată de acest card: zero erori de consolă și titlul Setări", async ({
    page,
  }) => {
    const errors = watchConsole(page);
    const addresses = SETTINGS_SECTIONS.map((s) => settingsSectionHref(s.id));
    // P3-114. ERA `toBe(4)`, o copie scrisa de mana a unui numar pe care constanta il
    // poarta deja, si a cincea secțiune l-a facut fals. Se citeste acum din lista, ca
    // in celelalte doua locuri ale acestui fisier (cazurile 2 si 4), deci masura NU
    // SLABESTE: matura fiecare adresa pe care o are ecranul, oricate sunt, in loc de
    // primele patru. Cu acest card sunt cinci.
    expect(addresses.length).toBe(SETTINGS_SECTIONS.length);

    for (const address of addresses) {
      await page.goto(address);
      // Randarea trebuie sa se aseze inainte de a citi consola: o eroare de hidratare
      // apare dupa ce documentul a sosit.
      await page.waitForLoadState("networkidle");
      expect(errors, `erori de consola pe ${address}`).toEqual([]);

      // Titlul din bara de sus vine din labelForPath, care citeste numai calea: de
      // aceea un parametru de interogare nu a cerut nicio inregistrare noua nici in
      // lista de rute, nici in bararea de legaturi moarte.
      await expect(
        page.locator("header span").first(),
        `titlul barei de sus pe ${address}`,
      ).toHaveText("Setări");
    }
  });

  test("(6) linia de sub Setări din meniu nu mai promite doar categorii și unități", async ({
    page,
  }) => {
    const item = NAV.flatMap((g) => g.items).find((i) => i.href === "/setari");
    expect(item, "intrarea /setari a dispărut din meniu").toBeTruthy();
    expect(item!.description).not.toBe("Categorii și unități de măsură");
    expect(item!.description.toLowerCase()).toContain("facturare");

    // Si pe ecran, unde Sidebar pune descrierea ca `title` pe legatura.
    await page.goto("/setari");
    await expect(page.locator('aside nav a[href="/setari"]')).toHaveAttribute(
      "title",
      item!.description,
    );
  });
});
