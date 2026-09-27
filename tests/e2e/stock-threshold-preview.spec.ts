import {
  expect,
  request,
  test,
  type APIRequestContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// stock-threshold-preview.spec - linia de acceptanta a cardului P3-107.
//
// Blocul "Produse sub prag" de pe tabloul de bord este o PREVIZUALIZARE: primele
// patru randuri, al patrulea stins de un degradeu, iar sub degradeu un buton pe
// toata latimea catre ecranul care le are pe toate. Cu patru produse sau mai
// putine: toate randurile, niciun degradeu, niciun buton.
//
// DE CE ACEST SPEC ISI IZOLEAZA DATELE, si de ce o face asa.
//
// Migratia 0049 incarca 80 de materiale cu stoc zero si prag zero, deci in orice
// rulare, inainte de orice test, baza are deja 80 de produse sub prag. Cele trei
// stari pe care cardul le promite (sase sub prag, trei sub prag, niciunul) nu pot
// fi produse adaugand randuri: numai restrangand ce este ACTIV, fiindca tabloul de
// bord citeste doar produsele active.
//
// Deci spec-ul isi noteaza toate produsele active, le DEZACTIVEAZA pe cele care nu
// sunt ale lui, isi joaca cele patru stari pe cele sapte produse proprii, si le
// REACTIVEAZA la sfarsit exact pe cele pe care le-a stins, dupa id.
//
// NICIUN RAND NU SE STERGE. Dezactivarea este anularea pe care o foloseste tot
// depozitul acesta de cod; stergerea este interzisa si nu exista nici politica
// pentru ea.
//
// ACEST FISIER RULEAZA ULTIMUL din suita, dupa nume, si asta este deliberat:
// daca reactivarea ar esua, niciun alt spec nu ar mai apuca sa vada catalogul
// stins. Un spec nou care trebuie sa ruleze dupa acesta primeste un nume care
// sorteaza dupa "stock-threshold-preview".

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const TAG = `TEST-LSP-${RUN}`;
/** Cate randuri deseneaza cardul. Aceeasi valoare ca LOW_STOCK_PREVIEW din app/(app)/page.tsx. */
const PREVIEW = 4;
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const MIN_TAP = 44;

/** Cele sase produse sub prag, plus al saptelea care are stoc peste prag. */
const LOW_SKUS = [1, 2, 3, 4, 5, 6].map((n) => `${TAG}-${n}`);
const STOCKED_SKU = `${TAG}-7`;

// ---------------------------------------------------------------------------
// Legatura directa la baza, ca administratorul. Aceeasi forma ca in
// phone-remainder.spec: cheia anonima plus jetonul contului de proprietar, nu
// cheia service_role, fiindca politicile de scriere pe products cer is_owner().
// ---------------------------------------------------------------------------

type OwnerRest = { api: APIRequestContext; headers: Record<string, string> };

async function ownerRest(): Promise<OwnerRest> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  expect(url, "P3-107 are nevoie de NEXT_PUBLIC_SUPABASE_URL").not.toBe("");
  expect(anonKey, "P3-107 are nevoie de NEXT_PUBLIC_SUPABASE_ANON_KEY").not.toBe("");

  const api = await request.newContext({ baseURL: url });
  const owner = ownerAccount();
  const token = await api.post("/auth/v1/token?grant_type=password", {
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    data: { email: owner.email, password: owner.password },
  });
  expect(token.ok(), await token.text()).toBe(true);
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

async function getRows(rest: OwnerRest, path: string): Promise<Record<string, unknown>[]> {
  const response = await rest.api.get(`/rest/v1/${path}`, { headers: rest.headers });
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
  return (await response.json()) as Record<string, unknown>[];
}

async function insertRows(
  rest: OwnerRest,
  table: string,
  data: unknown,
): Promise<Record<string, unknown>[]> {
  const response = await rest.api.post(`/rest/v1/${table}`, {
    headers: { ...rest.headers, Prefer: "return=representation" },
    data,
  });
  expect(response.status(), `${table}: ${await response.text()}`).toBe(201);
  return (await response.json()) as Record<string, unknown>[];
}

async function patchRows(rest: OwnerRest, path: string, data: unknown): Promise<void> {
  const response = await rest.api.patch(`/rest/v1/${path}`, {
    headers: { ...rest.headers, Prefer: "return=minimal" },
    data,
  });
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
}

/** Id-urile se trimit in bucati: o lista de sute de id-uri nu incape intr-o adresa. */
async function setActiveByIds(rest: OwnerRest, ids: string[], active: boolean): Promise<void> {
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40);
    await patchRows(rest, `products?id=in.(${chunk.join(",")})`, { active });
  }
}

/** Dintre cele sapte produse ale spec-ului, exact acestea raman active. */
async function keepActive(rest: OwnerRest, skus: string[]): Promise<void> {
  await patchRows(rest, `products?sku=like.${TAG}-*`, { active: false });
  if (skus.length > 0) {
    const list = skus.map((s) => `"${s}"`).join(",");
    await patchRows(rest, `products?sku=in.(${list})`, { active: true });
  }
}

// ---------------------------------------------------------------------------
// Citiri de pe ecran
// ---------------------------------------------------------------------------

/** Cifra din blocul "Produse sub prag", al doilea card de cifre. */
async function lowStockStat(page: Page): Promise<number> {
  const card = page.getByTestId("dashboard-stats").locator("> *").nth(1);
  const text = (await card.innerText()).replace(/ /g, " ");
  const match = text.match(/(\d[\d.]*)/);
  expect(match, `cifra "Produse sub prag" nu s-a citit din: ${text}`).not.toBeNull();
  return Number(match![1]!.replace(/\./g, ""));
}

type Box = { top: number; bottom: number; left: number; right: number; width: number; height: number };

async function box(page: Page, selector: string): Promise<Box> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`nu exista ${sel}`);
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
  }, selector);
}

const FADE = '[data-testid="dashboard-low-stock-fade"]';
const BUTTON = '[data-testid="dashboard-low-stock-all"]';
const TBODY = '[data-testid="dashboard-low-stock"]';

async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: info.outputPath(`p3-107-${name}.png`), fullPage: false });
}

// ---------------------------------------------------------------------------
// Pregatirea si curatenia
// ---------------------------------------------------------------------------

let rest: OwnerRest;
/** Produsele pe care acest spec le-a stins si le va reaprinde. */
let parked: string[] = [];

test.beforeAll(async () => {
  rest = await ownerRest();

  const categories = await getRows(rest, "categories?select=id&active=eq.true&order=sort_order&limit=1");
  expect(categories.length, "baza nu are nicio categorie activa").toBe(1);
  const categoryId = categories[0]!.id as string;

  // Cele sase produse sub prag: stoc zero, prag cinci.
  await insertRows(
    rest,
    "products",
    LOW_SKUS.map((sku, i) => ({
      sku,
      name: `TEST Prag ${RUN} ${i + 1}`,
      category_id: categoryId,
      unit: "pcs",
      threshold: 5,
      unit_value_mdl: 10,
    })),
  );

  // Al saptelea: prag zero si stoc zece, deci NU este sub prag. Stocul este suma
  // loturilor, iar un lot cere o comanda si o linie de comanda, exact ca la
  // receptia din aplicatie.
  const [stocked] = await insertRows(rest, "products", {
    sku: STOCKED_SKU,
    name: `TEST Prag ${RUN} cu stoc`,
    category_id: categoryId,
    unit: "pcs",
    threshold: 0,
    unit_value_mdl: 10,
  });
  const productId = stocked!.id as string;

  const [order] = await insertRows(rest, "inbound_orders", {
    reference: `${TAG}-IN`,
    supplier_name: `TEST Furnizor ${RUN}`,
    status: "arrived",
    arrived_at: new Date().toISOString(),
  });
  const orderId = order!.id as string;

  const [line] = await insertRows(rest, "order_lines", {
    inbound_order_id: orderId,
    product_id: productId,
    quantity: 10,
  });

  await insertRows(rest, "batches", {
    product_id: productId,
    inbound_order_id: orderId,
    order_line_id: line!.id as string,
    quantity: 10,
  });

  // Tot ce este activ si nu este al nostru se stinge, si se noteaza dupa id.
  const others = await getRows(rest, `products?select=id&active=eq.true&sku=not.like.${TAG}-*`);
  parked = others.map((r) => r.id as string);
  await setActiveByIds(rest, parked, false);

  const stillActive = await getRows(rest, `products?select=sku&active=eq.true&sku=not.like.${TAG}-*`);
  expect(stillActive, "au ramas produse active care nu sunt ale spec-ului").toEqual([]);
});

test.afterAll(async () => {
  if (!rest) return;
  // Se reaprind exact cele stinse, dupa id, si se lasa in pace cele care erau
  // deja inactive inainte de acest spec.
  await setActiveByIds(rest, parked, true);
  await keepActive(rest, [...LOW_SKUS, STOCKED_SKU]);
  const back = await getRows(rest, `products?select=id&active=eq.true&sku=not.like.${TAG}-*`);
  expect(back.length, "reactivarea nu a prins toate produsele").toBe(parked.length);
});

// ---------------------------------------------------------------------------
// Cazurile
// ---------------------------------------------------------------------------

test.describe.serial("P3-107: blocul Produse sub prag este o previzualizare", () => {
  test.describe.configure({ timeout: 120_000 });

  test("(a) sase produse sub prag: patru randuri, degradeu si butonul Vezi toate (6)", async ({
    page,
  }, info) => {
    await keepActive(rest, LOW_SKUS);
    await signIn(page, ownerAccount());
    await page.setViewportSize(DESKTOP);
    await page.goto("/");

    await expect(page.getByTestId("dashboard-stats")).toBeVisible({ timeout: 25_000 });

    // Cifra de sus numara TOT, nu previzualizarea: taierea este la desenare.
    expect(await lowStockStat(page), "cifra Produse sub prag").toBe(LOW_SKUS.length);

    const rows = page.locator(`${TBODY} > tr`);
    await expect(rows, "cardul deseneaza mai mult de patru randuri").toHaveCount(PREVIEW);

    const fade = page.locator(FADE);
    await expect(fade, "degradeul lipseste").toHaveCount(1);

    const button = page.locator(BUTTON);
    await expect(button).toHaveCount(1);
    await expect(button).toHaveText(`Vezi toate (${LOW_SKUS.length})`);
    await expect(button).toHaveAttribute("href", "/memento");

    // Culoarea de sosire a degradeului este fundalul cardului, nu un alb scris
    // de mana: un alb care nu se potriveste se vede ca o banda gri.
    const paint = await page.evaluate(
      ({ fadeSel, bodySel }) => {
        const el = document.querySelector(fadeSel)!;
        const card = document.querySelector(bodySel)!.closest("[class*='bg-rc-white']");
        const style = getComputedStyle(el);
        return {
          image: style.backgroundImage,
          pointerEvents: style.pointerEvents,
          position: style.position,
          cardBackground: card ? getComputedStyle(card).backgroundColor : "",
        };
      },
      { fadeSel: FADE, bodySel: TBODY },
    );
    expect(paint.position, "degradeul nu este pozitionat absolut").toBe("absolute");
    expect(paint.pointerEvents, "degradeul inghite clicurile").toBe("none");
    expect(paint.cardBackground, "fundalul cardului nu s-a citit").not.toBe("");
    expect(
      paint.image.includes(paint.cardBackground),
      `degradeul (${paint.image}) nu ajunge la fundalul cardului (${paint.cardBackground})`,
    ).toBe(true);

    // Geometria: degradeul sta la baza randurilor si NU peste buton.
    const fadeBox = await box(page, FADE);
    const buttonBox = await box(page, BUTTON);
    const fourth = await box(page, `${TBODY} > tr:nth-child(4)`);
    expect(fadeBox.bottom, "degradeul trece peste buton").toBeLessThanOrEqual(buttonBox.top + 0.5);
    expect(fadeBox.top, "degradeul nu atinge al patrulea rand").toBeGreaterThan(fourth.top);
    expect(fadeBox.bottom, "degradeul nu ajunge la baza randurilor").toBeGreaterThanOrEqual(
      fourth.bottom - 1,
    );

    await shot(page, info, "desktop-1440");
  });

  test("(b) degradeul nu fura clicul: legatura celui de al patrulea produs se deschide", async ({
    page,
  }) => {
    await keepActive(rest, LOW_SKUS);
    await signIn(page, ownerAccount());
    await page.setViewportSize(DESKTOP);
    await page.goto("/");

    const link = page.locator(`${TBODY} > tr:nth-child(4) a`).first();
    await expect(link).toBeVisible();

    // Chiar sub degradeu, elementul care primeste clicul este legatura.
    const onTop = await page.evaluate((sel) => {
      const el = document.querySelector(sel)!;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit ? (el.contains(hit) || hit === el ? "legatura" : (hit as HTMLElement).outerHTML.slice(0, 120)) : "nimic";
    }, `${TBODY} > tr:nth-child(4) a`);
    expect(onTop, "peste legatura sta altceva").toBe("legatura");

    await link.click();
    await expect(page).toHaveURL(/\/inventar/);
  });

  test("(c) trei produse sub prag: toate trei randurile, fara degradeu si fara buton", async ({
    page,
  }) => {
    await keepActive(rest, LOW_SKUS.slice(0, 3));
    await signIn(page, ownerAccount());
    await page.setViewportSize(DESKTOP);
    await page.goto("/");

    await expect(page.getByTestId("dashboard-stats")).toBeVisible({ timeout: 25_000 });
    expect(await lowStockStat(page), "cifra Produse sub prag").toBe(3);

    await expect(page.locator(`${TBODY} > tr`)).toHaveCount(3);
    await expect(page.locator(FADE), "degradeu la trei produse").toHaveCount(0);
    await expect(page.locator(BUTTON), "buton la trei produse").toHaveCount(0);
    await expect(page.getByText("Vezi toate")).toHaveCount(0);
  });

  test("(d) niciun produs sub prag: starea goala este cea de azi, fara degradeu si fara buton", async ({
    page,
  }) => {
    // Un singur produs activ, cu stoc peste prag: catalogul nu este gol, dar
    // nimic nu este sub prag.
    await keepActive(rest, [STOCKED_SKU]);
    await signIn(page, ownerAccount());
    await page.setViewportSize(DESKTOP);
    await page.goto("/");

    await expect(page.getByTestId("dashboard-stats")).toBeVisible({ timeout: 25_000 });
    expect(await lowStockStat(page), "cifra Produse sub prag").toBe(0);
    await expect(page.locator(`${TBODY} > tr`)).toHaveCount(0);
    await expect(page.locator(FADE)).toHaveCount(0);
    await expect(page.locator(BUTTON)).toHaveCount(0);
    await expect(page.getByText("Niciun produs sub pragul de recomandă.")).toHaveCount(1);

    // Niciun produs activ deloc: celalalt text al starii goale, tot neschimbat.
    await keepActive(rest, []);
    await page.goto("/");
    await expect(page.locator(`${TBODY} > tr`)).toHaveCount(0);
    await expect(page.locator(FADE)).toHaveCount(0);
    await expect(page.locator(BUTTON)).toHaveCount(0);
    await expect(page.getByText("Catalogul este gol.")).toHaveCount(1);
  });

  test("(e) pe telefon la 390x844: butonul pe toata latimea, degradeul la baza celui de al patrulea card", async ({
    page,
  }, info) => {
    await keepActive(rest, LOW_SKUS);
    await page.setViewportSize(DESKTOP);
    await signIn(page, ownerAccount());
    await page.setViewportSize(PHONE);
    await page.goto("/");

    await expect(page.getByTestId("dashboard-stats")).toBeVisible({ timeout: 25_000 });
    await expect(page.locator(`${TBODY} > tr`)).toHaveCount(PREVIEW);

    const reading = await page.evaluate(
      ({ buttonSel, width }) => {
        const main = document.querySelector("main");
        if (!main) throw new Error("pagina nu are <main>");
        const button = document.querySelector(buttonSel) as HTMLElement | null;
        if (!button) throw new Error("butonul lipseste pe telefon");
        const parent = button.parentElement!;
        const padding = getComputedStyle(parent);
        const inner =
          parent.getBoundingClientRect().width -
          parseFloat(padding.paddingLeft) -
          parseFloat(padding.paddingRight);
        // Orice element care trece de marginea din dreapta a radacinii lui, nu
        // doar de marginea ecranului: capcana din P3-97.
        const wider: string[] = [];
        for (const el of Array.from(main.querySelectorAll<HTMLElement>("*"))) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > width + 0.5) {
            wider.push(`${el.tagName.toLowerCase()}[${el.getAttribute("data-testid") ?? ""}] ${r.right.toFixed(0)}`);
          }
        }
        return {
          document: {
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          },
          main: { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth },
          button: { width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height },
          inner,
          wider,
        };
      },
      { buttonSel: BUTTON, width: PHONE.width },
    );

    expect(reading.wider, "elemente in afara ecranului pe tabloul de bord la 390px").toEqual([]);
    expect(reading.document.scrollWidth, "derulare laterala a documentului").toBeLessThanOrEqual(
      reading.document.clientWidth,
    );
    expect(reading.main.scrollWidth, "derulare laterala in main").toBeLessThanOrEqual(
      reading.main.clientWidth,
    );
    expect(reading.button.height, "butonul sub 44px").toBeGreaterThanOrEqual(MIN_TAP);
    expect(reading.button.width, "butonul nu ia toata latimea").toBeGreaterThanOrEqual(
      reading.inner - 1,
    );

    const fadeBox = await box(page, FADE);
    const buttonBox = await box(page, BUTTON);
    const fourth = await box(page, `${TBODY} > tr:nth-child(4)`);
    expect(fadeBox.bottom, "degradeul trece peste buton pe telefon").toBeLessThanOrEqual(
      buttonBox.top + 0.5,
    );
    expect(fadeBox.top, "degradeul nu atinge al patrulea card").toBeGreaterThan(fourth.top);
    expect(fadeBox.bottom, "degradeul nu ajunge la baza celui de al patrulea card").toBeGreaterThanOrEqual(
      fourth.bottom - 1,
    );

    await shot(page, info, "telefon-390");
  });
});
