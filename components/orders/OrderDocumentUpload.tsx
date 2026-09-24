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
import { FilePicker } from "@/components/ui/FilePicker";
import { uploadOrderDocument } from "@/lib/data/inbound-actions";

const ACCEPT = "application/pdf,image/png,image/jpeg";
const MAX_BYTES = 10 * 1024 * 1024;

// P3-98, CONSTATAREA F18 A MATURARII DIN 2026-09-22.
//
// `File.type` este ce s-au inteles sistemul de operare si browserul sa spuna, si
// este PE BUNA DREPTATE sirul gol cand sistemul nu are o potrivire pentru
// extensie. Unele sisteme scriu si `image/jpg` in loc de `image/jpeg`. Pana la
// cardul acesta casuta compara sirul exact, deci un PDF bun era refuzat inainte
// sa plece, cu un mesaj care spunea ca fisierul este de alt fel cand nu era.
//
// CUM SE REPARA, SI DE CE ASA. Tipul se DUCE LA FORMA LUI CANONICA aici, inainte
// de trimitere: aliasul se indreapta, iar tipul gol se citeste din extensie,
// exact ce ar fi facut sistemul daca ar fi cunoscut-o. Fisierul pleaca apoi cu
// acel tip.
//
// VERIFICAREA DE PE SERVER RAMANE NEATINSA, si asta este chiar motivul pentru
// care indreptarea se face inainte de trimitere si nu doar in dreptul mesajului:
// `uploadOrderDocument` (lib/data/inbound-actions.ts) compara si el `file.type`
// cu aceleasi trei tipuri, iar un File cu tipul gol ajunge acolo ca
// `application/octet-stream` (asa cere serializarea multipart cand tipul
// lipseste, masurat pe Chromium, nu presupus). O reparatie numai in dreptul
// mesajului ar fi mutat refuzul de pe ecran pe server, cu acelasi text, si nu ar
// fi schimbat nimic pentru operator. Nimic nu slabeste: serverul refuza in
// continuare orice nu este PDF, PNG sau JPG, iar bucketul isi aplica limitele
// lui din migratia 0002.
//
// UN FEL CHIAR GRESIT ESTE REFUZAT MAI DEPARTE: un .exe sau un .zip nu are nici
// tip acceptat, nici extensie acceptata, deci primeste acelasi mesaj romanesc.

/** Tipul pe care il are un fel de fisier acceptat, dupa extensie. Se foloseste
 *  NUMAI cand browserul nu a spus niciun tip. */
const TYPE_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

/** Tipuri pe care unele sisteme le scriu in locul celui canonic. */
const TYPE_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
};

/** Tipul canonic cu care pleaca fisierul, sau null cand nu este un fel acceptat. */
function acceptedType(file: File): string | null {
  const canonical = TYPE_ALIASES[file.type] ?? file.type;
  if (ACCEPT.split(",").includes(canonical)) return canonical;
  // Un tip spus si neacceptat ramane refuzat: extensia nu il poate salva.
  if (file.type !== "") return null;
  const dot = file.name.lastIndexOf(".");
  const extension = dot === -1 ? "" : file.name.slice(dot).toLowerCase();
  return TYPE_BY_EXTENSION[extension] ?? null;
}

export function OrderDocumentUpload({
  orderId,
  onUploaded,
}: {
  orderId: string;
  /** P3-85. `warning` este mesajul unui document pastrat a carui citire
   *  automata nu a pornit; lipseste cand totul a mers. */
  onUploaded?: (warning?: string) => void;
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [fileName, setFileName] = React.useState<string | null>(null);

  function clearChoice() {
    if (inputRef.current) inputRef.current.value = "";
    setFileName(null);
  }

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError(null);
    setDone(false);
    setFileName(file?.name ?? null);
    if (!file) return;

    const type = acceptedType(file);
    if (type === null) {
      setError("Se acceptă doar PDF, PNG sau JPG.");
      clearChoice();
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Fișierul depășește 10 MB.");
      clearChoice();
      return;
    }

    setPending(true);
    const formData = new FormData();
    // Acelasi fisier, cu tipul dus la forma canonica doar cand a fost nevoie.
    formData.set("file", type === file.type ? file : new File([file], file.name, { type }));
    const result = await uploadOrderDocument(orderId, formData);
    setPending(false);

    if (!result.ok) {
      setError(result.message);
      // P3-85. Documentul este atasat, dar citirea automata nu a pornit. NU
      // "Document atasat.", ca si cum totul ar fi mers: mesajul ramane, iar
      // ecranul se reimprospateaza ca documentul sa se vada. Panoul comenzii
      // primeste mesajul, fiindca reincarcarea lui ascunde aceasta casuta.
      if (result.saved) {
        onUploaded?.(result.message);
        router.refresh();
      }
      return;
    }
    setDone(true);
    onUploaded?.();
    router.refresh();
  }

  return (
    <div data-testid="doc-upload">
      <FilePicker
        inputRef={inputRef}
        accept={ACCEPT}
        onChange={onChange}
        disabled={pending}
        fileName={fileName}
        inputTestId="doc-input"
        chooseTestId="doc-choose"
        nameTestId="doc-chosen"
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
            className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-rc-white text-rc-black border border-rc-line-strong hover:bg-rc-paper font-semibold text-[13px] px-3 py-1.5 max-md:min-h-11"
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
