// P3-07 Proiecte, ruta de detaliu.
//
// P3-132 ii adauga panoul Sarcini, clauza 1: a treia din cele trei pagini pe care
// cardul le cere, celelalte doua fiind leadul si clientul, amandoua pe
// app/(app)/clienti/[id]/page.tsx.
//
// ZIUA SE AFLA AICI, O SINGURA DATA PE RANDARE, si se trimite in jos, acelasi motiv
// scris pe pagina clientului: o randare de la 23:59:59 ar putea afla o zi pentru
// grupare si alta pentru marcajul de intarziere.

import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { hasPhase3Schema } from "@/lib/data/schema-capability";
import { SchemaPending } from "@/components/ui/SchemaPending";
import { chisinauToday } from "@/lib/data/format";
import { listTasksForEntity, tasksVisible } from "@/lib/data/tasks";
import { listClientOwnerChoices } from "@/lib/data/clients";
import {
  getProject,
  getProjectHistory,
  getProjectMaterials,
  listClientOptions,
} from "@/lib/data/projects-list";
import { getProjectMaterialCost } from "@/lib/reporting/material-cost";
import { getProjectDevizView } from "@/lib/data/deviz";
import { getDevizComparison } from "@/lib/reporting/deviz-comparison";
import { listActiveProducts } from "@/lib/data/products";
import { listDocuments } from "@/lib/data/documents";
import { listInvoicesForRecord } from "@/lib/data/facturare-list";
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

  // P3-15. Lista completa a documentelor, in adresa, cu aceleasi chei ca pe fisa clientului.
  const rawDocumentsPage = query["pagina-documente"];

  // P3-132. POARTA INTAI, CA PE ORICE ECRAN AL ACESTEI PLATFORME, si pleaca odata cu
  // celelalte citiri si nu in serie dupa ele. Cand tabela sarcinilor nu este vizibila,
  // panoul nu se deseneaza deloc: "nu exista inca tabela" si "nicio sarcina" sunt doua
  // lucruri diferite si nu se spun cu aceleasi cuvinte.
  const [
    user,
    history,
    materials,
    clients,
    cost,
    deviz,
    comparison,
    products,
    documents,
    invoices,
    tasksOn,
  ] = await Promise.all([
    getSessionUser(),
    getProjectHistory(id),
    getProjectMaterials(id),
    listClientOptions(),
    getProjectMaterialCost(id, { shippedOnly }),
    getProjectDevizView(id, requestedDeviz),
    // P3-13c. Aceeasi versiune ceruta ca pe fila Deviz: doua file care fac
    // acelasi lucru cu adresa nu au voie sa foloseasca doua chei.
    getDevizComparison(id, requestedDeviz),
    listActiveProducts(),
    listDocuments(
      { type: "project", id },
      {
        showAll: query["documente"] === "toate",
        page: typeof rawDocumentsPage === "string" ? Number(rawDocumentsPage) : 1,
      },
    ),
    // P3-110. Facturile acestui proiect, pentru fila Facturi. Null inainte de 0063.
    listInvoicesForRecord({ kind: "project", id }),
    // P3-132. Poarta panoului Sarcini. Vezi comentariul de mai sus.
    tasksVisible(),
  ]);

  // P3-132. Sarcinile acestui proiect si responsabilii, numai cand tabela este
  // vizibila si amandoua odata. Citirea este listTasksForEntity, scrisa de cardul
  // P3-130 pentru chiar acest panou: NICIO INTEROGARE NOUA, clauza 5.
  const [tasks, taskAssignees] = tasksOn
    ? await Promise.all([listTasksForEntity("project", id), listClientOwnerChoices()])
    : [null, []];

  return (
    <ProjectDetailScreen
      project={project}
      history={history}
      materials={materials}
      cost={cost}
      deviz={deviz}
      comparison={comparison}
      products={products}
      clients={clients}
      documents={documents}
      invoices={invoices}
      canWrite={user?.role === "owner"}
      tasks={tasks}
      taskAssignees={taskAssignees}
      today={chisinauToday()}
      // AMANDOUA ROLURILE SCRIU SARCINI: acelasi calcul si acelasi motiv ca pe fila
      // /sarcini si pe fisa clientului. Doua ecrane care arata aceeasi tabela nu au
      // voie sa aiba doua idei despre cine o poate scrie.
      canWriteTasks={user !== null}
    />
  );
}
