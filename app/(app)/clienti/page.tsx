// P3-06 Clienti, lista. P3-45 ii adauga vederile Leaduri si Clienți.

import { createClient, getSessionUser } from "@/lib/supabase/server";
import { hasClientStage, hasPhase3Schema } from "@/lib/data/schema-capability";
import { SchemaPending } from "@/components/ui/SchemaPending";
import {
  countClientsByStage,
  countInactiveClients,
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
  // P3-112, goal G68. NUMERELE CELORLALTE PASTILE SE CER SUB STAREA PE CARE ELE O VOR
  // ARATA, si din vederea Inactivi aceea este Activi: o apasare pe Leaduri sau pe
  // Clienți iese din Inactivi si se intoarce la implicitul Activi, deci un numar citit
  // sub `inactive` ar fi scris langa o pastila care arata alte randuri. Regula pe care
  // 0040 o scrie pentru cipuri, "numarul de langa un cip spune cate randuri ar arata
  // acel cip", este exact aceasta. In celelalte vederi nimic nu se schimba.
  const stageCountsQuery = query.view === "inactivi" ? { ...query, status: "active" as const } : query;
  const supabase = await createClient();
  const [user, result, stageAvailable, counts, inactiveCount] = await Promise.all([
    getSessionUser(),
    listClients(query),
    hasClientStage(supabase),
    countClientsByStage(stageCountsQuery),
    countInactiveClients(query),
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
      nextActionAvailable={result.nextActionAvailable}
      leaduri={counts ? { counts, owners } : null}
      inactiveCount={inactiveCount}
    />
  );
}
