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

import Link from "next/link";
import { Card, CardHeader, Chip, PageHeader } from "@/components/ui/primitives";
import { PHONE_TAP } from "@/components/ui/phone";
import { listCategories, listProducts, listUnits } from "@/lib/data/products";
import { getSessionUser } from "@/lib/supabase/server";
import { CategorySettings } from "@/components/settings/CategorySettings";
import { UnitSettings } from "@/components/settings/UnitSettings";
// P3-108, goal G65 partea 1. Blocul de facturare: seria, cota TVA implicita si
// datele firmei. Este singurul lucru care se vede pe ecran din acel card; lista de
// facturi si ecranul de creare sunt partile 2 si 3.
import { FacturareSettings } from "@/components/settings/FacturareSettings";
import { getInvoiceSettings } from "@/lib/data/facturare-settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [categories, units, products, user, invoiceSettings] = await Promise.all([
    listCategories(),
    listUnits(),
    listProducts(),
    getSessionUser(),
    // Intoarce null cand migratia 0063 nu este inca aplicata, si blocul spune
    // atunci romaneste ca facturarea nu este activa in loc sa cada ecranul.
    getInvoiceSettings(),
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

      {/* P3-68. Lista de tabla are ecranul ei: 225 de randuri nu incap intr-un card de aici.
          P3-67. Pe telefon legatura este o tinta de 44px; peste 768px nimic nu se schimba. */}
      <Card className="mb-5">
        <CardHeader
          title="Model, serie și grosime"
          hint="Combinațiile de tablă și țiglă metalică oferite pe formularul de produs, cu prețurile lor."
          right={
            <Link
              href="/setari/tabla"
              className={`inline-flex items-center rounded-[10px] border border-rc-line-strong bg-rc-white px-3 py-1.5 text-[13px] font-semibold text-rc-black hover:bg-rc-paper ${PHONE_TAP}`}
              data-testid="settings-sheet-options-link"
            >
              Administrează lista
            </Link>
          }
        />
      </Card>

      <FacturareSettings
        settings={invoiceSettings}
        canWrite={user?.role === "owner"}
        // Anul se citeste pe SERVER si se trece in jos, ca exemplul de numar sa
        // nu se schimbe intre randare si hidratare la trecerea dintre ani.
        year={new Date().getUTCFullYear()}
      />

      <UnitSettings rows={perUnit} />
    </>
  );
}
