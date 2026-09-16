import { expect, request, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// phone-lists.spec - linia de acceptanta a cardului P3-64 (G23 partea 2).
//
// Cele patru ecrane de lista pe un telefon de 390x844: Inventar, Clienți (cu
// vederile Toți, Leaduri si Clienți), Proiecte si Comenzi. Sub 768px fiecare rand
// de tabel devine un card, iar peste 768px nimic nu se schimba. Restul suitei
// ruleaza la 1440x900 si ramane neschimbat.
//
// CE INSEAMNA "INCAPE", masurat in pagina, nu citit din clase:
//   - fara derulare laterala: document.documentElement.scrollWidth <= clientWidth,
//     SI ACELASI LUCRU PENTRU <main>. Invelisul din app/(app)/layout.tsx da lui
//     <main> overflow-y-auto, deci o lista lata ar derula lateral IN <main> fara sa
//     latesca documentul, iar masuratoarea pe document singura ar fi un verde fals.
//   - tinta de atingere: fiecare control vizibil din <main> are cel putin 44px
//   - campurile si selecturile au text de cel putin 16px, altfel iOS mareste pagina
//   - nimic in afara ecranului si niciun text taiat in <main>
//   - un card pe rand: niciun antet de tabel vizibil, iar fiecare celula poarta ca
//     eticheta exact textul antetului coloanei ei
//
// DEPINDE DE INVELISUL PE TELEFON (P3-60): pana il are main, invelisul are o latime
// minima de 1100px si documentul deruleaza lateral pe orice ecran.
//
// DATELE. Produsele, proiectele si comenzile sunt cele semanate in CI de
// scripts/seed-test-procurement.mjs. Clientii sunt ai acestui spec, creati prin
// PostgREST exact ca in leaduri.spec, cu prefixul TEST si un sufix unic pe rulare,
// si nu se sterg niciodata.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const MIN_TAP = 44;
const MIN_INPUT_FONT = 16;

/** Proiectul semanat "TEST Necesar contract", cu bonul de iesire TEST-NEC-BON-1. */
const SEED_CONTRACT_PROJECT_ID = "7e57c051-0000-4000-8000-000000000703";

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
  expect(url, "P3-64 are nevoie de NEXT_PUBLIC_SUPABASE_URL").not.toBe("");
  expect(anonKey, "P3-64 are nevoie de NEXT_PUBLIC_SUPABASE_ANON_KEY").not.toBe("");

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

/** Creeaza clientii si ii muta pe cei ceruti la etapa Client prin functia aplicatiei. */
async function createClients(rest: OwnerRest, rows: { name: string; client: boolean }[]): Promise<void> {
  const created = await rest.api.post("/rest/v1/clients", {
    headers: { ...rest.headers, Prefer: "return=representation" },
    data: rows.map((r) => ({ name: r.name, active: true })),
  });
  expect(created.status(), await created.text()).toBe(201);
  const stored = (await created.json()) as { id: string; name: string }[];
  expect(stored).toHaveLength(rows.length);

  for (const row of rows) {
    // Un rand nou este deja `cold`, din valoarea implicita a coloanei.
    if (!row.client) continue;
    const id = stored.find((s) => s.name === row.name)!.id;
    const moved = await rest.api.post("/rest/v1/rpc/set_client_stage", {
      headers: rest.headers,
      data: { p_client_id: id, p_stage: "client", p_follow_up_date: null },
    });
    expect(moved.status(), await moved.text()).toBe(200);
  }
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

      const smallTargets: string[] = [];
      const controls = main.querySelectorAll(
        "input, select, button, a[href], [role='button'], [data-testid='product-row']",
      );
      for (const el of Array.from(controls)) {
        if (!visible(el)) continue;
        const height = el.getBoundingClientRect().height;
        if (height < minTap) smallTargets.push(`${name(el)} ${height.toFixed(1)}px`);
      }

      const smallFonts: string[] = [];
      for (const el of Array.from(main.querySelectorAll("input, select, textarea"))) {
        if (!visible(el)) continue;
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

/** Clauzele 1 si 2 si jumatatea de incadrare a clauzei 3, pe ecranul deschis. */
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
 * Un card pe rand: randul este o grila, nu un rand de tabel, si fiecare celula
 * poarta ca eticheta vizibila exact textul antetului coloanei ei.
 */
async function expectRowCards(rows: Locator, where: string): Promise<void> {
  const count = Math.min(await rows.count(), 5);
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const reading = await row.evaluate((tr) => {
      const heads = Array.from(tr.closest("table")?.querySelectorAll("thead th") ?? []).map((th) =>
        (th.textContent ?? "").trim(),
      );
      const labels = Array.from(tr.querySelectorAll(":scope > td")).map((td) => {
        const before = getComputedStyle(td, "::before");
        return {
          text: before.content.replace(/^"|"$/g, ""),
          shown: before.display !== "none" && before.content !== "none",
        };
      });
      return { display: getComputedStyle(tr).display, heads, labels };
    });
    expect(reading.display, `randul ${i} nu este card pe ${where}`).toBe("grid");
    expect(reading.heads.length, `tabel fara antet pe ${where}`).toBeGreaterThan(0);
    expect(
      reading.labels.map((l) => l.text),
      `etichetele randului ${i} pe ${where}`,
    ).toEqual(reading.heads);
    for (const label of reading.labels) {
      expect(label.shown, `eticheta ${label.text} ascunsa pe ${where}`).toBe(true);
    }
  }
}

/** Clauza 3: o valoare distinctiva este vizibila si sta intre 0 si 390px. */
async function expectValueOnScreen(value: Locator, where: string): Promise<void> {
  await value.scrollIntoViewIfNeeded();
  await expect(value).toBeVisible();
  const box = await value.boundingBox();
  expect(box, `valoarea nu are cutie pe ${where}`).not.toBeNull();
  expect(box!.x, `valoarea iese spre stanga pe ${where}`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `valoarea iese spre dreapta pe ${where}`).toBeLessThanOrEqual(PHONE.width);
}

/** Autentificare la latimea desktop, cum o face restul suitei, apoi telefonul. */
async function signInOnPhone(page: Page): Promise<void> {
  await page.setViewportSize(DESKTOP);
  await signIn(page, ownerAccount());
  await page.setViewportSize(PHONE);
}

// ---------------------------------------------------------------------------
// Cazurile
// ---------------------------------------------------------------------------

test.describe("P3-64: listele pe telefon (390x844), un card pe rand", () => {
  test("(1) Inventar: produsele semanate sunt carduri, filtrele incap, SKU-ul se vede", async ({
    page,
  }, testInfo) => {
    await signInOnPhone(page);
    await page.goto("/inventar");
    await page.getByTestId("product-search").fill("TEST-NEC");

    const rows = page.getByTestId("product-row");
    await expect.poll(() => rows.count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(3);

    await expectFitsPhone(page, "/inventar");
    await expectRowCards(rows, "/inventar");
    for (const sku of ["TEST-NEC-01", "TEST-NEC-02", "TEST-NEC-03"]) {
      const row = page.locator(`[data-testid='product-row'][data-sku='${sku}']`);
      await expectValueOnScreen(row.getByText(sku, { exact: true }), `/inventar ${sku}`);
    }
    await page.screenshot({ path: testInfo.outputPath("phone-lists-inventar.png") });
  });

  test("(2) Clienți, Leaduri si vederea Clienți: fiecare rand este card, numele se vede", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const rest = await ownerRest();
    const tag = `TEST Telefon Liste ${RUN}`;
    const leads = [1, 2, 3].map((n) => `${tag} lead ${n}`);
    // Un nume lung, fara loc de rupere firesc, ca sa se vada ca se rupe, nu se taie.
    const clients = [
      `${tag} client 1 Societatea cu Răspundere Limitată Construcții și Acoperișuri Generale`,
      `${tag} client 2`,
      `${tag} client 3`,
    ];
    await createClients(rest, [
      ...leads.map((name) => ({ name, client: false })),
      ...clients.map((name) => ({ name, client: true })),
    ]);
    await rest.api.dispose();

    await signInOnPhone(page);
    const q = encodeURIComponent(tag);
    const views = [
      { path: `/clienti?q=${q}`, names: [...leads, ...clients], shot: "clienti-toti" },
      { path: `/clienti?vedere=leaduri&q=${q}`, names: leads, shot: "leaduri" },
      { path: `/clienti?vedere=clienti&q=${q}`, names: clients, shot: "clienti" },
    ];

    for (const view of views) {
      await page.goto(view.path);
      const rows = page.getByTestId("client-row");
      await expect(rows).toHaveCount(view.names.length, { timeout: 20_000 });

      await expectFitsPhone(page, view.path);
      await expectRowCards(rows, view.path);
      for (const name of view.names) {
        const link = page.getByTestId("client-link").filter({ hasText: name });
        await expectValueOnScreen(link, `${view.path} ${name}`);
      }
      await page.screenshot({ path: testInfo.outputPath(`phone-lists-${view.shot}.png`) });
    }
  });

  test("(3) Proiecte: proiectele semanate sunt carduri, proiectul si clientul se vad", async ({
    page,
  }, testInfo) => {
    await signInOnPhone(page);
    const path = `/proiecte?stare=toate&q=${encodeURIComponent("TEST Necesar")}`;
    await page.goto(path);

    const rows = page.getByTestId("project-row");
    await expect.poll(() => rows.count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(3);

    await expectFitsPhone(page, path);
    await expectRowCards(rows, path);
    const contract = page.locator("[data-testid='project-row'][data-name='TEST Necesar contract']");
    await expectValueOnScreen(contract.getByTestId("project-link"), `${path} proiectul`);
    await expectValueOnScreen(
      contract.getByRole("link", { name: "TEST Beneficiar Necesar", exact: true }),
      `${path} clientul`,
    );
    await page.screenshot({ path: testInfo.outputPath("phone-lists-proiecte.png") });
  });

  test("(4) Comenzi: intrarile si iesirile stau una sub alta, referintele se vad", async ({
    page,
  }, testInfo) => {
    await signInOnPhone(page);

    await page.goto("/comenzi");
    const inbound = page.getByTestId("inbound-item");
    const outbound = page.getByTestId("outbound-item");
    await expect.poll(() => inbound.count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
    await expect.poll(() => outbound.count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
    await expectFitsPhone(page, "/comenzi");

    // Una sub alta: lista de iesiri incepe sub lista de intrari, nu langa ea.
    const inList = await page.getByTestId("inbound-list").boundingBox();
    const outList = await page.getByTestId("outbound-list").boundingBox();
    expect(outList!.y, "iesirile nu stau sub intrari").toBeGreaterThanOrEqual(inList!.y + inList!.height);

    await expectValueOnScreen(
      page.locator("[data-testid='inbound-item'][data-reference='TEST-NEC-INTRARE']"),
      "/comenzi TEST-NEC-INTRARE",
    );
    for (const reference of ["TEST-NEC-BON-1", "TEST-NEC-BON-2"]) {
      await expectValueOnScreen(
        page.locator(`[data-testid='outbound-item'][data-reference='${reference}']`),
        `/comenzi ${reference}`,
      );
    }
    await page.locator("main").evaluate((main) => main.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath("phone-lists-comenzi.png") });

    // Filtrat pe proiect: apare butonul Vezi toate ieșirile, care e si el o tinta.
    const filtered = `/comenzi?proiect=${SEED_CONTRACT_PROJECT_ID}`;
    await page.goto(filtered);
    await expect(page.getByTestId("orders-clear-filter")).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => inbound.count()).toBeGreaterThanOrEqual(1);
    await expect.poll(() => outbound.count()).toBeGreaterThanOrEqual(1);
    await expectFitsPhone(page, filtered);
    await expectValueOnScreen(
      page.locator("[data-testid='outbound-item'][data-reference='TEST-NEC-BON-1']"),
      `${filtered} TEST-NEC-BON-1`,
    );
  });

  test("(5) Desktop neschimbat: la 1440px listele sunt tot tabele cu antet, iar Comenzi are doua coloane", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signIn(page, ownerAccount());

    const tables = [
      { path: "/inventar", row: "product-row" },
      { path: `/clienti?q=${encodeURIComponent("TEST Beneficiar")}`, row: "client-row" },
      { path: `/proiecte?stare=toate&q=${encodeURIComponent("TEST Necesar")}`, row: "project-row" },
    ];
    for (const t of tables) {
      await page.goto(t.path);
      const rows = page.getByTestId(t.row);
      await expect.poll(() => rows.count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
      await expect(page.locator("main thead").first()).toBeVisible();
      expect(await rows.first().evaluate((tr) => getComputedStyle(tr).display), t.path).toBe("table-row");
      const label = await rows
        .first()
        .locator("td")
        .first()
        .evaluate((td) => getComputedStyle(td, "::before").content);
      expect(["none", "normal"], `eticheta de telefon vizibila pe desktop, ${t.path}`).toContain(label);
    }

    await page.goto("/comenzi");
    await expect(page.getByTestId("inbound-list")).toBeVisible({ timeout: 20_000 });
    const inList = await page.getByTestId("inbound-list").boundingBox();
    const outList = await page.getByTestId("outbound-list").boundingBox();
    expect(Math.abs(outList!.y - inList!.y), "intrarile si iesirile nu mai stau alaturi").toBeLessThanOrEqual(1);
    expect(outList!.x, "iesirile nu stau in dreapta intrarilor").toBeGreaterThan(inList!.x + inList!.width);
  });
});
