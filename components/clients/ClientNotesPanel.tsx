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
// Managerul de cont vede istoria si nu vede formularul: baza i-ar refuza nota, iar
// ecranul nu ofera un buton pe care baza il refuza (P3-06).

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHeader, EmptyState, Field, Input, Textarea } from "@/components/ui/primitives";
import { DateField } from "@/components/ui/DateField";
import { PHONE_STACK } from "@/components/ui/phone";
import { addClientNote } from "@/lib/data/client-actions";
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
  const [body, setBody] = React.useState("");
  const [nextActionAt, setNextActionAt] = React.useState("");
  const [nextAction, setNextAction] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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

  const followUpBox = stage === "follow_up";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await addClientNote(
      clientId,
      body,
      nextActionAvailable
        ? {
            ...(!followUpBox && nextActionAt !== "" ? { at: nextActionAt } : {}),
            ...(nextAction.trim() !== "" ? { text: nextAction } : {}),
          }
        : undefined,
    );
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setBody("");
    setNextActionAt("");
    setNextAction("");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader
        title="Note"
        hint="Ce s-a discutat și cum s-a mutat între etape, cele mai noi primele."
      />

      {canWrite ? (
        <form
          onSubmit={onSubmit}
          noValidate
          className="px-5 py-4 space-y-4 border-b border-rc-line"
          data-testid="note-form"
        >
          <Field label="Ce s-a discutat">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className={error ? "border-rc-danger" : undefined}
              data-testid="note-body"
            />
          </Field>

          {nextActionAvailable ? (
            <div
              className={`grid ${followUpBox ? "grid-cols-1" : "grid-cols-2"} gap-4 ${PHONE_STACK}`}
              data-testid="note-next-action-fields"
            >
              {followUpBox ? null : (
                <Field label="Data următorului pas" hint="Opțional. Gol înseamnă că pasul rămâne cum este.">
                  <DateField
                    value={nextActionAt}
                    onChange={setNextActionAt}
                    testId="note-next-action-at"
                  />
                </Field>
              )}
              <Field
                label="Următorul pas"
                hint={
                  followUpBox
                    ? "Opțional. Data pasului este data de reluare."
                    : "Opțional, un rând, de exemplu: trimit oferta."
                }
              >
                <Input
                  value={nextAction}
                  onChange={(e) => setNextAction(e.target.value)}
                  data-testid="note-next-action"
                />
              </Field>
            </div>
          ) : null}

          {error ? (
            <p
              role="alert"
              data-testid="note-error"
              className="rounded-[10px] border border-rc-danger bg-rc-danger-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
            >
              {error}
            </p>
          ) : null}

          <div className="flex justify-end">
            <Button type="submit" disabled={pending} data-testid="note-save">
              Salvează
            </Button>
          </div>
        </form>
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
