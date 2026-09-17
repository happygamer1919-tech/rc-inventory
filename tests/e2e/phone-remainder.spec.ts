import { expect, request, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { managerAccount, ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// phone-remainder.spec - linia de acceptanta a cardului P3-67 (G23 partea 4, ultima).
//
// Ecranele ramase pe un telefon de 390x844: tabloul de bord, Memento stoc, Necesar,
// intrarea CRM, Ieșiri materiale, Setări, filele Deviz si Comparație ale unui proiect
// si ecranul 403. Sub 768px blocurile stau unul sub altul si fiecare rand de tabel
// devine un card, iar peste 768px nimic nu se schimba. Restul suitei ruleaza la
// 1440x900 si ramane neschimbat.
//
// CE INSEAMNA "INCAPE", ACEEASI MASURATOARE CA IN phone-lists.spec (P3-64):
//   - fara derulare laterala: document.documentElement.scrollWidth <= clientWidth,
//     SI ACELASI LUCRU PENTRU <main>, care deruleaza singur in invelisul aplicatiei
//   - tinta de atingere: fiecare control vizibil din <main> are cel putin 44px
//   - campurile, selecturile si zonele de text au text de cel putin 16px
//   - nimic in afara ecranului si niciun text taiat in <main>
//   - un card pe rand: niciun antet de tabel vizibil, iar fiecare celula poarta ca
//     eticheta exact textul antetului coloanei ei
//
// DATELE. Produsele si proiectele Necesar sunt cele semanate in CI de
// scripts/seed-test-procurement.mjs, produsul de deviz de scripts/seed-test-deviz.mjs.
// Clientul si proiectul pe care se creeaza devizul sunt ale acestui spec, create prin
// PostgREST ca administratorul, cu prefixul TEST si un sufix unic pe rulare, si nu se
// sterg niciodata. Devizul este o ciorna pe proiectul spec-ului, deci nu atinge
// Necesarul, care citeste numai devize acceptate.
//
// DEPINDE DE P3-65 PENTRU FILELE PROIECTULUI: bara de file si antetul fisei de proiect
// incap in 390px abia cu partea 3 pe main.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const MIN_TAP = 44;
const MIN_INPUT_FONT = 16;

const NEC_SKUS = ["TEST-NEC-01", "TEST-NEC-02", "TEST-NEC-03", "TEST-NEC-04"];
const DEVIZ_PRODUCT = { label: "TEST Deviz Cărămidă", sku: "TEST-DEVIZ-03" };

// ---------------------------------------------------------------------------
// Legatura directa la baza, ca administratorul
// ---------------------------------------------------------------------------

type OwnerRest = {
  api: APIRequestContext;
  headers: Record<string, string>;
};

async function ownerRest(): Promise<OwnerRest> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  expect(url, "P3-67 are nevoie de NEXT_PUBLIC_SUPABASE_URL").not.toBe("");
  expect(anonKey, "P3-67 are nevoie de NEXT_PUBLIC_SUPABASE_ANON_KEY").not.toBe("");

  const api = await request.newContext({ baseURL: url });
  const owner = ownerAccount();
  const token = await api.post("/auth/v1/token?grant_type=password", {
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    data: { email: owner.email, password: owner.password },
  });
  expect(token.ok()).toBe(true);
  const body = (await token.json()) as { access_token: string };

  return {
    api,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${body.access_token}`,
      "Content-Type": "application/json",
    },
  };
}

/** Un client TEST si un proiect TEST al lui, fara deviz. Intoarce id-ul proiectului. */
async function createTestProject(rest: OwnerRest, tag: string): Promise<string> {
  const client = await rest.api.post("/rest/v1/clients", {
    headers: { ...rest.headers, Prefer: "return=representation" },
    data: { name: `${tag} client`, active: true },
  });
  expect(client.status(), await client.text()).toBe(201);
  const [{ id: clientId }] = (await client.json()) as { id: string }[];

  const project = await rest.api.post("/rest/v1/projects", {
    headers: { ...rest.headers, Prefer: "return=representation" },
    data: { client_id: clientId, name: `${tag} proiect`, status: "lead", active: true },
  });
  expect(project.status(), await project.text()).toBe(201);
  const [{ id }] = (await project.json()) as { id: string }[];
  return id;
}

// ---------------------------------------------------------------------------
// Masuratori
// ---------------------------------------------------------------------------

type Reading = {
  document: { scrollWidth: number; clientWidth: number };
  main: { scrollWidth: number; clientWidth: number };
  smallTargets: string[];
  smallFonts: string[];
  outside: string[];
  clipped: string[];
  visibleTheads: number;
};

/** Citeste intr-o singura trecere tot ce trebuie sa incapa in <main> la 390px. */
async function readPhone(page: Page): Promise<Reading> {
  return page.evaluate(
    ({ minTap, minFont, width }) => {
      const main = document.querySelector("main");
      if (!main) throw new Error("pagina nu are <main>");
      const visible = (el: Element) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== "hidden";
      };
      const name = (el: Element) =>
        `${el.tagName.toLowerCase()}[${el.getAttribute("data-testid") ?? ""}] "${(
          el.getAttribute("aria-label") ??
          el.textContent ??
          el.getAttribute("placeholder") ??
          ""
        )
          .trim()
          .slice(0, 40)}"`;
      const isCheck = (el: Element) =>
        el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio");

      const smallTargets: string[] = [];
      const controls = main.querySelectorAll("input, select, textarea, button, a[href], [role='button']");
      for (const el of Array.from(controls)) {
        if (!visible(el)) continue;
        // O legatura care doar imbraca un buton: tinta este butonul, masurat separat.
        if (el.tagName === "A" && el.querySelector("button, input, select")) continue;
        const target = isCheck(el) ? (el.closest("label") ?? el) : el;
        const height = target.getBoundingClientRect().height;
        if (height < minTap) smallTargets.push(`${name(el)} ${height.toFixed(1)}px`);
      }

      const smallFonts: string[] = [];
      for (const el of Array.from(main.querySelectorAll("input, select, textarea"))) {
        if (!visible(el) || isCheck(el)) continue;
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (size < minFont) smallFonts.push(`${name(el)} ${size}px`);
      }

      const outside: string[] = [];
      const clipped: string[] = [];
      for (const el of Array.from(main.querySelectorAll<HTMLElement>("*"))) {
        if (!visible(el)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.left < -0.5 || rect.right > width + 0.5) {
          outside.push(`${name(el)} ${rect.left.toFixed(0)}..${rect.right.toFixed(0)}`);
        }
        // Un camp isi taie mereu textul in propria caseta; restul nu au voie.
        const field = ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName);
        if (!field && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "visible") {
          clipped.push(`${name(el)} ${el.scrollWidth}>${el.clientWidth}`);
        }
      }

      return {
        document: {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        },
        main: { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth },
        smallTargets,
        smallFonts,
        outside,
        clipped,
        visibleTheads: Array.from(main.querySelectorAll("thead")).filter(visible).length,
      };
    },
    { minTap: MIN_TAP, minFont: MIN_INPUT_FONT, width: PHONE.width },
  );
}

/** Clauzele 1 si 2, pe ecranul deschis. */
async function expectFitsPhone(page: Page, where: string): Promise<void> {
  const r = await readPhone(page);
  expect(r.document.scrollWidth, `derulare laterala a documentului pe ${where}`).toBeLessThanOrEqual(
    r.document.clientWidth,
  );
  expect(r.main.scrollWidth, `derulare laterala in <main> pe ${where}`).toBeLessThanOrEqual(r.main.clientWidth);
  expect(r.smallTargets, `tinte sub ${MIN_TAP}px pe ${where}`).toEqual([]);
  expect(r.smallFonts, `campuri sub ${MIN_INPUT_FONT}px pe ${where}`).toEqual([]);
  expect(r.outside, `elemente in afara ecranului pe ${where}`).toEqual([]);
  expect(r.clipped, `text taiat pe ${where}`).toEqual([]);
  expect(r.visibleTheads, `antet de tabel vizibil pe ${where}`).toBe(0);
}

/**
 * Un card pe rand: randul este o grila, nu un rand de tabel, si fiecare celula cu
 * antet poarta ca eticheta vizibila exact textul antetului coloanei ei. O coloana
 * fara antet (butoanele unei linii) nu are eticheta.
 */
async function expectRowCards(rows: Locator, where: string): Promise<void> {
  const count = Math.min(await rows.count(), 5);
  expect(count, `niciun rand de verificat pe ${where}`).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const reading = await rows.nth(i).evaluate((tr) => {
      const heads = Array.from(tr.closest("table")?.querySelectorAll("thead th") ?? []).map((th) =>
        (th.textContent ?? "").trim(),
      );
      const labels = Array.from(tr.querySelectorAll(":scope > td")).map((td) => {
        const before = getComputedStyle(td, "::before");
        return {
          text: before.content === "none" || before.content === "normal" ? "" : before.content.replace(/^"|"$/g, ""),
          shown: before.display !== "none" && before.content !== "none",
        };
      });
      return { display: getComputedStyle(tr).display, heads, labels };
    });
    expect(reading.display, `randul ${i} nu este card pe ${where}`).toBe("grid");
    expect(reading.heads.length, `tabel fara antet pe ${where}`).toBeGreaterThan(0);
    expect(reading.labels.map((l) => l.text), `etichetele randului ${i} pe ${where}`).toEqual(reading.heads);
    reading.heads.forEach((head, c) => {
      if (head !== "") expect(reading.labels[c]!.shown, `eticheta ${head} ascunsa pe ${where}`).toBe(true);
    });
  }
}

/** Clauza 3: o valoare este vizibila si sta intre 0 si 390px. */
async function expectValueOnScreen(value: Locator, where: string): Promise<void> {
  await value.scrollIntoViewIfNeeded();
  await expect(value).toBeVisible();
  const box = await value.boundingBox();
  expect(box, `valoarea nu are cutie pe ${where}`).not.toBeNull();
  expect(box!.x, `valoarea iese spre stanga pe ${where}`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `valoarea iese spre dreapta pe ${where}`).toBeLessThanOrEqual(PHONE.width);
}

/** Cutiile unor elemente, in ordinea data. */
async function boxes(locators: Locator[]): Promise<{ x: number; y: number; width: number; height: number }[]> {
  const out = [];
  for (const l of locators) {
    const box = await l.boundingBox();
    expect(box, "element fara cutie").not.toBeNull();
    out.push(box!);
  }
  return out;
}

/** Unul sub altul: fiecare incepe sub cel dinainte si toate pornesc din aceeasi coloana. */
function expectStacked(list: { x: number; y: number; height: number }[], where: string): void {
  for (let i = 1; i < list.length; i++) {
    expect(list[i]!.y, `blocul ${i} nu sta sub blocul ${i - 1} pe ${where}`).toBeGreaterThanOrEqual(
      list[i - 1]!.y + list[i - 1]!.height - 1,
    );
    expect(Math.abs(list[i]!.x - list[0]!.x), `blocul ${i} nu sta in aceeasi coloana pe ${where}`).toBeLessThanOrEqual(1);
  }
}

/** Alaturi: toate pe acelasi rand, fiecare la dreapta celui dinainte. */
function expectSideBySide(list: { x: number; y: number; width: number }[], where: string): void {
  for (let i = 1; i < list.length; i++) {
    expect(Math.abs(list[i]!.y - list[0]!.y), `blocul ${i} nu sta pe acelasi rand pe ${where}`).toBeLessThanOrEqual(1);
    expect(list[i]!.x, `blocul ${i} nu sta la dreapta pe ${where}`).toBeGreaterThanOrEqual(
      list[i - 1]!.x + list[i - 1]!.width - 1,
    );
  }
}

/** Blocul tabloului de bord care contine elementul: copilul direct al unei grile. */
function dashboardBlock(page: Page, testId: string): Locator {
  return page.locator(
    `xpath=//*[@data-testid='${testId}']/ancestor::*[parent::div[contains(concat(' ', normalize-space(@class), ' '), ' grid ')]][1]`,
  );
}

/** Autentificare la latimea desktop, cum o face restul suitei, apoi telefonul. */
async function signInOnPhone(page: Page, account = ownerAccount()): Promise<void> {
  await page.setViewportSize(DESKTOP);
  await signIn(page, account);
  await page.setViewportSize(PHONE);
}

async function shot(page: Page, testInfo: { outputPath: (name: string) => string }, name: string) {
  await page.locator("main").evaluate((main) => main.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath(`phone-remainder-${name}.png`) });
}

/** Valoarea unui numar de stoc: finita si nenegativa. */
async function expectQty(page: Page, testId: string): Promise<void> {
  const raw = await page.getByTestId(testId).getAttribute("data-qty");
  const value = Number(raw);
  expect(Number.isFinite(value), `${testId} nu este un numar: ${raw}`).toBe(true);
  expect(value, `${testId} negativ`).toBeGreaterThanOrEqual(0);
}

// ---------------------------------------------------------------------------
// Cazurile
// ---------------------------------------------------------------------------

test.describe("P3-67: ecranele ramase pe telefon (390x844)", () => {
  test.describe.configure({ timeout: 120_000 });

  test("(a) tabloul de bord: cele patru cifre si cele patru blocuri stau unul sub altul", async ({
    page,
  }, testInfo) => {
    await signInOnPhone(page);
    await page.goto("/");
    const stats = page.getByTestId("dashboard-stats");
    await expect(stats).toBeVisible({ timeout: 25_000 });

    await expectFitsPhone(page, "/");

    const cards = stats.locator("> *");
    await expect(cards).toHaveCount(4);
    for (const i of [0, 1, 2, 3]) {
      const text = (await cards.nth(i).innerText()).replace(/ /g, " ");
      expect(text, `cifra ${i} lipseste`).toMatch(/\d/);
      await expectValueOnScreen(cards.nth(i), `/ cifra ${i}`);
    }
    expectStacked(await boxes([0, 1, 2, 3].map((i) => cards.nth(i))), "/ cifre");

    const blocks = ["dashboard-activity", "dashboard-low-stock", "dashboard-pending-inbound", "dashboard-pending-outbound"].map(
      (id) => dashboardBlock(page, id),
    );
    for (const b of blocks) await expect(b).toHaveCount(1);
    expectStacked(await boxes(blocks), "/ blocuri");

    for (const id of ["dashboard-low-stock", "dashboard-pending-inbound", "dashboard-pending-outbound"]) {
      const rows = page.getByTestId(id).locator("> tr");
      if ((await rows.count()) > 0) await expectRowCards(rows, `/ ${id}`);
    }
    await shot(page, testInfo, "dashboard");
  });

  test("(b) Memento stoc: pragurile sunt carduri si produsele semanate se vad cu stocul lor", async ({
    page,
  }, testInfo) => {
    await signInOnPhone(page);
    await page.goto("/memento");
    const rows = page.getByTestId("threshold-row");
    await expect.poll(() => rows.count(), { timeout: 25_000 }).toBeGreaterThanOrEqual(NEC_SKUS.length);

    await expectFitsPhone(page, "/memento");
    await expectRowCards(rows, "/memento praguri");
    const alerts = page.getByTestId("alert-row");
    if ((await alerts.count()) > 0) await expectRowCards(alerts, "/memento alerte");

    for (const sku of NEC_SKUS) {
      const row = page.locator(`[data-testid='threshold-row'][data-sku='${sku}']`);
      await expectValueOnScreen(row.getByText(sku, { exact: true }), `/memento ${sku}`);
      // Stocul curent este a treia celula si poarta o cifra.
      await expect(row.locator("> td").nth(2)).toContainText(/\d/);
    }
    await shot(page, testInfo, "memento");
  });

  test("(c) Necesar: randurile semanate sunt carduri cu cantitatile lor", async ({ page }, testInfo) => {
    await signInOnPhone(page);
    await page.goto("/necesar");
    await expect(page.getByTestId("need-excluse")).toBeVisible({ timeout: 25_000 });
    const rows = page.locator("[data-testid^='need-row-']");
    await expect.poll(() => rows.count(), { timeout: 25_000 }).toBeGreaterThanOrEqual(1);

    await expectFitsPhone(page, "/necesar");
    await expectRowCards(rows, "/necesar");
    for (const sku of NEC_SKUS) {
      await expectValueOnScreen(page.getByTestId(`need-necesar-${sku}`), `/necesar ${sku}`);
      await expectQty(page, `need-necesar-${sku}`);
      await expectQty(page, `need-stoc-${sku}`);
      await expectQty(page, `need-deficit-${sku}`);
    }
    await shot(page, testInfo, "necesar");
  });

  test("(d) intrarea CRM: cele trei carduri stau unul sub altul, iar Leaduri duce la leaduri", async ({
    page,
  }, testInfo) => {
    await signInOnPhone(page);
    await page.goto("/crm");
    const cards = page.getByTestId("crm-card");
    await expect(cards).toHaveCount(3, { timeout: 25_000 });

    await expectFitsPhone(page, "/crm");
    await expect(page.getByTestId("crm-card-label")).toHaveText(["Clienți", "Leaduri", "Proiecte"]);
    expectStacked(await boxes([0, 1, 2].map((i) => cards.nth(i))), "/crm");
    await shot(page, testInfo, "crm");

    await cards.filter({ hasText: "Leaduri" }).click();
    await expect(page).toHaveURL(/\/clienti\?vedere=leaduri/, { timeout: 25_000 });
  });

  test("(e) Ieșiri materiale: formularul incape, iar o pozitie noua este al doilea card", async ({
    page,
  }, testInfo) => {
    await signInOnPhone(page);
    await page.goto("/iesiri");
    const form = page.getByTestId("outbound-form");
    await expect(form).toBeVisible({ timeout: 25_000 });
    const lines = form.locator("tbody > tr");
    await expect(lines).toHaveCount(1);

    await page.getByTestId("issue-add-line").click();
    await expect(lines).toHaveCount(2);

    await expectFitsPhone(page, "/iesiri");
    await expectRowCards(lines, "/iesiri");
    expectStacked(await boxes([lines.nth(0), lines.nth(1)]), "/iesiri pozitii");
    await expectValueOnScreen(page.getByTestId("issue-quantity-1"), "/iesiri cantitatea pozitiei 2");
    await shot(page, testInfo, "iesiri");
  });

  test("(f) Setări: categoriile si unitatile sunt carduri, si la redenumire", async ({ page }, testInfo) => {
    await signInOnPhone(page);
    await page.goto("/setari");
    const categories = page.getByTestId("category-row");
    const units = page.getByTestId("unit-row");
    await expect.poll(() => categories.count(), { timeout: 25_000 }).toBeGreaterThanOrEqual(1);
    await expect.poll(() => units.count()).toBeGreaterThanOrEqual(1);

    await expectFitsPhone(page, "/setari");
    await expectRowCards(categories, "/setari categorii");
    await expectRowCards(units, "/setari unitati");
    await expectValueOnScreen(units.first().locator("> td").first(), "/setari prima unitate");
    await shot(page, testInfo, "setari");

    // Doar deschide campul de redenumire si renunta: nicio scriere.
    await page.getByTestId("category-rename").first().click();
    await expect(page.getByTestId("category-rename-input")).toBeVisible();
    await expectFitsPhone(page, "/setari redenumire");
    await page.getByRole("button", { name: "Renunță", exact: true }).click();
    await expect(page.getByTestId("category-rename-input")).toHaveCount(0);
  });

  test("(g, h) Deviz si Comparație: o versiune noua si o linie adaugata de pe telefon", async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const rest = await ownerRest();
    const projectId = await createTestProject(rest, `TEST Telefon Rest ${RUN}`);
    await rest.api.dispose();

    await signInOnPhone(page);
    await page.goto(`/proiecte/${projectId}?fila=deviz`);
    await expect(page.getByTestId("panel-deviz")).toBeVisible({ timeout: 25_000 });

    await page.getByTestId("deviz-new").click();
    await expect(page.getByTestId("deviz-row")).toHaveCount(1, { timeout: 25_000 });
    await expect(page.getByTestId("deviz-add-line")).toBeVisible({ timeout: 25_000 });

    const input = page.getByTestId("deviz-add-product").locator("input");
    await input.click();
    await input.fill(DEVIZ_PRODUCT.label);
    const list = page.locator("[data-rc-combo-list]");
    await expect(list).toBeVisible({ timeout: 10_000 });
    await expect(list.locator("li")).toHaveCount(1);
    await list.locator("li").first().click();
    await page.getByTestId("deviz-add-quantity").fill("3");
    await page.getByTestId("deviz-add-submit").click();
    const line = page.locator(`[data-testid='deviz-line'][data-sku='${DEVIZ_PRODUCT.sku}']`);
    await expect(line).toHaveCount(1, { timeout: 25_000 });

    const where = `/proiecte/${projectId}?fila=deviz`;
    await expectFitsPhone(page, where);
    await expectRowCards(page.getByTestId("deviz-row"), `${where} versiuni`);
    await expectRowCards(line, `${where} linii`);
    await expectValueOnScreen(line.getByText(DEVIZ_PRODUCT.sku, { exact: true }), `${where} SKU`);
    await expectValueOnScreen(page.getByTestId("deviz-total"), `${where} total`);
    await shot(page, testInfo, "deviz");

    await page.goto(`/proiecte/${projectId}?fila=comparatie`);
    await expect(page.getByTestId("panel-comparatie")).toBeVisible({ timeout: 25_000 });
    const row = page.getByTestId(`comparison-row-${DEVIZ_PRODUCT.sku}`);
    await expect(row).toBeVisible({ timeout: 25_000 });
    const cmp = `/proiecte/${projectId}?fila=comparatie`;
    await expectFitsPhone(page, cmp);
    await expectRowCards(row, cmp);
    await expectValueOnScreen(page.getByTestId(`comparison-est-qty-${DEVIZ_PRODUCT.sku}`), `${cmp} estimat`);
    expect(Number(await page.getByTestId(`comparison-est-qty-${DEVIZ_PRODUCT.sku}`).getAttribute("data-qty"))).toBe(3);
    await shot(page, testInfo, "comparatie");
  });

  test("(i) ecranul 403: operatorul pe /setari vede drumul inapoi, pe telefon", async ({ page }, testInfo) => {
    await signInOnPhone(page, managerAccount());
    await page.goto("/setari");
    const forbidden = page.getByTestId("forbidden");
    await expect(forbidden).toBeVisible({ timeout: 25_000 });

    await expectFitsPhone(page, "/setari 403");
    const back = forbidden.getByRole("link", { name: "Înapoi la tabloul de bord" });
    await expectValueOnScreen(back, "/setari 403 legatura");
    await shot(page, testInfo, "403");
  });

  test("(4) desktop neschimbat: la 1440px cifrele si cardurile CRM stau pe un rand, tabelele au antet", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signIn(page, ownerAccount());

    await page.goto("/");
    const stats = page.getByTestId("dashboard-stats").locator("> *");
    await expect(stats).toHaveCount(4, { timeout: 25_000 });
    expectSideBySide(await boxes([0, 1, 2, 3].map((i) => stats.nth(i))), "/ la 1440px");

    await page.goto("/crm");
    const cards = page.getByTestId("crm-card");
    await expect(cards).toHaveCount(3, { timeout: 25_000 });
    expectSideBySide(await boxes([0, 1, 2].map((i) => cards.nth(i))), "/crm la 1440px");

    for (const t of [
      { path: "/memento", row: page.getByTestId("threshold-row") },
      { path: "/necesar", row: page.locator("[data-testid^='need-row-']") },
    ]) {
      await page.goto(t.path);
      await expect.poll(() => t.row.count(), { timeout: 25_000 }).toBeGreaterThanOrEqual(1);
      await expect(page.locator("main thead").first()).toBeVisible();
      expect(await t.row.first().evaluate((tr) => getComputedStyle(tr).display), t.path).toBe("table-row");
      const label = await t.row
        .first()
        .locator("td")
        .first()
        .evaluate((td) => getComputedStyle(td, "::before").content);
      expect(["none", "normal"], `eticheta de telefon vizibila pe desktop, ${t.path}`).toContain(label);
    }
  });
});
