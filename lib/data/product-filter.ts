// P3-129. FILTRELE LISTEI DE INVENTAR, O SINGURA DATA, fara nimic de server.
//
// Ecranul (InventoryScreen) si exportul de materiale aleg randurile prin ACEASTA functie, ca
// fisierul exportat sa nu poata deveni vreodata alta vedere decat cea de pe ecran. Corpul
// este cel de pana acum al ecranului, mutat aici fara nicio schimbare de comportament.

import { normalizeText } from "./format";
import type { CatalogProduct } from "./products";

export type StockLevel = "toate" | "redus" | "epuizat" | "suficient";
export type Visibility = "active" | "toate" | "inactive";

export const STOCK_LEVEL_VALUES: StockLevel[] = ["toate", "redus", "epuizat", "suficient"];
export const VISIBILITY_VALUES: Visibility[] = ["active", "toate", "inactive"];

/** Ce a ales operatorul pe ecran. `category` si `supplier` sunt id-uri, sirul gol inseamna toate. */
export type ProductFilter = {
  q: string;
  category: string;
  supplier: string;
  level: StockLevel;
  visibility: Visibility;
};

/** Produsele vizibile dupa filtrul de activ/inactiv. */
export function filterByVisibility(products: CatalogProduct[], visibility: Visibility): CatalogProduct[] {
  return products.filter((p) => (visibility === "active" ? p.active : visibility === "inactive" ? !p.active : true));
}

/** Celelalte patru filtre, peste produsele deja trecute prin `filterByVisibility`. */
export function filterByRest(
  visible: CatalogProduct[],
  filter: Pick<ProductFilter, "q" | "category" | "supplier" | "level">,
): CatalogProduct[] {
  const needle = normalizeText(filter.q.trim());
  return visible.filter((p) => {
    if (needle && !normalizeText(p.name).includes(needle) && !normalizeText(p.sku).includes(needle)) return false;
    if (filter.category && p.categoryId !== filter.category) return false;
    // Filtrul compara ID-uri de acum, nu nume: doua scrieri ale aceluiasi
    // furnizor erau doua optiuni in lista si un filtru gasea doar jumatate.
    if (filter.supplier && (p.supplierId ?? "") !== filter.supplier) return false;
    const low = p.stock <= p.threshold;
    if (filter.level === "redus" && !(low && p.stock > 0)) return false;
    if (filter.level === "epuizat" && p.stock !== 0) return false;
    if (filter.level === "suficient" && low) return false;
    return true;
  });
}

/** Vederea intreaga: exact ce arata lista cu filtrele date. */
export function filterProducts(products: CatalogProduct[], filter: ProductFilter): CatalogProduct[] {
  return filterByRest(filterByVisibility(products, filter.visibility), filter);
}
