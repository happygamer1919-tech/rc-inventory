// Modificarea unei ciorne. Cardul P3-110, goal G65 partea 3.
//
// ACELASI FORMULAR CA /facturare/nou, incarcat de pe o ciornă salvata. Doua ecrane care
// ar completa acelasi formular altfel s-ar deosebi de la prima schimbare adusa unuia din
// ele, deci componentul este unul singur si numai datele cu care se deschide sunt altele.
//
// NUMAI O CIORNA SE MODIFICA. Cand factura nu mai este ciornă, getInvoiceEditor intoarce
// "refused" cu propozitia romaneasca, si asta nu este o eroare: este chiar regula pe care
// o ține declansatorul invoices_require_draft_to_edit din migratia 0063. O corectie la o
// factura emisa se face prin anulare si o factura noua.

import { notFound } from "next/navigation";
import { SchemaPending } from "@/components/ui/SchemaPending";
import { FacturaEditor } from "@/components/facturare/FacturaEditor";
import { FacturaRefuz } from "@/components/facturare/FacturaRefuz";
import { getInvoiceEditor } from "@/lib/data/facturare-create";

export const dynamic = "force-dynamic";

export default async function ModificaFacturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const read = await getInvoiceEditor({ invoiceId: id });

  if (read.state === "pending") {
    return <SchemaPending title="Modifică ciorna" lead="Modificarea unei facturi ciornă." />;
  }
  if (read.state === "missing") notFound();

  if (read.state === "refused") {
    return (
      <FacturaRefuz
        title="Modifică ciorna"
        message={read.message}
        back={`/facturare/${id}`}
        backLabel="Înapoi la factură"
      />
    );
  }

  return <FacturaEditor view={read.view} options={read.options} />;
}
