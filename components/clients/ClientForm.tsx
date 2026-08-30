"use client";

// Formularul de client, cardul P3-06.
//
// ACELASI PANOU LATERAL CA LA PRODUS, deliberat. P3-06 spune ca limbajul vizual
// existent se reutilizeaza si nu se inlocuieste: un al doilea fel de formular ar
// fi o a doua convenție de invatat, pentru acelasi lucru.
//
// DETALIUL ESTE O RUTA, FORMULARUL ESTE UN PANOU, si cele doua nu se contrazic.
// Ruta poarta file in cardul urmator si un panou lateral nu tine cinci file la o
// latime citibila; formularul are opt campuri si nu merita o pagina.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { createClientRecord, updateClientRecord } from "@/lib/data/client-actions";
import { CLIENT_TYPE_LABEL, type ClientDetail } from "@/lib/data/clients-types";

export function ClientForm({
  client,
  onClose,
  onSaved,
}: {
  client?: ClientDetail;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const editing = client !== undefined;

  const [name, setName] = React.useState(client?.name ?? "");
  const [type, setType] = React.useState<string>(client?.type ?? "company");
  const [fiscalCode, setFiscalCode] = React.useState(client?.fiscalCode ?? "");
  const [address, setAddress] = React.useState(client?.address ?? "");
  const [phone, setPhone] = React.useState(client?.phone ?? "");
  const [email, setEmail] = React.useState(client?.email ?? "");
  const [notes, setNotes] = React.useState(client?.notes ?? "");
  const [active, setActive] = React.useState(client?.active ?? true);

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

    const input = { name, type, fiscalCode, address, phone, email, notes, active };
    const result = editing
      ? await updateClientRecord(client!.id, input)
      : await createClientRecord(input);

    if (!result.ok) {
      setError(result.message);
      setErrorField(result.field);
      setPending(false);
      return;
    }

    router.refresh();
    if (onSaved) onSaved(result.value.id);
    else onClose();
  }

  const fieldClass = (field: string) =>
    errorField === field ? "border-rc-danger" : undefined;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <aside
        className="relative w-[520px] h-full bg-rc-white text-rc-black overflow-y-auto shadow-2xl"
        data-testid="client-form"
      >
        <div className="sticky top-0 bg-rc-white text-rc-black border-b border-rc-line px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[17px] font-bold text-rc-black leading-snug">
              {editing ? "Modifică clientul" : "Client nou"}
            </h2>
            <p className="text-[12.5px] text-rc-muted mt-1">
              IDNO-ul este ce deosebește două firme cu aceeași denumire.
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
              data-testid="field-client-name"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Tip" required>
              <Select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className={fieldClass("type")}
                data-testid="field-client-type"
              >
                <option value="company">{CLIENT_TYPE_LABEL.company}</option>
                <option value="individual">{CLIENT_TYPE_LABEL.individual}</option>
              </Select>
            </Field>

            <Field
              label="IDNO"
              hint="Companiile au IDNO, persoanele fizice nu."
            >
              <Input
                value={fiscalCode}
                onChange={(e) => setFiscalCode(e.target.value)}
                className={fieldClass("fiscalCode")}
                data-testid="field-client-fiscal"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Telefon">
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                data-testid="field-client-phone"
              />
            </Field>
            <Field label="Email">
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="field-client-email"
              />
            </Field>
          </div>

          <Field label="Adresă">
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              data-testid="field-client-address"
            />
          </Field>

          <Field label="Note">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              data-testid="field-client-notes"
            />
          </Field>

          {editing ? (
            <label className="flex items-center gap-2.5 text-[13.5px] text-rc-black">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                data-testid="field-client-active"
                className="w-4 h-4 accent-rc-orange"
              />
              {/* DEZACTIVAREA NU ESTE STERGERE. Migratia 0013 nu are politica de
                  delete pentru niciun rol: un client la care se leaga proiecte si
                  iesiri nu poate sa dispara fara sa faca istoricul de necitit. */}
              Activ, adică apare în liste și în selectoare
            </label>
          ) : null}

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
            <Button type="submit" disabled={pending} data-testid="client-submit">
              {pending ? "Se salvează..." : "Salvează"}
            </Button>
          </div>
        </form>
      </aside>
    </div>
  );
}
