// P3-68. Model, serie si grosime: lista de tabla si tigla metalica, administrata de
// proprietar.
//
// Pana la acest card lista si preturile ei se schimbau numai printr-o migratie scrisa
// de un programator. Aici proprietarul adauga o combinatie, schimba pretul liniei ei
// si retrage ce nu mai vinde. Nimic nu se sterge.
//
// Ruta este deja pazita: /setari este in OWNER_ONLY_PREFIXES, deci proxy.ts o refuza
// pentru account_manager si arata 403. Scrierile sunt pazite a doua oara de server
// actions si a treia oara de politicile din migratia 0048.

import Link from "next/link";
import { Chip, PageHeader } from "@/components/ui/primitives";
import { SheetOptionsSettings } from "@/components/settings/SheetOptionsSettings";
import { listSheetOptionsForAdmin } from "@/lib/data/sheet-options";
import { ALL_UNITS } from "@/lib/data/units";

export const dynamic = "force-dynamic";

export default async function SheetOptionsPage() {
  const { active, writable, rows } = await listSheetOptionsForAdmin();

  return (
    <>
      <PageHeader
        title="Model, serie și grosime"
        lead="Combinațiile de tablă și țiglă metalică pe care le oferă formularul de produs, cu prețul fiecăreia. O combinație retrasă nu se mai oferă la un produs nou, iar produsele care o au deja o păstrează."
        actions={
          <>
            <Link
              href="/setari"
              className="inline-flex items-center rounded-[10px] border border-rc-line-strong bg-rc-white px-3 py-1.5 text-[13px] font-semibold text-rc-black hover:bg-rc-paper"
              data-testid="sheet-admin-back"
            >
              Înapoi la Setări
            </Link>
            <Chip tone="orange">Doar administrator</Chip>
          </>
        }
      />

      <SheetOptionsSettings active={active} writable={writable} rows={rows} units={ALL_UNITS} />
    </>
  );
}
