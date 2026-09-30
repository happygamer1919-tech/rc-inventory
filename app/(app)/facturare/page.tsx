// Facturi, lista. Cardul P3-109, goal G65 partea 2.
//
// POARTA DE SCHEMA ESTE PRIMUL LUCRU, ca pe /clienti si pe /setari: migratia 0063
// ajunge in productie pe fuziune, prin aplicatia GitHub a Supabase, in aproximativ
// doua minute, iar codul pleaca din acelasi push si nu aterizeaza in aceeasi
// secunda. Fara ea, ecranul ar cere public.invoices inainte ca ea sa existe,
// PostgREST ar raspunde ca nu o are si ruta ar da 500. Aceea este INC-05.
//
// AICI SE CITESTE ZIUA DE AZI, o singura data pe cerere, si de aici pleaca ea in
// jos. Luna implicita este luna din Chisinau, iar chisinauToday() este chiar
// functia pe care restul aplicatiei o foloseste pentru ziua calendaristica.
// Componentul nu si-o calculeaza singur: atunci ziua serverului si ziua browserului
// ar putea fi doua zile diferite in aceeasi randare.

import { SchemaPending } from "@/components/ui/SchemaPending";
import { FacturiScreen } from "@/components/facturare/FacturiScreen";
import { listInvoices } from "@/lib/data/facturare-list";
import { isFiltered, parseInvoiceQuery } from "@/lib/data/facturare-list-types";
import { chisinauToday } from "@/lib/data/format";

export const dynamic = "force-dynamic";

const LEAD = "Facturile emise clienților, pe perioada, pe stare și pe client.";

export default async function FacturiPage({
  searchParams,
}: {
  searchParams: Promise<{
    "de-la"?: string;
    "pana-la"?: string;
    stare?: string;
    client?: string;
    q?: string;
  }>;
}) {
  const today = chisinauToday();
  const query = parseInvoiceQuery(await searchParams, today);
  const result = await listInvoices(query);

  if (result === null) return <SchemaPending title="Facturi" lead={LEAD} />;

  return (
    <FacturiScreen
      rows={result.rows}
      count={result.count}
      liveCount={result.liveCount}
      liveSumMdl={result.liveSumMdl}
      clients={result.clients}
      query={query}
      filtered={isFiltered(query, today)}
    />
  );
}
