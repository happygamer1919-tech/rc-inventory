// P3-06 Clienti, lista. P3-45 ii adauga vederile Leaduri si Clienți.

import { createClient, getSessionUser } from "@/lib/supabase/server";
import { hasClientStage, hasPhase3Schema } from "@/lib/data/schema-capability";
import { SchemaPending } from "@/components/ui/SchemaPending";
import {
  countClientsByStage,
  listClientOwnerChoices,
  listClients,
  parseClientQuery,
} from "@/lib/data/clients";
import { ClientsScreen } from "@/components/clients/ClientsScreen";

export const dynamic = "force-dynamic";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    tip?: string;
    stare?: string;
    pagina?: string;
    vedere?: string;
    etapa?: string;
  }>;
}) {
  // Migratiile fazei 3 sunt scrise si NEAPLICATE pana la cardul P3-27. Fara
  // aceasta poarta, ecranul cere tabele care nu exista si raspunde 500.
  if (!(await hasPhase3Schema())) {
    return (
      <SchemaPending
        title="Clienți"
        lead="Beneficiarii, cu datele lor de contact și proiectele lor."
      />
    );
  }

  const query = parseClientQuery(await searchParams);
  // P3-43. Etapa se ofera in formularul de client nou numai cand coloana exista.
  // hasPhase3Schema sondeaza public.projects si nu poate spune asta.
  //
  // P3-45. countClientsByStage intoarce null cand migratia 0040 nu exista inca,
  // prin hasClientLeaduri, si null inseamna "fara vederi, fara cipuri, fara
  // formular de lead": ecranul de dinainte de card.
  const supabase = await createClient();
  const [user, result, stageAvailable, counts] = await Promise.all([
    getSessionUser(),
    listClients(query),
    hasClientStage(supabase),
    countClientsByStage(query),
  ]);

  // Lista de responsabili se cere numai pentru cine poate crea un lead.
  const owners =
    counts !== null && user?.role === "owner" ? await listClientOwnerChoices() : [];

  return (
    <ClientsScreen
      rows={result.rows}
      total={result.total}
      page={result.page}
      pageCount={result.pageCount}
      query={query}
      // P3-06: butonul nu apare pentru cine nu poate scrie. Politicile din 0013
      // sunt owner-only, si un buton pe care baza il refuza este defectul, nu
      // politica.
      canWrite={user?.role === "owner"}
      stageAvailable={stageAvailable}
      leaduri={counts ? { counts, owners } : null}
    />
  );
}
