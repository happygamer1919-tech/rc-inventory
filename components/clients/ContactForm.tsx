"use client";

// Formularul de contact, cardul P3-08. Inline in fila, nu pe un ecran separat:
// un contact are cinci campuri si o ruta proprie ar fi ceremonie.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Textarea } from "@/components/ui/primitives";
import { createContact, updateContact } from "@/lib/data/contact-actions";
import type { ClientContact } from "@/lib/data/client-detail";

/** Sugestiile din P3-02. Lista NU este inchisa si utilizatorul care scrie
 *  altceva nu este corectat: un rol este o descriere a unei persoane. */
const ROLE_SUGGESTIONS = ["Șef de șantier", "Contabil", "Administrator", "Achiziții", "Șofer"];

export function ContactForm({
  clientId,
  contact,
  onClose,
}: {
  clientId: string;
  contact?: ClientContact;
  onClose: () => void;
}) {
  const router = useRouter();
  const editing = contact !== undefined;

  const [name, setName] = React.useState(contact?.name ?? "");
  const [role, setRole] = React.useState(contact?.role ?? "");
  const [phone, setPhone] = React.useState(contact?.phone ?? "");
  const [email, setEmail] = React.useState(contact?.email ?? "");
  const [isPrimary, setIsPrimary] = React.useState(contact?.isPrimary ?? false);
  const [notes, setNotes] = React.useState(contact?.notes ?? "");
  const [active, setActive] = React.useState(contact?.active ?? true);

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

    const input = { clientId, name, role, phone, email, isPrimary, notes, active };
    const result = editing ? await updateContact(contact!.id, input) : await createContact(input);

    if (!result.ok) {
      setError(result.message);
      setErrorField(result.field);
      setPending(false);
      return;
    }
    router.refresh();
    onClose();
  }

  const fieldClass = (f: string) => (errorField === f ? "border-rc-danger" : undefined);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <aside
        className="relative w-[480px] h-full bg-rc-white text-rc-black overflow-y-auto shadow-2xl"
        data-testid="contact-form"
      >
        <div className="sticky top-0 bg-rc-white text-rc-black border-b border-rc-line px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[17px] font-bold text-rc-black leading-snug">
              {editing ? "Modifică contactul" : "Contact nou"}
            </h2>
            <p className="text-[12.5px] text-rc-muted mt-1">
              Un client poate avea oricâte persoane și cel mult un contact principal.
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
          <Field label="Persoană de contact" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldClass("name")}
              data-testid="field-contact-name"
            />
          </Field>

          <Field label="Rol" hint="Sugestii, nu o listă închisă.">
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              list="rc-contact-roles"
              data-testid="field-contact-role"
            />
            <datalist id="rc-contact-roles">
              {ROLE_SUGGESTIONS.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Telefon">
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                data-testid="field-contact-phone"
              />
            </Field>
            <Field label="Email">
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="field-contact-email"
              />
            </Field>
          </div>

          <Field label="Note">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              data-testid="field-contact-notes"
            />
          </Field>

          <label className="flex items-center gap-2.5 text-[13.5px] text-rc-black">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              data-testid="field-contact-primary"
              className={`w-4 h-4 accent-rc-orange ${fieldClass("isPrimary") ?? ""}`}
            />
            Contact principal. Cel mult unul per client.
          </label>

          {editing ? (
            <label className="flex items-center gap-2.5 text-[13.5px] text-rc-black">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                data-testid="field-contact-active"
                className="w-4 h-4 accent-rc-orange"
              />
              Activ
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
            <Button type="submit" disabled={pending} data-testid="contact-submit">
              {pending ? "Se salvează..." : "Salvează"}
            </Button>
          </div>
        </form>
      </aside>
    </div>
  );
}
