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
//
// P3-113, goal G69 partea 2. BLOCURILE STAU ACUM IN SECTIUNI, sub un sub-meniu.
// Nimic nu s-a rescris: aceleasi patru blocuri, aceleasi data-testid, aceleasi
// formulare. Ce s-a schimbat este drumul pana la ele.
//
// ADRESA GOALA NU REDIRECTEAZA SI ARATA TOATE SECTIUNILE, si asta nu este lene.
// Trei lucruri o cer, si fiecare este un test care exista deja:
//   - tests/e2e/auth.spec.ts cere ca adresa sa ramana exact /setari;
//   - zece fisiere de test isi adauga o categorie de pe adresa goala, fara clic
//     (`category-name` plus `category-add`), fiindca asa isi face un test o
//     categorie inainte de a crea un produs;
//   - tests/e2e/facturare-settings.spec.ts cere `settings-facturare` VIZIBIL dupa
//     un simplu goto("/setari"), iar tests/e2e/phone-remainder.spec.ts cere
//     `category-row` si `unit-row` pe acelasi ecran, pe telefon.
// Deci implicitul este "toate secțiunile", iar fiecare secțiune are pe langa asta
// adresa ei proprie, ?sectiune=. Vezi lib/data/setari-sections.ts.
//
// SE CITESTE NUMAI CE SE ARATA. Pe ?sectiune=facturare nu se mai cere lista de
// produse din baza, iar pe ?sectiune=catalog nu se mai cere randul de facturare:
// un ecran de setari care aduce tot catalogul ca sa deseneze un formular de
// facturare este exact felul de risipa pe care a masurat-o cardul P3-40.

import Link from "next/link";
import { Card, CardHeader, Chip, PageHeader } from "@/components/ui/primitives";
import { PHONE_TAP } from "@/components/ui/phone";
import { listCategories, listProducts, listUnits, type Category } from "@/lib/data/products";
import type { UnitCode } from "@/lib/data/units";
import { getSessionUser } from "@/lib/supabase/server";
import { CategorySettings } from "@/components/settings/CategorySettings";
import { UnitSettings } from "@/components/settings/UnitSettings";
// P3-108, goal G65 partea 1. Blocul de facturare: seria, cota TVA implicita si
// datele firmei. Este singurul lucru care se vede pe ecran din acel card; lista de
// facturi si ecranul de creare sunt partile 2 si 3.
import { FacturareSettings } from "@/components/settings/FacturareSettings";
import { getInvoiceSettings } from "@/lib/data/facturare-settings";
import { SettingsSectionMenu } from "@/components/settings/SettingsSectionMenu";
import {
  parseSettingsSection,
  SETTINGS_SECTION_PARAM,
} from "@/lib/data/setari-sections";

export const dynamic = "force-dynamic";

type Catalog = {
  categories: Category[];
  perUnit: Array<{ unit: UnitCode; count: number }>;
};

/** Categoriile si unitatile, cu numarul de produse al fiecareia. */
async function loadCatalog(): Promise<Catalog> {
  const [categories, units, products] = await Promise.all([
    listCategories(),
    listUnits(),
    listProducts(),
  ]);
  return {
    categories,
    perUnit: units.map((u) => ({
      unit: u,
      count: products.filter((p) => p.unit === u).length,
    })),
  };
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const active = parseSettingsSection((await searchParams)[SETTINGS_SECTION_PARAM]);
  const shows = (id: "catalog" | "facturare" | "optiuni") => active === "toate" || active === id;

  const [user, catalog, invoiceSettings] = await Promise.all([
    getSessionUser(),
    shows("catalog") ? loadCatalog() : null,
    // Intoarce null cand migratia 0063 nu este inca aplicata, si blocul spune
    // atunci romaneste ca facturarea nu este activa in loc sa cada ecranul.
    shows("facturare") ? getInvoiceSettings() : null,
  ]);

  return (
    <>
      <PageHeader
        title="Setări"
        lead="Ce poate schimba administratorul: vocabularul catalogului, facturarea și opțiunile oferite pe formularul de produs."
        actions={<Chip tone="orange">Doar administrator</Chip>}
      />

      <SettingsSectionMenu active={active} />

      {/* VOCABULARUL CATALOGULUI: categoriile, care se editeaza, si unitatile, care
          nu. Stau impreuna fiindca amandoua sunt limba in care este scris catalogul,
          iar unitatile isi poarta pe ecran motivul pentru care sunt doar de citit. */}
      {catalog ? (
        <section data-testid="settings-catalog">
          <CategorySettings categories={catalog.categories} canWrite={user?.role === "owner"} />
          <UnitSettings rows={catalog.perUnit} />
        </section>
      ) : null}

      {shows("facturare") ? (
        <FacturareSettings
          settings={invoiceSettings}
          canWrite={user?.role === "owner"}
          // Anul se citeste pe SERVER si se trece in jos, ca exemplul de numar sa
          // nu se schimbe intre randare si hidratare la trecerea dintre ani.
          year={new Date().getUTCFullYear()}
        />
      ) : null}

      {/* P3-68. Lista de tabla are ecranul ei: 225 de randuri nu incap intr-un card de aici.
          P3-67. Pe telefon legatura este o tinta de 44px; peste 768px nimic nu se schimba.
          P3-113. Secțiunea este intrarea care PLEACA, exact cum pleaca si cardul de azi:
          titlul cardului ramane cel al ecranului pe care il deschide, ca cele doua sa nu
          se contrazica, iar eticheta din sub-meniu este numele secțiunii. */}
      {shows("optiuni") ? (
        <section data-testid="settings-optiuni">
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
        </section>
      ) : null}
    </>
  );
}
