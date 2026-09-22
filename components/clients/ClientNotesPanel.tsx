"use client";

// Fila Note de pe fisa clientului, cardul P3-90, goal G45.
//
// SUS, CASUTA "Ce s-a discutat" si Salvează; DEDESUBT, ISTORIA. Istoria este o
// singura lista, cele mai noi primele: notele scrise de oameni, in textul normal,
// si mutarile de etapa din client_stage_history, mai estompate, ca lista sa se
// citeasca drept o singura poveste a leadului.
//
// URMATORUL PAS POATE PLECA IN ACEEASI SALVARE (G44), din acelasi formular.
// Campurile lui pornesc goale si un camp gol inseamna "nu schimba pasul". La De
// reluat data pasului este data de reluare, aceeasi casuta din Modifică, deci aici
// ramane numai textul pasului.
//
// P3-91. Formularul este ClientNoteForm, scos de aici neschimbat, ca ecranul Azi
// sa foloseasca acelasi formular.
//
// Managerul de cont vede istoria si nu vede formularul: baza i-ar refuza nota, iar
// ecranul nu ofera un buton pe care baza il refuza (P3-06).

import { useRouter } from "next/navigation";
import { Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { ClientNoteForm } from "./ClientNoteForm";
import {
  CLIENT_STAGE_LABEL,
  type ClientStage,
  type ClientTimelineEntry,
} from "@/lib/data/clients-types";
import { formatDateTime } from "@/lib/data/format";

export function ClientNotesPanel({
  clientId,
  timeline,
  stage,
  nextActionAvailable,
  canWrite,
}: {
  clientId: string;
  /** null cand migratia 0059 nu este inca aplicata. */
  timeline: ClientTimelineEntry[] | null;
  stage: ClientStage | null;
  nextActionAvailable: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();

  // Inainte de 0059: starea goala de azi, nu un formular care nu ar avea unde scrie.
  if (timeline === null) {
    return (
      <Card>
        <CardHeader title="Note" />
        <EmptyState
          title="Nicio notă"
          hint="Notele cu dată de revenire ajung aici odată cu cardul care le aduce."
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Note"
        hint="Ce s-a discutat și cum s-a mutat între etape, cele mai noi primele."
      />

      {canWrite ? (
        <ClientNoteForm
          clientId={clientId}
          nextActionAvailable={nextActionAvailable}
          followUpBox={stage === "follow_up"}
          onSaved={() => router.refresh()}
          className="px-5 py-4 space-y-4 border-b border-rc-line"
        />
      ) : null}

      {timeline.length === 0 ? (
        <EmptyState
          title="Nicio notă"
          hint={
            canWrite
              ? "Scrie mai sus ce s-a discutat. Mutările de etapă apar aici singure."
              : "Notele se adaugă de administrator. Mutările de etapă apar aici singure."
          }
        />
      ) : (
        <ul className="px-5 py-2" data-testid="timeline">
          {timeline.map((entry) =>
            entry.kind === "note" ? (
              <li
                key={entry.id}
                className="py-3 border-b border-rc-line last:border-0"
                data-testid="timeline-note"
              >
                <p className="text-[13.5px] text-rc-black whitespace-pre-line break-words" data-testid="timeline-body">
                  {entry.body}
                </p>
                <p className="mt-1 text-[12px] text-rc-muted">
                  <span className="font-semibold" data-testid="timeline-author">
                    {entry.author}
                  </span>
                  {", "}
                  <span data-testid="timeline-date">{formatDateTime(entry.createdAt)}</span>
                </p>
              </li>
            ) : (
              <li
                key={entry.id}
                className="py-2.5 border-b border-rc-line last:border-0 text-[12.5px] text-rc-muted"
                data-testid="timeline-stage"
              >
                <span data-testid="timeline-stage-change">
                  {entry.fromStage === null
                    ? `A intrat în listă la etapa ${CLIENT_STAGE_LABEL[entry.toStage]}`
                    : `Etapa s-a schimbat din ${CLIENT_STAGE_LABEL[entry.fromStage]} în ${CLIENT_STAGE_LABEL[entry.toStage]}`}
                </span>
                {", "}
                <span data-testid="timeline-author">{entry.author}</span>
                {", "}
                <span data-testid="timeline-date">{formatDateTime(entry.createdAt)}</span>
              </li>
            ),
          )}
        </ul>
      )}
    </Card>
  );
}
