"use client";

// Formularul de lead nou, cardul P3-45.
//
// CAMPURILE SUNT LISTA DIN PREDAREA PROPRIETARULUI, partea 4.4, in ordinea ei:
// denumire (obligatorie), persoana de contact, telefon, email, sursa, interes ca
// text liber, etapa (obligatorie, implicit Lead rece), responsabil, data de
// reluare (obligatorie la De reluat), note. Nimic in plus: fara valoare, fara
// moneda, fara campuri configurabile (predarea, partea 4.7).
//
// ACELASI PANOU LATERAL CA FORMULARUL DE CLIENT, din motivul pe care P3-06 il da
// acolo: un al doilea fel de formular ar fi o a doua conventie de invatat.
//
// NU ARE O CALE DE SCRIERE A LUI. Trimite la createClientRecord, largit, care
// creeaza clientul, pune prima etapa prin set_client_stage si creeaza persoana de
// contact prin createContact. Tipul clientului nu este in lista predarii, deci
// leadul se creeaza cu implicitul coloanei, companie, si se schimba din fisa.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { createClientRecord } from "@/lib/data/client-actions";
import {
  CLIENT_SOURCES,
  CLIENT_SOURCE_LABEL,
  CLIENT_STAGES,
  CLIENT_STAGE_LABEL,
  type ClientOwnerChoice,
} from "@/lib/data/clients-types";

export function LeaduriForm({
  owners,
  onClose,
  onSaved,
}: {
  /** Profilurile active, dupa numele complet. */
  owners: ClientOwnerChoice[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const router = useRouter();

  const [name, setName] = React.useState("");
  const [contactName, setContactName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [source, setSource] = React.useState("");
  const [interest, setInterest] = React.useState("");
  const [stage, setStage] = React.useState<string>("cold");
  const [ownerId, setOwnerId] = React.useState("");
  const [followUpDate, setFollowUpDate] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const [error, setError] = React.useState<string | null>(null);
  const [errorField, setErrorField] = React.useState<string | undefined>(undefined);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrorField(undefined);
    setPending(true);

    const result = await createClientRecord({
      name,
      type: "company",
      fiscalCode: "",
      address: "",
      phone,
      email,
      notes,
      active: true,
      stage,
      followUpDate,
      source,
      interest,
      ownerId,
      contactName,
      firstStage: true,
    });

    if (!result.ok) {
      setError(result.message);
      setErrorField(result.field);
      setPending(false);
      return;
    }

    router.refresh();
    onSaved(result.value.id);
  }

  const fieldClass = (field: string) =>
    errorField === field ? "border-rc-danger" : undefined;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <aside
        className="relative w-[520px] h-full bg-rc-white text-rc-black overflow-y-auto shadow-2xl"
        data-testid="leaduri-form"
      >
        <div className="sticky top-0 bg-rc-white text-rc-black border-b border-rc-line px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[17px] font-bold text-rc-black leading-snug">Lead nou</h2>
            <p className="text-[12.5px] text-rc-muted mt-1">
              Un lead este un client care nu a ajuns încă la etapa Client.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide"
            className="shrink-0 w-8 h-8 rounded-[9px] text-rc-muted hover:bg-rc-paper hover:text-rc-black transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} noValidate className="px-6 py-5 space-y-4">
          <Field label="Denumire" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldClass("name")}
              data-testid="field-leaduri-name"
            />
          </Field>

          <Field label="Persoană de contact">
            <Input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              data-testid="field-leaduri-contact"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Telefon">
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                data-testid="field-leaduri-phone"
              />
            </Field>
            <Field label="Email">
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="field-leaduri-email"
              />
            </Field>
          </div>

          <Field label="Sursă">
            <Select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className={fieldClass("source")}
              data-testid="field-leaduri-source"
            >
              <option value="">Nespecificată</option>
              {CLIENT_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {CLIENT_SOURCE_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Interes" hint="Ce își dorește, în cuvintele lui.">
            <Input
              value={interest}
              onChange={(e) => setInterest(e.target.value)}
              data-testid="field-leaduri-interest"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Etapă" required>
              <Select
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                className={fieldClass("stage")}
                data-testid="field-leaduri-stage"
              >
                {CLIENT_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {CLIENT_STAGE_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>

            {/* LA ORICE ETAPA, nu doar la De reluat: lista Leaduri sorteaza dupa
                data, iar o data pusa de cineva este o promisiune la orice etapa.
                Obligatorie devine numai la De reluat. */}
            <Field label="Data de reluare" required={stage === "follow_up"}>
              <Input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                className={fieldClass("followUpDate")}
                data-testid="field-leaduri-follow-up"
              />
            </Field>
          </div>

          <Field label="Responsabil">
            <Select
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              className={fieldClass("ownerId")}
              data-testid="field-leaduri-owner"
            >
              <option value="">Nealocat</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.fullName}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Note">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              data-testid="field-leaduri-notes"
            />
          </Field>

          {error ? (
            <p
              role="alert"
              data-testid="form-error"
              className="rounded-[10px] border border-rc-danger bg-rc-danger-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
            >
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>
              Renunță
            </Button>
            <Button type="submit" disabled={pending} data-testid="leaduri-submit">
              {pending ? "Se salvează..." : "Salvează"}
            </Button>
          </div>
        </form>
      </aside>
    </div>
  );
}
