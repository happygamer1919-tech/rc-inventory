"use client";

// Formularul "Ce s-a discutat", scos din fila Note (P3-90) de cardul P3-91, ca
// ecranul Azi sa foloseasca acelasi formular si nu o copie a lui.
//
// DOUA FELURI, O SINGURA SALVARE PRIN addClientNote.
//   - Pe fila Note: casuta goala si campurile urmatorului pas, unde un camp gol
//     inseamna "nu schimba pasul". Exact formularul din P3-90.
//   - Pe Azi (clearNextAction): casuta pornita cu "Am sunat", fara campurile
//     pasului, iar salvarea trimite pasul gol, adica il sterge. Omul poate schimba
//     textul inainte de Salvează.

import * as React from "react";
import { Button, Field, Input, Textarea } from "@/components/ui/primitives";
import { DateField, useInvalidDates } from "@/components/ui/DateField";
import { PHONE_STACK } from "@/components/ui/phone";
import { addClientNote } from "@/lib/data/client-actions";

export function ClientNoteForm({
  clientId,
  nextActionAvailable,
  followUpBox,
  initialBody = "",
  clearNextAction = false,
  onSaved,
  onCancel,
  className,
}: {
  clientId: string;
  /** Daca exista coloanele urmatorului pas, adica 0058. */
  nextActionAvailable: boolean;
  /** La De reluat data pasului este data de reluare: ramane numai textul. */
  followUpBox: boolean;
  initialBody?: string;
  /** P3-91. Salvarea sterge urmatorul pas; campurile lui nu se arata. */
  clearNextAction?: boolean;
  onSaved: () => void;
  /** P3-91. Un buton Renunță langa Salvează, cand formularul se poate inchide. */
  onCancel?: () => void;
  className: string;
}) {
  const [body, setBody] = React.useState(initialBody);
  const [nextActionAt, setNextActionAt] = React.useState("");
  const [nextAction, setNextAction] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const showNextAction = nextActionAvailable && !clearNextAction;

  // P3-92, constatarea F4. Salvează sta oprit cat timp data pasului este in rosu.
  const { anyInvalid: dateInvalid, mark } = useInvalidDates();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (dateInvalid) return;
    setPending(true);
    setError(null);
    const result = await addClientNote(
      clientId,
      body,
      !nextActionAvailable
        ? undefined
        : clearNextAction
          ? // Gol, trimis anume: validateNextAction il scrie ca null in ambele coloane.
            { at: "", text: "" }
          : {
              ...(!followUpBox && nextActionAt !== "" ? { at: nextActionAt } : {}),
              ...(nextAction.trim() !== "" ? { text: nextAction } : {}),
            },
    );
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setBody(initialBody);
    setNextActionAt("");
    setNextAction("");
    onSaved();
  }

  return (
    <form onSubmit={onSubmit} noValidate className={className} data-testid="note-form">
      <Field label="Ce s-a discutat">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={error ? "border-rc-danger" : undefined}
          data-testid="note-body"
        />
      </Field>

      {showNextAction ? (
        <div
          className={`grid ${followUpBox ? "grid-cols-1" : "grid-cols-2"} gap-4 ${PHONE_STACK}`}
          data-testid="note-next-action-fields"
        >
          {followUpBox ? null : (
            <Field label="Data următorului pas" hint="Opțional. Gol înseamnă că pasul rămâne cum este.">
              <DateField
                value={nextActionAt}
                onChange={setNextActionAt}
                onValidityChange={mark("nextActionAt")}
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

      {clearNextAction && nextActionAvailable ? (
        <p className="text-[12px] text-rc-muted" data-testid="note-clears-step">
          La salvare, următorul pas se șterge.
        </p>
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

      <div className={onCancel ? "flex justify-end gap-2" : "flex justify-end"}>
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel} data-testid="note-cancel">
            Renunță
          </Button>
        ) : null}
        <Button type="submit" disabled={pending || dateInvalid} data-testid="note-save">
          Salvează
        </Button>
      </div>
    </form>
  );
}
