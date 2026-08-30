// P3-07 Proiecte, ruta de detaliu.

import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { getProject, getProjectHistory, listClientOptions } from "@/lib/data/projects-list";
import { ProjectDetailScreen } from "@/components/projects/ProjectDetailScreen";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, project, history, clients] = await Promise.all([
    getSessionUser(),
    getProject(id),
    getProjectHistory(id),
    listClientOptions(),
  ]);

  if (!project) notFound();

  return (
    <ProjectDetailScreen
      project={project}
      history={history}
      clients={clients}
      canWrite={user?.role === "owner"}
    />
  );
}
