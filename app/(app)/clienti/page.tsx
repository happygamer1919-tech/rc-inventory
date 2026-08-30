// P3-06 Clienti, lista.

import { getSessionUser } from "@/lib/supabase/server";
import { listClients, parseClientQuery } from "@/lib/data/clients";
import { ClientsScreen } from "@/components/clients/ClientsScreen";

export const dynamic = "force-dynamic";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tip?: string; stare?: string; pagina?: string }>;
}) {
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
