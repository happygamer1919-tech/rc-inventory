// P2-03 Inventar, pe date reale.
//
// Ecranul in care traieste depozitul, deci trebuie sa suporte sa fie umblat, nu
// doar privit. Cele patru filtre lucreaza impreuna, iar randul deschide un panou
// lateral cu loturile si miscarile produsului. Panou, nu pagina, ca sa nu se
// piarda filtrele si pozitia in lista.
// Un singur depozit, deci nu exista coloana de locatie.
//
// Ce s-a schimbat fata de faza 1: sursa datelor, si numai ea. Aspectul, ordinea
// coloanelor, textele si tokenurile raman identice, pentru ca ecranul a fost
// aprobat de proprietar si aratat clientului. Regula este scrisa in defaults-ul
// cardului: designul vizual este inghetat.
//
// Componenta este server: citeste, apoi preda ecranului client. Asa catalogul
// vine din baza la fiecare cerere si nu exista strat de date in browser.
//
// P3-142. LISTA VINE PE PAGINI. Filtrele si pagina sunt in adresa (?pagina=2, ?q=, ?categorie=,
// ?furnizor=, ?nivel=, ?vizibilitate=), serverul citeste o singura pagina de 50 de produse si
// aduna stocul numai pentru ele. Tabloul de bord, memento-ul de stoc, necesarul si alegerile
// din formulare raman pe citirea intreaga a catalogului (listProducts): ele au nevoie de
// totaluri pe tot catalogul, nu de o pagina.

import {
  getProductBySku,
  listCategories,
  listProductsPage,
  listSuppliers,
  listUnits,
} from "@/lib/data/products";
import { parsePage } from "@/lib/data/list-paging";
import {
  STOCK_LEVEL_VALUES,
  VISIBILITY_VALUES,
  type ProductFilter,
} from "@/lib/data/product-filter";
import { hasProductImage } from "@/lib/data/schema-capability";
import { listSheetOptions } from "@/lib/data/sheet-options";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { InventoryScreen } from "@/components/inventory/InventoryScreen";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

/** Prima valoare a unui parametru, ca text. Orice altceva este gol. */
function first(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : (value?.[0] ?? "");
}

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const filter: ProductFilter = {
    q: first(search.q).trim(),
    category: first(search.categorie),
    supplier: first(search.furnizor),
    level: STOCK_LEVEL_VALUES.find((v) => v === first(search.nivel)) ?? "toate",
    visibility: VISIBILITY_VALUES.find((v) => v === first(search.vizibilitate)) ?? "active",
  };
  const sku = first(search.produs);

  const [list, categories, units, suppliers, user, imagesActive, sheetOptions, openProduct] =
    await Promise.all([
      listProductsPage(filter, parsePage(first(search.pagina))),
      listCategories(),
      listUnits(),
      listSuppliers(),
      getSessionUser(),
      // P3-56: campul de imagine apare numai dupa ce migratia 0045 este aplicata.
      createClient().then(hasProductImage),
      // P3-57: lista de tabla Dasterum, goala pana cand migratia 0046 este aplicata.
      listSheetOptions(),
      // Produsul din ?produs=<sku> se citeste separat: nu este neaparat pe pagina deschisa.
      sku ? getProductBySku(sku) : Promise.resolve(null),
    ]);

  return (
    <InventoryScreen
      products={list.products}
      filter={filter}
      page={list.page}
      total={list.total}
      visibleTotal={list.visibleTotal}
      catalogTotal={list.catalogTotal}
      openProduct={openProduct}
      categories={categories}
      units={units}
      suppliers={suppliers}
      canWrite={user?.role === "owner"}
      imagesActive={imagesActive}
      sheetOptions={sheetOptions}
    />
  );
}
