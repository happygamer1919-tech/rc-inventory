// P3-07 Proiecte, ruta de detaliu.

import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import {
  getProject,
  getProjectHistory,
  getProjectMaterials,
  listClientOptions,
} from "@/lib/data/projects-list";
import { getProjectMaterialCost } from "@/lib/reporting/material-cost";
import { ProjectDetailScreen } from "@/components/projects/ProjectDetailScreen";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const project = await getProject(id);

  // Un id care nu exista este 404. Se citeste INTAI proiectul: patru interogari
  // pentru un id inexistent ar fi patru interogari degeaba.
  if (!project) notFound();

  // P3-11: filtrul "doar expediate" traieste in URL, pentru ca numarul se
  // recalculeaza pe server. Implicit sunt TOATE iesirile: materialul a plecat
  // din depozit cand a fost eliberat, iar expedierea este o stare de logistica,
  // nu un eveniment de cost.
  const query = await searchParams;
  const shippedOnly = query["doar-expediate"] === "1";

  const [user, history, materials, clients, cost] = await Promise.all([
    getSessionUser(),
    getProjectHistory(id),
    getProjectMaterials(id),
    listClientOptions(),
    getProjectMaterialCost(id, { shippedOnly }),
  ]);

  return (
    <ProjectDetailScreen
      project={project}
      history={history}
      materials={materials}
      cost={cost}
      clients={clients}
      canWrite={user?.role === "owner"}
    />
  );
}
