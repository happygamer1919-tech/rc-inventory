import { expect, test, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// load-80-materials.spec - linia de acceptanta a cardului P3-69.
//
// Cele patru cazuri ale cardului, in ordinea lui:
//   1. Inventarul arata cel putin un produs din fiecare dintre cele sase categorii
//      adaugate de migratia 0049, cu categoria lui, iar formularul lui de modificare
//      arata Valoare unitara (MDL) egala cu pretul de partener din lista;
//   2. public.products poarta exact 80 de randuri cu marcajul incarcarii (forma
//      SKU-ului si o nota "Sursă: "), iar unit_value_mdl insumeaza 12842.88;
//   3. furnizorul: o tigla metalica arata Roofart/Bilka, un jgheab 125/90 nu are
//      furnizor, iar un rand din lista foto Dasterum arata Dasterum;
//   4. o a doua inserare a aceluiasi SKU, cu forma migratiei (on conflict pe sku, nu
//      face nimic), nu creeaza un duplicat si nu schimba pretul.
//
// VALORILE ASTEPTATE SUNT SCRISE DE MANA, din
// inputs/materiale-noi-2026-09-16-verificat.csv (verificata de Max 2026-09-16), si
// nu citite din baza: un test care isi ia asteptarea din acelasi loc din care
// ecranul isi ia valoarea ar trece si pe o lista gresita.
//
// CE SE CITESTE DIN BAZA SE CITESTE CU CHEIA service_role a stivei LOCALE, ca in
// roofing-product-prices.spec.
//
// NU SE CREEAZA SI NU SE STERGE NICIUN RAND. Cazul 4 cere o inserare pe care baza o
// ignora, si verifica exact ca a ignorat-o.

/** Un produs din fiecare categorie, cum il scrie lista verificata. */
const SAMPLES = [
  {
    sku: "TM-001",
    name: "BARCELONA ECO 0.45",
    category: "Țiglă metalică",
    supplier: "Roofart/Bilka",
    unitValue: "129",
    source: "Sursă: pret parteneri.pdf",
  },
  {
    sku: "TMRV-002",
    name: "NOVATIK SLATE",
    category: "Țiglă metalică cu rocă vulcanică",
    supplier: "Novatik",
    unitValue: "204",
    source: "Sursă: pret roca,Ceramica,sindrila.pdf",
  },
  {
    sku: "TC-001",
    name: "Creaton Balance",
    category: "Țiglă ceramică",
    supplier: "Creaton",
    unitValue: "43",
    source: "8,4 buc/m² · Sursă: pret roca,Ceramica,sindrila.pdf",
  },
  {
    sku: "SB-001",
    name: "IKO Cambridge Xpress",
    category: "Șindrilă bituminoasă",
    supplier: "IKO",
    unitValue: "258",
    source: "Sursă: pret roca,Ceramica,sindrila.pdf",
  },
  {
    sku: "SS-001",
    name: "125/90 MAT Jgheab Semicircular L-3000",
    category: "Sistem de scurgere",
    supplier: null,
    unitValue: "213.68",
    source: "Sursă: sistem scurgere .pdf",
  },
  {
    sku: "SSRB-001",
    name: "Jgheab L-4000 RAL Ø125/87",
    category: "Sistem de scurgere Roofart/Bilka",
    supplier: "Dasterum",
    unitValue: "481",
    source: "cod JB, lista Dasterum 27.03.2025 nr 49 · Sursă: poza lista Dasterum 27.03.2025",
  },
] as const;

const LOAD_SKU = /^(TM|TMRV|TC|SB|SS|SSRB)-[0-9]{3}$/;
const ROW_COUNT = 80;
const TOTAL_BANI = 1_284_288; // 12842.88 lei, in bani, ca suma sa nu treaca prin virgula mobila

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    throw new Error(
      "load-80-materials.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL si SUPABASE_SERVICE_ROLE_KEY. " +
        "In CI sunt exportate de pasul 'Export local Supabase credentials'. Local: supabase status -o env.",
    );
  }
  return { origin: new URL(url).origin, service };
}

async function rest(path: string, init: RequestInit = {}): Promise<Record<string, unknown>[]> {
  const { origin, service } = env();
  const response = await fetch(`${origin}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`rest ${path} a raspuns ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : []) as Record<string, unknown>[];
}

type LoadRow = { sku: string; unit_value_mdl: number | string; source_note: string | null };

/** Randurile incarcarii: forma SKU-ului SI o nota "Sursă: ", exact marcajul migratiei. */
async function loadRows(): Promise<LoadRow[]> {
  const rows = (await rest(
    "products?select=sku,unit_value_mdl,source_note&source_note=not.is.null",
  )) as unknown as LoadRow[];
  return rows.filter((r) => LOAD_SKU.test(r.sku) && (r.source_note ?? "").includes("Sursă: "));
}

/* ---------------------------------------------------------------- ecrane -- */

async function openProduct(page: Page, sku: string) {
  await page.goto("/inventar");
  await page.getByTestId("product-search").fill(sku);
  const row = page.locator(`[data-testid="product-row"][data-sku="${sku}"]`);
  await expect(row).toHaveCount(1, { timeout: 20_000 });
  return row;
}

test.describe("Cele 80 de materiale noi din lista verificată", () => {
  test.describe.configure({ timeout: 180_000 });

  test("1. inventarul arată un produs din fiecare categorie nouă, cu prețul de partener", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());

    for (const s of SAMPLES) {
      const row = await openProduct(page, s.sku);
      await expect(row, s.sku).toHaveAttribute("data-name", s.name);
      await expect(row.locator('[data-label="Categorie"]'), s.sku).toHaveText(s.category);

      await row.click();
      const panel = page.getByTestId("product-panel");
      await expect(panel).toBeVisible();
      await expect(page.getByTestId("panel-name")).toHaveText(s.name);
      await expect(page.getByTestId("panel-source-note")).toHaveText(s.source);

      await page.getByTestId("panel-edit").click();
      await expect(page.getByTestId("product-form")).toBeVisible();
      await expect(page.getByTestId("field-unit-value"), `${s.sku} valoare unitară`).toHaveValue(
        s.unitValue,
      );
    }
  });

  test("2. exact 80 de produse poartă marcajul încărcării, iar prețurile însumează 12842.88", async () => {
    const rows = await loadRows();
    expect(rows).toHaveLength(ROW_COUNT);
    expect(new Set(rows.map((r) => r.sku)).size).toBe(ROW_COUNT);

    const bani = rows.reduce((sum, r) => sum + Math.round(Number(r.unit_value_mdl) * 100), 0);
    expect(bani).toBe(TOTAL_BANI);

    // Numarul pe categorie, tot din lista: 8, 3, 2, 2, 14 si 51.
    const byPrefix = new Map<string, number>();
    for (const r of rows) {
      const prefix = r.sku.split("-")[0]!;
      byPrefix.set(prefix, (byPrefix.get(prefix) ?? 0) + 1);
    }
    expect(Object.fromEntries(byPrefix)).toEqual({ TM: 8, TMRV: 3, TC: 2, SB: 2, SS: 14, SSRB: 51 });
  });

  test("3. furnizorul: Roofart/Bilka pe țiglă, niciunul pe jgheabul 125/90, Dasterum pe lista foto", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());

    for (const s of SAMPLES.filter((x) => ["TM-001", "SS-001", "SSRB-001"].includes(x.sku))) {
      const row = await openProduct(page, s.sku);
      await expect(row.locator('[data-label="Furnizor"]'), s.sku).toHaveText(s.supplier ?? "-");

      await row.click();
      const link = page.getByTestId("product-supplier-link");
      if (s.supplier) {
        await expect(link, s.sku).toHaveText(s.supplier);
        await expect(link).toHaveAttribute("data-linked", "true");
      } else {
        await expect(link, s.sku).toHaveText("Fără furnizor");
        await expect(link).toHaveAttribute("data-linked", "false");
      }
    }

    // Si in baza, unde nu se vede pe ecran: jgheaburile 125/90 nu au niciun furnizor.
    const gutters = await rest("products?select=sku,supplier_id&sku=like.SS-*&source_note=not.is.null");
    const plain = gutters.filter((r) => /^SS-[0-9]{3}$/.test(String(r.sku)));
    expect(plain).toHaveLength(14);
    expect(plain.filter((r) => r.supplier_id !== null)).toHaveLength(0);
  });

  test("4. o a doua inserare a aceluiași SKU nu creează un duplicat și nu schimbă prețul", async () => {
    const [existing] = await rest("products?select=sku,category_id,unit,unit_value_mdl&sku=eq.TM-001");
    expect(existing, "TM-001").toBeTruthy();

    // Forma migratiei: insert ... on conflict (sku) do nothing. PostgREST o spune
    // on_conflict=sku cu resolution=ignore-duplicates.
    await rest("products?on_conflict=sku", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify([
        {
          sku: "TM-001",
          name: "BARCELONA ECO 0.45",
          category_id: existing!.category_id,
          unit: existing!.unit,
          unit_value_mdl: 999,
          source_note: "Sursă: pret parteneri.pdf",
        },
      ]),
    });

    const after = await rest("products?select=sku,unit_value_mdl&sku=eq.TM-001");
    expect(after).toHaveLength(1);
    expect(Number(after[0]!.unit_value_mdl)).toBe(129);
    expect(await loadRows()).toHaveLength(ROW_COUNT);
  });
});
