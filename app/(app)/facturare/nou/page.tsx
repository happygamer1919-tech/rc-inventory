// Factura nouă. Cardul P3-110, goal G65 partea 3.
//
// DOUA CAI PE ACEEASI RUTA:
//
//   /facturare/nou?iesire=<id>   completata din Iesire, care este calea ce conteaza:
//                                acolo datele exista deja si nu se pot greși
//   /facturare/nou               calea manuala, cea mai mica, si exista fiindca nu tot
//                                ce se factureaza este o eliberare de material
//
// RUTA STATICA CASTIGA IN FATA SEGMENTULUI DINAMIC /facturare/[id], care este regula de
// potrivire a Next.js, deci "nou" nu ajunge niciodata sa fie citit ca un id de factura.
//
// POARTA DE SCHEMA ESTE PRIMUL LUCRU, ca pe fiecare ecran de facturare: fara ea, ruta ar
// cere public.invoices inainte ca migratia 0063 sa fie aplicata, PostgREST ar raspunde ca
// nu o are si ruta ar da 500. Aceea este INC-05.
//
// NIMIC NU SE SCRIE LA DESCHIDERE. Formularul se completeaza din Iesire si nu creeaza
// nicio ciornă: o ciornă scrisa la fiecare deschidere a unui ecran ar umple lista cu
// facturi pe care nimeni nu a cerut, si ele nici nu s-ar putea sterge.

import { SchemaPending } from "@/components/ui/SchemaPending";
import { FacturaEditor } from "@/components/facturare/FacturaEditor";
import { FacturaRefuz } from "@/components/facturare/FacturaRefuz";
import { getInvoiceEditor } from "@/lib/data/facturare-create";

export const dynamic = "force-dynamic";

const LEAD = "Factură nouă, din pozițiile unei ieșiri sau scrisă de la zero.";

export default async function FacturaNouaPage({
  searchParams,
}: {
  searchParams: Promise<{ iesire?: string }>;
}) {
  const { iesire } = await searchParams;
  const read = await getInvoiceEditor({ issueId: typeof iesire === "string" && iesire ? iesire : null });

  if (read.state === "pending") return <SchemaPending title="Factură nouă" lead={LEAD} />;

  if (read.state === "missing") {
    return (
      <FacturaRefuz
        title="Factură nouă"
        message="Ieșirea din care se face factura nu a fost găsită."
        back="/comenzi"
        backLabel="Deschide Comenzi"
      />
    );
  }

  if (read.state === "refused") {
    return (
      <FacturaRefuz
        title="Factură nouă"
        message={read.message}
        back="/comenzi"
        backLabel="Deschide Comenzi"
      />
    );
  }

  return <FacturaEditor view={read.view} options={read.options} />;
}
