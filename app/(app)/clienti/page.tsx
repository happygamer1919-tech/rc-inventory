// P3-06 Clienti, lista.

import { getSessionUser } from "@/lib/supabase/server";
import { hasPhase3Schema } from "@/lib/data/schema-capability";
import { SchemaPending } from "@/components/ui/SchemaPending";
import { listClients, parseClientQuery } from "@/lib/data/clients";
import { ClientsScreen } from "@/components/clients/ClientsScreen";

export const dynamic = "force-dynamic";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tip?: string; stare?: string; pagina?: string }>;
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
  const [user, result] = await Promise.all([getSessionUser(), listClients(query)]);

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
    />
  );
}
