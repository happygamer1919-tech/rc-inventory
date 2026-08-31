// P3-07 Proiecte, ruta de detaliu.

import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import {
  getProject,
  getProjectHistory,
  getProjectMaterials,
  listClientOptions,
} from "@/lib/data/projects-list";
import { ProjectDetailScreen } from "@/components/projects/ProjectDetailScreen";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);

  // Un id care nu exista este 404. Se citeste INTAI proiectul: patru interogari
  // pentru un id inexistent ar fi patru interogari degeaba.
  if (!project) notFound();

  const [user, history, materials, clients] = await Promise.all([
    getSessionUser(),
    getProjectHistory(id),
    getProjectMaterials(id),
    listClientOptions(),
  ]);

  return (
    <ProjectDetailScreen
      project={project}
      history={history}
      materials={materials}
      clients={clients}
      canWrite={user?.role === "owner"}
    />
  );
}
