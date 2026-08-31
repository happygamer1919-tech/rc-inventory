// P3-07 Proiecte, lista.

import { getSessionUser } from "@/lib/supabase/server";
import { listClientOptions, listProjects, parseProjectQuery } from "@/lib/data/projects-list";
import { ProjectsScreen } from "@/components/projects/ProjectsScreen";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stare?: string; client?: string; pagina?: string }>;
}) {
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
