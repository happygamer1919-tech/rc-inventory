// P3-07 Proiecte, lista.

import { getSessionUser } from "@/lib/supabase/server";
import { hasPhase3Schema } from "@/lib/data/schema-capability";
import { SchemaPending } from "@/components/ui/SchemaPending";
import { listClientOptions, listProjects, parseProjectQuery } from "@/lib/data/projects-list";
import { ProjectsScreen } from "@/components/projects/ProjectsScreen";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stare?: string; client?: string; pagina?: string }>;
}) {
  // Migratiile fazei 3 sunt scrise si NEAPLICATE pana la cardul P3-27. Fara
  // aceasta poarta, ecranul cere tabele care nu exista si raspunde 500.
  if (!(await hasPhase3Schema())) {
    return (
      <SchemaPending
        title="Proiecte"
        lead="Șantierele, cu stadiul lor și cu clientul căruia îi aparțin."
      />
    );
  }

  const query = parseProjectQuery(await searchParams);
  const [user, result, clients] = await Promise.all([
    getSessionUser(),
    listProjects(query),
    listClientOptions(),
  ]);

  return (
    <ProjectsScreen
      rows={result.rows}
      total={result.total}
      page={result.page}
      pageCount={result.pageCount}
      query={query}
      clients={clients}
      canWrite={user?.role === "owner"}
    />
  );
}
