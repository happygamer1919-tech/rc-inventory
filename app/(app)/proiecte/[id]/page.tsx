// P3-07 Proiecte, ruta de detaliu.

import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { hasPhase3Schema } from "@/lib/data/schema-capability";
import { SchemaPending } from "@/components/ui/SchemaPending";
import {
  getProject,
  getProjectHistory,
  getProjectMaterials,
  listClientOptions,
} from "@/lib/data/projects-list";
import { getProjectMaterialCost } from "@/lib/reporting/material-cost";
import { getProjectDevizView } from "@/lib/data/deviz";
import { listActiveProducts } from "@/lib/data/products";
import { ProjectDetailScreen } from "@/components/projects/ProjectDetailScreen";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Migratiile fazei 3 sunt scrise si NEAPLICATE pana la cardul P3-27. Fara
  // aceasta poarta, ecranul cere tabele care nu exista si raspunde 500.
  if (!(await hasPhase3Schema())) {
    return (
      <SchemaPending
        title="Proiect"
        lead="Fișa proiectului."
      />
    );
  }

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

  // P3-13b: versiunea de deviz deschisa traieste in adresa, ca si fila. Fara
  // parametru se deschide cea mai noua.
  const rawDeviz = query["deviz"];
  const requestedDeviz = typeof rawDeviz === "string" && rawDeviz ? rawDeviz : null;

  const [user, history, materials, clients, cost, deviz, products] = await Promise.all([
    getSessionUser(),
    getProjectHistory(id),
    getProjectMaterials(id),
    listClientOptions(),
    getProjectMaterialCost(id, { shippedOnly }),
    getProjectDevizView(id, requestedDeviz),
    listActiveProducts(),
  ]);

  return (
    <ProjectDetailScreen
      project={project}
      history={history}
      materials={materials}
      cost={cost}
      deviz={deviz}
      products={products}
      clients={clients}
      canWrite={user?.role === "owner"}
    />
  );
}
