// P2-03 Setari, pe date reale.
//
// Faza 1 arata categoriile si unitatile doar ca sa demonstreze ca sistemul stie
// ce sunt. Acum categoriile se si administreaza, pentru ca produsele au nevoie
// de ele: un catalog gol are zero categorii, iar formularul de produs cere una.
//
// Unitatile raman NEEDITABILE si asta nu este o lipsa. Setul lor este fixat de
// enumul unit_code din migratia 0001, deci o unitate noua este o migratie, nu un
// rand introdus dintr-un ecran. Ecranul spune asta pe fata.
//
// Ruta este deja pazita: proxy.ts o refuza pentru account_manager si arata 403.

import { Chip, PageHeader } from "@/components/ui/primitives";
import { listCategories, listProducts, listUnits } from "@/lib/data/products";
import { getSessionUser } from "@/lib/supabase/server";
import { CategorySettings } from "@/components/settings/CategorySettings";
import { UnitSettings } from "@/components/settings/UnitSettings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [categories, units, products, user] = await Promise.all([
    listCategories(),
    listUnits(),
    listProducts(),
    getSessionUser(),
  ]);

  const perUnit = units.map((u) => ({
    unit: u,
    count: products.filter((p) => p.unit === u).length,
  }));

  return (
    <>
      <PageHeader
        title="Setări"
        lead="Categoriile pe care le folosește catalogul și unitățile de măsură pe care le cunoaște sistemul."
        actions={<Chip tone="orange">Doar administrator</Chip>}
      />

      <CategorySettings categories={categories} canWrite={user?.role === "owner"} />
      <UnitSettings rows={perUnit} />
    </>
  );
}
