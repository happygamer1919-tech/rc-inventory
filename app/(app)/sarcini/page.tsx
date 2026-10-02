// P3-131 Sarcini: fila din CRM cu lista treburilor, cele cinci filtre, cele trei
// sortari si cele trei galeti. Goal G73, Item 4 al lui Ivan, partea a doua.
//
// POARTA INTAI, CA PE ORICE ECRAN AL ACESTEI PLATFORME. tasksVisible() intreaba daca
// tabela exista pe baza catre care arata aplicatia. Migratia 0068 este aplicata din
// 2026-10-02, dar poarta rămâne cinstita: cat timp raspunsul ar fi "nu", ecranul o
// spune ROMANESTE in loc sa arunce, ceea ce este chiar forma incidentului INC-05, in
// care fiecare ecran a raspuns 500 fiindca niste migratii erau fuzionate si
// neaplicate.
//
// ZIUA SE AFLA AICI, O SINGURA DATA PE RANDARE, si se trimite in jos. Daca ar fi
// citita in component, o randare de la 23:59:59 ar putea afla o zi si marcajul alta,
// iar ecranul ar arata o lista grupata dupa ieri cu marcaje de azi. chisinauToday()
// este chiar functia pe care o citeste si ecranul Azi, cardul P3-91.
//
// FILTRELE SE CITESC DIN ADRESA, prin parseTaskQuery, si se trimit bazei, nu
// memoriei. De ce in adresa si nu in stare: antetul lui lib/data/tasks-query.ts.

import { getSessionUser } from "@/lib/supabase/server";
import { SchemaPending } from "@/components/ui/SchemaPending";
import { listClientOwnerChoices } from "@/lib/data/clients";
import { listClientOptions } from "@/lib/data/projects-list";
import { listSelectableProjects } from "@/lib/data/projects";
import { chisinauToday } from "@/lib/data/format";
import { listTasks, tasksVisible } from "@/lib/data/tasks";
import { parseTaskQuery } from "@/lib/data/tasks-query";
import { SarciniScreen } from "@/components/tasks/SarciniScreen";

export const dynamic = "force-dynamic";

export default async function SarciniPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  // Un parametru scris de doua ori in adresa soseste ca lista. Se ia primul, ca
  // peste tot: a refuza adresa ar fi un ecran gol pentru o greseala de legatura.
  const single: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(params)) {
    single[key] = Array.isArray(value) ? value[0] : value;
  }
  const query = parseTaskQuery(single);

  if (!(await tasksVisible())) {
    return (
      <SchemaPending
        title="Sarcini"
        lead="Treburile de făcut, cu termenul lor și cu cine le duce."
      />
    );
  }

  // CELE PATRU CITIRI PLEACA ODATA, nu una dupa alta: cardul P3-40 a masurat in jur
  // de 32 de drumuri la baza pe o randare autentificata, si un ecran nou nu le
  // aseaza in serie.
  //
  // CE SUNT CELE DOUA LISTE DE INREGISTRARI. Clauza 2 cere coloana "inregistrare
  // legata" si proprietarul a numit campul "linked entity (lead, client or project,
  // optional)", deci formularul clauzei 7 trebuie sa poata ALEGE una: un camp al unei
  // sarcini pe care formularul de creare nu il poate scrie este un formular
  // incomplet. LEADURILE SUNT IN LISTA DE CLIENTI, fiindca un lead este un rand din
  // public.clients care poarta o etapa; listClientOptions() citeste chiar fiecare
  // client activ, leaduri incluse.
  //
  // FUNCTIILE SUNT CELE CARE EXISTA, nu unele noi: listClientOptions() este
  // selectorul de client din formularul de proiect, si listSelectableProjects() este
  // cel pe care il foloseste formularul de ieșire. Ultima nu arata proiectele inchise
  // (regula cardului P3-04), deci o sarcina nu se leaga de un santier inchis de pe
  // acest ecran; cine are nevoie de asta are panoul cardului P3-132 pe fisa
  // proiectului, si aceea este o intrebare pentru un card, nu o a doua interogare
  // scrisa aici.
  const [user, assignees, clientRows, projectRows] = await Promise.all([
    getSessionUser(),
    listClientOwnerChoices(),
    listClientOptions(),
    listSelectableProjects(),
  ]);

  // UN RESPONSABIL CARE NU ESTE IN LISTA NU FILTREAZA NIMIC, exact ca pe /azi: o
  // legatura veche, sau un profil dezactivat de atunci, arata TOT si nu gol.
  const assigneeId = assignees.some((a) => a.id === query.assigneeId) ? query.assigneeId : "";
  const rows = await listTasks({ ...query, assigneeId });

  return (
    <SarciniScreen
      rows={rows}
      query={{ ...query, assigneeId }}
      assignees={assignees}
      today={chisinauToday()}
      // AMANDOUA ROLURILE SCRIU SARCINI, si asta nu este o presupunere: politicile
      // tasks_insert si tasks_update din migratia 0068 cer public.current_app_role()
      // nenul, iar rolurile acestei platforme sunt doua si amandoua au drept de
      // operatiuni, hotararea migratiei 0001 secțiunea 9. Un profil dezactivat
      // citeste null din acea functie si getSessionUser() intoarce deja null pentru
      // el. Un buton pe care baza il refuza este defectul, cardul P3-06.
      canWrite={user !== null}
      clients={clientRows.map((c) => ({ id: c.id, label: c.name }))}
      projects={projectRows.map((p) => ({ id: p.id, label: p.name, hint: p.clientName }))}
    />
  );
}
