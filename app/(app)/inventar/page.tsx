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

import { listCategories, listProducts, listSuppliers, listUnits } from "@/lib/data/products";
import { hasProductImage } from "@/lib/data/schema-capability";
import { listSheetOptions } from "@/lib/data/sheet-options";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { InventoryScreen } from "@/components/inventory/InventoryScreen";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const [products, categories, units, suppliers, user, imagesActive, sheetOptions] = await Promise.all([
    listProducts(),
    listCategories(),
    listUnits(),
    listSuppliers(),
    getSessionUser(),
    // P3-56: campul de imagine apare numai dupa ce migratia 0045 este aplicata.
    createClient().then(hasProductImage),
    // P3-57: lista de tabla Dasterum, goala pana cand migratia 0046 este aplicata.
    listSheetOptions(),
  ]);

  return (
    <InventoryScreen
      products={products}
      categories={categories}
      units={units}
      suppliers={suppliers}
      canWrite={user?.role === "owner"}
      imagesActive={imagesActive}
      sheetOptions={sheetOptions}
    />
  );
}
