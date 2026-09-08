// P3-18. Necesar de materiale.

import { hasPhase3Schema } from "@/lib/data/schema-capability";
import { SchemaPending } from "@/components/ui/SchemaPending";
import { getProcurementNeed } from "@/lib/reporting/procurement";
import { ProcurementScreen } from "@/components/inventory/ProcurementScreen";

export const dynamic = "force-dynamic";

export default async function ProcurementPage() {
  // Aceeasi poarta ca pe celelalte ecrane de faza 3: fara ea, ecranul cere
  // tabele care nu exista si raspunde 500.
  if (!(await hasPhase3Schema())) {
    return (
      <SchemaPending
        title="Necesar de materiale"
        lead="Ce mai trebuie cumpărat pentru șantierele cu deviz acceptat, după ce s-a scăzut ce a plecat deja."
      />
    );
  }

  const need = await getProcurementNeed();
  return <ProcurementScreen need={need} />;
}
