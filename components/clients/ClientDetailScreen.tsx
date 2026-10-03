"use client";

// Detaliul unui client, cardul P3-06.
//
// ESTE O RUTA SI NU UN PANOU, si P3-06 spune de ce: cardul urmator ii adauga
// cinci file, iar un panou lateral nu tine cinci file la o latime citibila pe un
// ecran de birou. Ecranele de comenzi si de inventar isi pastreaza panourile;
// aceasta nu este o schimbare la ele.
//
// FILELE NU SUNT AICI. P3-08 le aduce, complete, cu stari goale pentru cele
// nezidite inca. Cardul acesta livreaza fisa clientului si atat, pentru ca un
// card care ar livra si filele ar fi doua carduri intr-un singur pull request.
//
// PANOUL SARCINI, CARDUL P3-132, STA LANGA URMATORUL PAS SI NU IN LOCUL LUI. Clauza
// 6 a acelui card si deviatia D7: blocul "Următorul pas" de mai jos, cu data si
// textul lui, este NEATINS. Panoul nu il inlocuieste, nu il ascunde, nu il citeste si
// nu il scrie, iar fisa arata urmatorul pas exact ca inainte de acel card. Cele doua
// sunt lucruri diferite si cardul P3-130 a scris de ce: urmatorul pas este O SINGURA
// promisiune per client, inlocuita de fiecare data, iar Sarcini este o coada cu mai
// multe treburi, fiecare cu starea, urgenta, termenul si responsabilul ei.
//
// ACEST ECRAN SERVESTE SI LEADUL SI CLIENTUL, ceea ce comentariul de mai jos despre
// ClientNotesPanel spune deja, si de aceea panoul leadului cerut de clauza 1 este
// chiar panoul de aici: un lead este un rand de client cu o etapa, deci sarcina lui
// poarta tokenul `client` cu id-ul acestui rand.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, CardHeader, Chip, PageHeader } from "@/components/ui/primitives";
import {
  CLIENT_DEACTIVATED_NOTICE,
  CLIENT_REACTIVATED_NOTICE,
  CLIENT_SOURCE_LABEL,
  CLIENT_TYPE_LABEL,
  type ClientDetail,
  type ClientOwnerChoice,
  type ClientTimelineEntry,
} from "@/lib/data/clients-types";
import { formatDate } from "@/lib/data/format";
import { setClientActive } from "@/lib/data/client-actions";
import { ClientForm } from "./ClientForm";
import { ClientNotesPanel } from "./ClientNotesPanel";
import { ClientTabs } from "./ClientTabs";
import { StageMark } from "./StageMark";
import { PHONE_ROW_LABEL, PHONE_ROW_PAIR, PHONE_ROW_VALUE } from "@/components/ui/phone";
import { TaskPanel } from "@/components/tasks/TaskPanel";
import type { TaskAssignee } from "@/components/tasks/TaskForm";
import type { Task } from "@/lib/data/tasks-types";
import type { ClientContact, ClientMaterials, ClientProject } from "@/lib/data/client-detail";
import type { DocumentsView } from "@/lib/data/documents-types";
import type { InvoiceListRow } from "@/lib/data/facturare-list-types";

function Row({
  label,
  value,
  testId,
}: {
  label: string;
  value: string | null;
  testId?: string;
}) {
  return (
    <div
      className={`flex gap-4 py-2.5 border-b border-rc-line last:border-0 ${PHONE_ROW_PAIR}`}
      data-testid={testId}
    >
      <span className={`w-[160px] shrink-0 text-[12.5px] font-semibold text-rc-muted ${PHONE_ROW_LABEL}`}>
        {label}
      </span>
      {/* O valoare lipsa este o liniuta, nu un sir gol: un rand fara nimic in
          dreapta arata ca un defect de randare. */}
      <span className={`text-[13.5px] text-rc-black ${PHONE_ROW_VALUE}`}>{value?.trim() || "-"}</span>
    </div>
  );
}

export function ClientDetailScreen({
  client,
  contacts,
  projects,
  materials,
  documents,
  invoices,
  timeline,
  canWrite,
  owners,
  tasks,
  taskAssignees = [],
  today,
  canWriteTasks = false,
}: {
  client: ClientDetail;
  contacts: ClientContact[];
  projects: ClientProject[];
  materials: ClientMaterials;
  /** P3-15. null cand migratia 0044 nu este inca aplicata. */
  documents: DocumentsView | null;
  /** P3-110. Fila Facturi. null cand migratia 0063 nu este inca aplicata. */
  invoices: InvoiceListRow[] | null;
  /** P3-90. Fila Note. null cand migratia 0059 nu este inca aplicata. */
  timeline: ClientTimelineEntry[] | null;
  canWrite: boolean;
  /** P3-48. Responsabilii pentru Modifică. Lipsa inseamna fara Sursă, Interes si
   *  Responsabil in formular. */
  owners?: ClientOwnerChoice[];
  /** P3-132. Sarcinile legate de ACEST rand de client, pentru panoul Sarcini.
   *  null cand tabela sarcinilor nu este inca vizibila, si atunci panoul nu se
   *  deseneaza deloc: ce nu se poate folosi nu apare pe ecran, obiceiul acestei
   *  aplicatii, si "nu exista inca tabela" nu se arata ca "nicio sarcina". */
  tasks?: Task[] | null;
  taskAssignees?: TaskAssignee[];
  /** Ziua calendaristica din Chisinau, yyyy-mm-dd, aflata de pagina o singura data
   *  pe randare prin chisinauToday(). Lipsa numai cand `tasks` lipseste. */
  today?: string;
  /** AMANDOUA ROLURILE SCRIU SARCINI, deci acesta NU este `canWrite` de mai sus,
   *  care este dreptul de a modifica fisa clientului si il are numai
   *  administratorul. Politicile tasks_insert si tasks_update din migratia 0068 cer
   *  public.current_app_role() nenul, si amandoua rolurile acestei platforme au drept
   *  de operatiuni, hotararea migratiei 0001 secțiunea 9. Un buton pe care baza il
   *  refuza este defectul, cardul P3-06, si un buton lipsa pentru cine are dreptul
   *  este celalalt. */
  canWriteTasks?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [toggling, setToggling] = React.useState(false);
  const [toggleError, setToggleError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  // P3-66. REACTIVAREA ESTE UN BUTON PE FISA, nu o casuta la capatul formularului
  // Modifică, la care se ajungea numai dupa filtrul Inactivi. Etapa, data, sursa,
  // interesul si responsabilul NU se ating: butonul nu muta etapa si nu scrie istoric.
  //
  // APLICATIA NU ARE TOAST-URI. Confirmarea este un rand cu role=status sub antetul
  // cardului, unde s-a apasat, si ramane pana la urmatoarea apasare, ca sa nu dispara
  // inainte sa fie citita.
  //
  // P3-112, goal G68. SCRIE PRIN setClientActive, CARE ESTE ACUM SINGURA CALE, fiindca
  // de la cardul acela acelasi buton exista si pe fiecare rand al vederii Inactivi.
  // Pana aici trecea prin updateClientRecord cu campurile fisei retrimise neschimbate,
  // ceea ce mergea de pe fisa, care le are pe toate pe ecran, si NU putea merge de pe
  // un rand de lista, care nu are IDNO, adresa, email sau note: de acolo ar fi fost
  // trimise ca sirul vid si scrise ca null. Comentariul lui setClientActive scrie
  // capcana intreaga. Ce se vede pe fisa nu se schimba cu nimic.
  async function toggleActive() {
    const next = !client.active;
    setToggling(true);
    setToggleError(null);
    setNotice(null);
    const result = await setClientActive(client.id, next);
    setToggling(false);
    if (!result.ok) {
      setToggleError(result.message);
      return;
    }
    setNotice(next ? CLIENT_REACTIVATED_NOTICE : CLIENT_DEACTIVATED_NOTICE);
    router.refresh();
  }

  // P3-48. RESPONSABILUL ESTE UN NUME, niciodata id-ul. Liniuta cand nu are
  // responsabil; cand are, dar profilul lui nu se poate citi de cine se uita, se
  // spune in cuvinte, ca randul sa nu para nealocat.
  const ownerLabel =
    client.ownerId === null ? null : (client.ownerName ?? "Alt membru al echipei");

  const nextActionDate =
    client.nextActionAt ?? (client.stage === "follow_up" ? client.followUpDate : null);

  return (
    <>
      <PageHeader
        title={client.name}
        lead={
          client.active
            ? "Fișa clientului."
            : "Fișa clientului. Clientul este dezactivat și nu apare în selectoare."
        }
        actions={
          <div className="flex items-center gap-2">
            <Link href="/clienti">
              <Button variant="secondary" data-testid="client-back">
                Înapoi la listă
              </Button>
            </Link>
            {canWrite ? (
              <Button onClick={() => setEditing(true)} data-testid="client-edit">
                Modifică
              </Button>
            ) : null}
          </div>
        }
      />

      <Card className="max-w-[760px]">
        <CardHeader
          title="Date de identificare"
          hint={client.active ? undefined : "Dezactivat"}
          right={
            canWrite ? (
              <Button
                size="sm"
                variant={client.active ? "secondary" : "primary"}
                onClick={toggleActive}
                disabled={toggling}
                data-testid="client-active-toggle"
              >
                {client.active ? "Dezactivează" : "Reactivează"}
              </Button>
            ) : null
          }
        />
        {notice ? (
          <p
            role="status"
            data-testid="client-active-notice"
            className="mx-5 mt-3 rounded-[10px] border border-rc-ok/25 bg-rc-ok-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
          >
            {notice}
          </p>
        ) : null}
        {toggleError ? (
          <p
            role="alert"
            data-testid="client-active-error"
            className="mx-5 mt-3 rounded-[10px] border border-rc-danger bg-rc-danger-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
          >
            {toggleError}
          </p>
        ) : null}
        <div className="px-5 py-3" data-testid="client-detail">
          <Row label="Denumire" value={client.name} />
          <Row label="Tip" value={CLIENT_TYPE_LABEL[client.type]} />
          {client.stage !== null ? (
            <>
              <div className={`flex gap-4 py-2.5 border-b border-rc-line ${PHONE_ROW_PAIR}`}>
                <span className={`w-[160px] shrink-0 text-[12.5px] font-semibold text-rc-muted ${PHONE_ROW_LABEL}`}>
                  Etapă
                </span>
                <StageMark stage={client.stage} />
              </div>
              <Row
                label="Data de reluare"
                value={client.followUpDate ? formatDate(client.followUpDate) : null}
                testId="client-follow-up"
              />
            </>
          ) : null}
          {client.nextActionAvailable ? (
            // P3-89. URMATORUL PAS, SUB ETAPA. La De reluat data lui este data de
            // reluare, aceeasi casuta in formular; un lead ajuns la De reluat
            // inainte de 0058 are data numai in follow_up_date, si se arata aceea.
            <Row
              label="Următorul pas"
              value={
                [
                  nextActionDate ? formatDate(nextActionDate) : null,
                  client.nextAction?.trim() || null,
                ]
                  .filter(Boolean)
                  .join(", ") || null
              }
              testId="client-next-action"
            />
          ) : null}
          {client.leaduriAvailable ? (
            <>
              <Row label="Interes" value={client.interest} testId="client-interest" />
              <Row
                label="Sursă"
                value={client.source ? CLIENT_SOURCE_LABEL[client.source] : null}
                testId="client-source"
              />
              <Row label="Responsabil" value={ownerLabel} testId="client-owner" />
            </>
          ) : null}
          <Row label="IDNO" value={client.fiscalCode} />
          <Row label="Telefon" value={client.phone} />
          <Row label="Email" value={client.email} />
          <Row label="Adresă" value={client.address} />
          <Row label="Note" value={client.notes} />
          <Row label="Adăugat" value={formatDate(client.createdAt)} />
          <div className={`flex gap-4 py-2.5 ${PHONE_ROW_PAIR}`}>
            <span className={`w-[160px] shrink-0 text-[12.5px] font-semibold text-rc-muted ${PHONE_ROW_LABEL}`}>
              Stare
            </span>
            <Chip tone={client.active ? "ok" : "neutral"}>
              {client.active ? "Activ" : "Inactiv"}
            </Chip>
          </div>
        </div>
      </Card>

      {/* P3-99, constatarea B2 a maturarii din 2026-09-22. "Ce s-a discutat" si
          istoria stau DEASUPRA BENZII DE FILE, nu in a cincea fila. Goal G45 a
          cerut casuta "sus pe pagina"; ce a livrat P3-90 era sus intr-o fila care
          stă ea insasi jos, deci a scrie ce s-a discutat costa o derulare si un
          clic pe a cincea fila.

          UN SINGUR ECRAN SERVESTE SI LEADUL SI CLIENTUL. Un lead este un rand de
          client cu etapa: nu exista tabela de leaduri si nu exista o a doua pagina
          de detaliu, deci mutarea de aici le rezolva pe amandoua dintr-o data.

          SUB CARDUL "Date de identificare", nu deasupra lui: atat spun cuvintele
          goalului, si restul paginii nu isi schimba ordinea. */}
      <div className="mt-5" data-testid="client-notes">
        <ClientNotesPanel
          clientId={client.id}
          timeline={timeline}
          stage={client.stage}
          nextActionAvailable={client.nextActionAvailable}
          canWrite={canWrite}
        />
      </div>

      {/* P3-132, clauza 1. SUB NOTE SI DEASUPRA BENZII DE FILE, si locul este ales si
          nu intamplator. Deasupra notelor ar fi mutat in jos casuta "Ce s-a discutat",
          pe care cardul P3-99 a adus-o anume sus fiindca a scrie o nota costa altfel o
          derulare; sub banda de file ar fi pus sarcinile dupa cinci file, adica exact
          defectul pe care acel card l-a reparat. Blocul "Următorul pas" din cardul de
          identificare rămâne unde este, clauza 6 si deviatia D7.

          PANOUL NU SE DESENEAZA CAND TABELA NU ESTE VIZIBILA. `tasks` este null
          atunci, iar ce nu se poate folosi nu apare pe ecran: altfel fisa ar arata
          "Nicio sarcină" despre o tabela care nu exista, care sunt doua lucruri
          diferite spuse cu aceleasi cuvinte. */}
      {tasks !== null && tasks !== undefined && today !== undefined ? (
        <div className="mt-5">
          <TaskPanel
            entityType="client"
            entityId={client.id}
            entityLabel={client.name}
            rows={tasks}
            assignees={taskAssignees}
            today={today}
            canWrite={canWriteTasks}
          />
        </div>
      ) : null}

      <div className="mt-5">
        <ClientTabs
          clientId={client.id}
          contacts={contacts}
          projects={projects}
          materials={materials}
          documents={documents}
          invoices={invoices}
          canWrite={canWrite}
        />
      </div>

      {editing ? (
        <ClientForm
          client={client}
          stageAvailable={client.stage !== null}
          owners={client.leaduriAvailable ? owners : undefined}
          nextActionAvailable={client.nextActionAvailable}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </>
  );
}
