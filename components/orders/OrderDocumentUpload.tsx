"use client";

// Incarcarea documentului comenzii.
//
// Verificarea de tip si de marime se face si aici, si pe server, si in
// constrangerile bucketului din migratia 0002. Cea din browser exista ca sa
// spuna operatorului romaneste ce e in neregula INAINTE sa astepte un fisier de
// 40 MB; ea nu este masura de siguranta. Masura de siguranta este cealalta.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/primitives";
import { uploadOrderDocument } from "@/lib/data/inbound-actions";

const ACCEPT = "application/pdf,image/png,image/jpeg";
const MAX_BYTES = 10 * 1024 * 1024;

export function OrderDocumentUpload({
  orderId,
  onUploaded,
}: {
  orderId: string;
  onUploaded?: () => void;
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError(null);
    setDone(false);
    if (!file) return;

    if (!ACCEPT.split(",").includes(file.type)) {
      setError("Se acceptă doar PDF, PNG sau JPG.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Fișierul depășește 10 MB.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setPending(true);
    const formData = new FormData();
    formData.set("file", file);
    const result = await uploadOrderDocument(orderId, formData);
    setPending(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDone(true);
    onUploaded?.();
    router.refresh();
  }

  return (
    <div data-testid="doc-upload">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={onChange}
        disabled={pending}
        data-testid="doc-input"
        className="block w-full text-[13px] text-rc-muted file:mr-3 file:rounded-[9px] file:border-0 file:bg-rc-orange file:px-3.5 file:py-2 file:text-[13px] file:font-semibold file:text-white hover:file:bg-rc-orange-dark disabled:opacity-60"
      />

      {pending ? (
        <p className="mt-2.5 text-[12.5px] text-rc-muted" data-testid="doc-pending">
          Se încarcă...
        </p>
      ) : null}

      {done ? (
        <p className="mt-2.5 text-[12.5px] text-rc-ok font-semibold" data-testid="doc-done">
          Document atașat.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          data-testid="doc-error"
          className="mt-2.5 rounded-[10px] border border-rc-danger bg-rc-danger-soft px-3 py-2 text-[12.5px] text-rc-black"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Accesul la document: se cere o legatura semnata, apoi se afiseaza ca legatura
 * adevarata.
 *
 * DE CE DOI PASI SI NU window.open. Adresa semnata se genereaza pe server, deci
 * nu exista in momentul clicului. Un window.open apelat DUPA un await nu mai
 * este considerat pornit de utilizator si ramane pe about:blank in unele
 * browsere, adica butonul pare rupt fara sa spuna nimic.
 *
 * Un <a href> adevarat este si mai bun in restul privintelor: se poate deschide
 * cu tastatura, se poate copia, se poate deschide in fundal cu clic de mijloc.
 * Iar cei doi pasi spun pe fata ce se intampla, ceea ce pentru o legatura cu
 * viata scurta catre un document privat este o informatie, nu un inconvenient.
 */
export function OrderDocumentLink({ orderId }: { orderId: string }) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [url, setUrl] = React.useState<string | null>(null);

  async function prepare() {
    setPending(true);
    setError(null);
    const { signedDocumentUrl } = await import("@/lib/data/inbound-actions");
    const result = await signedDocumentUrl(orderId);
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setUrl(result.value.url);
  }

  return (
    <span className="inline-flex flex-col items-start gap-1.5">
      {url ? (
        <>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="doc-link"
            className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-rc-white text-rc-black border border-rc-line-strong hover:bg-rc-paper font-semibold text-[13px] px-3 py-1.5"
          >
            Deschide documentul
          </a>
          <span className="text-[11.5px] text-rc-muted-2">
            Legătura este valabilă 15 minute.
          </span>
        </>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          onClick={prepare}
          disabled={pending}
          data-testid="doc-open"
        >
          {pending ? "Se pregătește..." : "Pregătește legătura"}
        </Button>
      )}
      {error ? (
        <span className="text-[11.5px] text-rc-danger" data-testid="doc-open-error">
          {error}
        </span>
      ) : null}
    </span>
  );
}
