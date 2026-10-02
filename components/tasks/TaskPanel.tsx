"use client";

// Panoul Sarcini de pe fisa unei inregistrari. Cardul P3-132, goal G73, Item 4 al
// lui Ivan, partea a treia. Propozitia proprietarului este una singura: "Also on the
// linked record's detail page."
//
// TREI PAGINI, DOUA ECRANE DE DETALIU, SI ASTA NU ESTE O SCURTATURA. Clauza 1 cere
// panoul pe fisa unui lead, a unui client si a unui proiect. In aceasta aplicatie
// exista DOUA ecrane de detaliu: components/clients/ClientDetailScreen.tsx, care
// serveste si leadul si clientul, si components/projects/ProjectDetailScreen.tsx. Un
// lead ESTE un rand din public.clients care poarta o etapa, iar decizia este pe lista
// celor care nu se redeschid ("A lead is a client row with a stage. No leads table,
// no second detail page."). Nu exista nicio tabela public.leads in niciuna din
// migratii. Deci panoul leadului este ACEST panou, randat de ecranul clientului, pe
// tokenul `client` cu id-ul randului de client, si clauza 1 este indeplinita de trei
// pagini care citesc doua tokenuri. Cardul P3-130 a scris chiar acest fapt in notele
// lui ca sa nu fie redescoperit, si de aceea enumerarea public.task_entity are doua
// etichete si niciuna de lead.
//
// NICIUN RANDATOR AL DOILEA, CLAUZA 5. Randurile, capetele de grup si marcajul de
// intarziere vin din components/tasks/TaskTable.tsx, acelasi component pe care il
// deseneaza fila /sarcini; formularul este components/tasks/TaskForm.tsx, acelasi pe
// care il deschide fila. Citirea este listTasksForEntity din lib/data/tasks.ts, pe
// care cardul P3-130 a scris-o pentru chiar acest panou si pentru care a construit
// indexul tasks_entity_idx. Acest fisier NU citeste nimic, NU filtreaza nimic si NU
// compara nicio zi: el aseaza pe ecran ce primeste.
//
// O SINGURA DEFINITIE A ZILEI, CLAUZA 4. `today` soseste de la pagina, aflat o
// singura data pe randare prin chisinauToday(), si se trimite mai departe intreg.
// Marcajul se deduce in TaskTable prin isTaskOverdue(), care este literal
// `taskBucket(...) === "restante"`. Acceptanta (d) cere ca aceeasi sarcina sa fie
// marcata la fel pe fisa si in fila, iar faptul ca amandoua randeaza acelasi
// component care cheama aceeasi functie este ce le face incapabile sa nu fie de
// acord. Un al doilea fel de a afla ce este intarziat le-ar face doar egale astazi.
//
// INREGISTRAREA NU SE ALEGE AICI, CLAUZA 2. Butonul de sarcina nouă deschide
// formularul cu `fixedEntity` pus pe inregistrarea paginii, iar formularul atunci NU
// deseneaza cele doua selectoare ale inregistrarii legate: in locul lor sta numele
// ei, ca text. Asa legatura este scrisa fara ca operatorul sa o fi ales, si asta este
// toata inlesnirea pe care cardul o cere.
//
// NU EXISTA NICIUN CONTROL DE STERGERE IN ACEST PANOU SI NU POATE EXISTA UNUL,
// clauza 3: nici pe rand, nici intr-un meniu de rand, nici in formular, nici in
// spatele unei confirmari. Anularea este o schimbare de STARE catre `cancelled` si
// sarcina rămâne pe inregistrare, care este propozitia lui Ivan. Migratia 0068 nu da
// tabelei nici politica, nici drept de stergere, si lib/data/tasks-actions.ts nu are
// nicio functie de stergere, deci un buton de stergere ar fi un buton pe care baza il
// refuza: chiar defectul numit de cardul P3-06.
//
// URMATORUL PAS AL CLIENTULUI NU ESTE ATINS, CLAUZA 6 SI DEVIATIA D7. Acest fisier
// nu numeste si nu citeste next_action_at, next_action, search_clients_next_action,
// hasClientNextAction si nimic din lib/data/azi.ts. Panoul STA LANGA blocul acela si
// nu in locul lui: fisa clientului il arata exact ca astazi. Notele cardului spun ca
// aceasta este riscul lui numit, cuvant cu cuvant: "ACCEPTANCE (e) IS THE D7 GUARD."

import * as React from "react";
import { Button, Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { PHONE_TABLE } from "@/components/ui/phone";
import { plural } from "@/lib/data/format";
import type { Task, TaskEntityType } from "@/lib/data/tasks-types";
import { TaskForm, type TaskAssignee } from "./TaskForm";
import { TaskTable } from "./TaskTable";

export function TaskPanel({
  entityType,
  entityId,
  entityLabel,
  rows,
  assignees,
  today,
  canWrite,
}: {
  /** `client` si pentru un lead si pentru un client: vezi antetul. */
  entityType: TaskEntityType;
  entityId: string;
  /** Denumirea inregistrarii, pentru formular. DATA si nu text de interfata. */
  entityLabel: string;
  rows: Task[];
  assignees: TaskAssignee[];
  /** Ziua calendaristica din Chisinau, yyyy-mm-dd, aflata o singura data de pagina. */
  today: string;
  canWrite: boolean;
}) {
  const [creating, setCreating] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const editing = rows.find((r) => r.id === editingId);

  const fixedEntity = { type: entityType, id: entityId, label: entityLabel };

  return (
    <>
      {/* INVELISUL POARTA NUMELE ZONEI SI NU `Card`, si asta nu este o preferinta:
          `Card` din components/ui/primitives.tsx primeste numai className si children
          si NU trimite mai departe niciun atribut, deci un data-testid pus pe el nu
          ajunge in DOM. Lectia este scrisa in KNOWN-FAILURES pe cardul P3-119, care a
          plata o rulare ca sa o afle. Invelisul cuprinde si antetul vizibil, deci o
          afirmatie pe zona citeste si titlul pe care il vede operatorul. */}
      <div data-testid="panel-sarcini">
        <Card className={PHONE_TABLE}>
          <CardHeader
            title="Sarcini"
            hint={plural(rows.length, "sarcină", "sarcini")}
            right={
              canWrite ? (
                <Button size="sm" onClick={() => setCreating(true)} data-testid="panel-task-new">
                  Sarcină nouă
                </Button>
              ) : null
            }
          />

          {rows.length === 0 ? (
            // GOLUL ESTE O PROPOZITIE SI NU O ZONA ALBA, ca peste tot in aceasta
            // aplicatie: o zona goala se citeste ca ceva stricat, nu ca ceva
            // terminat. NICIUN FILTRU NU EXISTA PE ACEST PANOU, deci golul are un
            // singur inteles: inregistrarea nu are nicio sarcina.
            <EmptyState
              title="Nicio sarcină pe această înregistrare"
              hint={
                canWrite
                  ? "Prima sarcină se adaugă din butonul de sus și este legată de această înregistrare."
                  : "Sarcinile apar aici imediat ce cineva scrie una."
              }
            />
          ) : (
            // COLOANA Înregistrare legată NU SE DESENEAZA AICI, si golul este
            // explicat: fiecare rand al acestui panou poarta ACEEASI inregistrare,
            // adica pe cea a paginii deschise, deci coloana ar scrie acelasi cuvant pe
            // fiecare rand si legatura ei ar duce la pagina pe care operatorul se afla
            // deja. Este un singur boolean pe un singur randator si nu o a doua
            // implementare: vezi comentariul lui `showEntity` in
            // components/tasks/TaskTable.tsx.
            <TaskTable
              rows={rows}
              today={today}
              canWrite={canWrite}
              onEdit={setEditingId}
              showEntity={false}
            />
          )}
        </Card>
      </div>

      {creating ? (
        <TaskForm
          assignees={assignees}
          fixedEntity={fixedEntity}
          onClose={() => setCreating(false)}
        />
      ) : null}
      {editing ? (
        <TaskForm
          task={editing}
          assignees={assignees}
          fixedEntity={fixedEntity}
          onClose={() => setEditingId(null)}
        />
      ) : null}
    </>
  );
}
