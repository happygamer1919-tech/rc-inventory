// P3-06 Clienti, ruta de detaliu. P3-08 ii adauga cele cinci file.
//
// P3-132 ii adauga panoul Sarcini, clauza 1, si ACEASTA ESTE SI PAGINA LEADULUI: un
// lead este un rand din public.clients care poarta o etapa, deci cele doua din cele
// trei pagini pe care cardul le cere sunt amandoua aceasta ruta, pe tokenul `client`.
//
// ZIUA SE AFLA AICI, O SINGURA DATA PE RANDARE, si se trimite in jos, exact cum o
// face app/(app)/sarcini/page.tsx: citita in component, o randare de la 23:59:59 ar
// putea afla o zi pentru gruparea randurilor si alta pentru marcajul de intarziere.
// chisinauToday() este chiar functia pe care o citesc si fila Sarcini si ecranul Azi.

import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { hasPhase3Schema } from "@/lib/data/schema-capability";
import { SchemaPending } from "@/components/ui/SchemaPending";
import { chisinauToday } from "@/lib/data/format";
import { listTasksForEntity, tasksVisible } from "@/lib/data/tasks";
import { getClient, listClientOwnerChoices } from "@/lib/data/clients";
import {
  getClientMaterials,
  listClientContacts,
  listClientProjects,
} from "@/lib/data/client-detail";
import { listDocuments } from "@/lib/data/documents";
import { listInvoicesForRecord } from "@/lib/data/facturare-list";
import { getClientTimeline } from "@/lib/data/client-notes";
import { ClientDetailScreen } from "@/components/clients/ClientDetailScreen";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({
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
        title="Client"
        lead="Fișa clientului."
      />
    );
  }

  const { id } = await params;
  const client = await getClient(id);

  // Un id care nu exista este 404, nu un ecran gol. Se citeste INTAI clientul si
  // abia apoi filele: patru interogari pentru un id inexistent ar fi patru
  // interogari degeaba.
  if (!client) notFound();

  // P3-15. Lista completa a documentelor traieste in adresa, ca si fila.
  const query = await searchParams;
  const rawDocumentsPage = query["pagina-documente"];

  // P3-132. POARTA INTAI, CA PE ORICE ECRAN AL ACESTEI PLATFORME: tasksVisible()
  // intreaba daca tabela sarcinilor exista pe baza catre care arata aplicatia. Cand
  // raspunsul este "nu", panoul nu se deseneaza deloc, fiindca "nu exista inca tabela"
  // si "nicio sarcina" sunt doua lucruri diferite si nu se spun cu aceleasi cuvinte.
  // PLEACA ODATA CU CELELALTE, nu in serie dupa ele: cardul P3-40 a masurat in jur de
  // 32 de drumuri la baza pe o randare autentificata, si un panou nou nu adauga o
  // asteptare.
  const [user, contacts, projects, materials, documents, invoices, timeline, tasksOn] =
    await Promise.all([
      getSessionUser(),
      listClientContacts(id),
      listClientProjects(id),
      getClientMaterials(id),
      listDocuments(
        { type: "client", id },
        {
          showAll: query["documente"] === "toate",
          page: typeof rawDocumentsPage === "string" ? Number(rawDocumentsPage) : 1,
        },
      ),
      // P3-110. Facturile acestui client, pentru fila Facturi. Null inainte de 0063.
      listInvoicesForRecord({ kind: "client", id }),
      // P3-90. Notele si mutarile de etapa, pentru fila Note. Null inainte de 0059.
      getClientTimeline(id),
      // P3-132. Poarta panoului Sarcini. Vezi comentariul de mai sus.
      tasksVisible(),
    ]);

  // P3-48. Responsabilii pentru Modifică, din aceeasi lista ca formularul de lead,
  // ceruti numai pentru cine poate modifica si numai cand coloanele din 0040 exista.
  const owners =
    client.leaduriAvailable && user?.role === "owner" ? await listClientOwnerChoices() : undefined;

  // P3-132. SARCINILE SI RESPONSABILII SE CER NUMAI CAND TABELA ESTE VIZIBILA, si
  // amandoua odata: doua citiri in serie pentru un panou ar fi doua asteptari pe o
  // pagina care are deja opt. Citirea este listTasksForEntity, pe care cardul P3-130 a
  // scris-o pentru chiar acest panou; NICIO INTEROGARE NOUA NU ESTE SCRISA AICI,
  // clauza 5. UN LEAD SE INTREABA CU TOKENUL `client`, fiindca fisa leadului citeste
  // un rand de client, iar acesta este randul.
  const [tasks, taskAssignees] = tasksOn
    ? await Promise.all([listTasksForEntity("client", id), listClientOwnerChoices()])
    : [null, []];

  return (
    <ClientDetailScreen
      client={client}
      contacts={contacts}
      projects={projects}
      materials={materials}
      documents={documents}
      invoices={invoices}
      timeline={timeline}
      canWrite={user?.role === "owner"}
      owners={owners}
      tasks={tasks}
      taskAssignees={taskAssignees}
      today={chisinauToday()}
      // AMANDOUA ROLURILE SCRIU SARCINI, deci NU `user?.role === "owner"`: politicile
      // tasks_insert si tasks_update din migratia 0068 cer public.current_app_role()
      // nenul, iar rolurile acestei platforme sunt doua si amandoua au drept de
      // operatiuni, hotararea migratiei 0001 secțiunea 9. Acelasi calcul il face si
      // app/(app)/sarcini/page.tsx, si doua ecrane care arata aceeasi tabela nu au
      // voie sa aiba doua idei despre cine o poate scrie.
      canWriteTasks={user !== null}
    />
  );
}
