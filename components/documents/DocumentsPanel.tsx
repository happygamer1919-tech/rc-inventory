"use client";

// Fila Documente, pe fisa clientului si pe fisa proiectului. Cardul P3-15.
//
// INCARCARE, LISTA, DESCARCARE, STERGERE, si nimic altceva: fara versiuni, fara
// previzualizare, fara miniaturi, cum spune cardul.
//
// FISIERUL MERGE DIN BROWSER DIRECT IN BUCKET, pe o legatura semnata pe care o da
// serverul, iar serverul verifica apoi ce a ajuns. De ce, pe larg, in
// lib/data/document-actions.ts.
//
// CAMPUL DE FISIER AL BROWSERULUI ESTE ASCUNS si il inlocuieste butonul romanesc
// comun, pentru ca butonul nativ scrie "Choose File" in engleza. Cardul P3-15 a
// facut aici prima copie a acelui buton; cardul P3-49 a mutat-o in componenta
// comuna FilePicker, folosita acum de fiecare camp de fisier din aplicatie.
//
// DOCTRINA DENSITATII: fila arata cel mult 5 documente, cele mai noi, si o
// legatura catre lista completa, care pagineaza la 25. Lista completa traieste in
// adresa, ca si fila.

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Select,
  Table,
  Td,
  Th,
} from "@/components/ui/primitives";
import { FilePicker } from "@/components/ui/FilePicker";
import { createClient } from "@/lib/supabase/client";
import { DOCS_BUCKET } from "@/lib/data/inbound-types";
import { formatDate } from "@/lib/data/format";
import {
  confirmDocumentUpload,
  deleteDocument,
  documentDownloadUrl,
  prepareDocumentUpload,
} from "@/lib/data/document-actions";
import {
  ALLOWED_EXTENSIONS_LABEL,
  DOCUMENT_ACCEPT,
  DOCUMENT_KINDS,
  DOCUMENT_KIND_LABEL,
  DOCUMENT_MESSAGES,
  formatBytes,
  type DocumentOwner,
  type DocumentsView,
} from "@/lib/data/documents-types";

export function DocumentsPanel({
  owner,
  documents,
  canWrite,
}: {
  owner: DocumentOwner;
  /** null: migratia 0044 nu este inca aplicata pe baza aceasta. */
  documents: DocumentsView | null;
  canWrite: boolean;
}) {
  if (!documents) {
    return (
      <Card>
        <CardHeader title="Documente" />
        <EmptyState
          title={DOCUMENT_MESSAGES.notActive}
          hint="Fila se activează singură imediat ce baza de date este actualizată."
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Documente"
        hint={
          owner.type === "client"
            ? "Contractele, actele și facturile clientului"
            : "Contractele, actele, facturile și fotografiile de pe șantier"
        }
      />
      {canWrite ? <DocumentUpload owner={owner} /> : null}
      <DocumentList documents={documents} canWrite={canWrite} />
    </Card>
  );
}

/* ------------------------------------------------------------- incarcare -- */

function DocumentUpload({ owner }: { owner: DocumentOwner }) {
  const router = useRouter();
  const inputId = React.useId();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [kind, setKind] = React.useState("");
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  async function upload() {
    setError(null);
    setDone(false);
    const file = inputRef.current?.files?.[0];
    if (!kind) {
      setError(DOCUMENT_MESSAGES.noKind);
      return;
    }
    if (!file) {
      setError(DOCUMENT_MESSAGES.noFile);
      return;
    }

    setPending(true);
    try {
      // 1. Serverul verifica tipul si marimea si da legatura de incarcare.
      const prepared = await prepareDocumentUpload({
        owner,
        fileName: file.name,
        sizeBytes: file.size,
        kind,
      });
      if (!prepared.ok) {
        setError(prepared.message);
        return;
      }

      // 2. Fisierul merge direct in bucket, care isi aplica singur limitele.
      const { path, token, contentType } = prepared.value;
      const { error: uploadError } = await createClient()
        .storage.from(DOCS_BUCKET)
        .uploadToSignedUrl(path, token, file, { contentType });
      if (uploadError) {
        setError(
          `Depozitul a refuzat fișierul. Se acceptă doar ${ALLOWED_EXTENSIONS_LABEL}, de cel mult 20 MB.`,
        );
        return;
      }

      // 3. Serverul verifica ce a ajuns si abia apoi scrie documentul.
      const confirmed = await confirmDocumentUpload({ owner, path, fileName: file.name, kind });
      if (!confirmed.ok) {
        setError(confirmed.message);
        return;
      }

      setDone(true);
      setKind("");
      setFileName(null);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch {
      setError("Încărcarea a eșuat. Verifică legătura la internet și încearcă din nou.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="px-5 py-4 border-b border-rc-line" data-testid="document-upload">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Tip document" required className="w-[200px]">
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            disabled={pending}
            data-testid="document-kind"
          >
            <option value="">Alege tipul</option>
            {DOCUMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {DOCUMENT_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>

        <div>
          <span className="block text-[12.5px] font-semibold text-rc-black mb-1.5">
            Fișier<span className="text-rc-orange"> *</span>
          </span>
          <FilePicker
            inputRef={inputRef}
            id={inputId}
            accept={DOCUMENT_ACCEPT}
            disabled={pending}
            fileName={fileName}
            onChange={(e) => {
              setFileName(e.target.files?.[0]?.name ?? null);
              setError(null);
              setDone(false);
            }}
            inputTestId="document-input"
            chooseTestId="document-choose"
            nameTestId="document-chosen"
          />
        </div>

        <Button type="button" onClick={upload} disabled={pending} data-testid="document-submit">
          {pending ? "Se încarcă..." : "Încarcă"}
        </Button>
      </div>

      <p className="mt-2 text-[12px] text-rc-muted">
        Se acceptă {ALLOWED_EXTENSIONS_LABEL}, de cel mult 20 MB.
      </p>

      {done ? (
        <p className="mt-2.5 text-[12.5px] text-rc-ok font-semibold" data-testid="document-done">
          Documentul a fost încărcat.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          data-testid="document-error"
          className="mt-2.5 rounded-[10px] border border-rc-danger bg-rc-danger-soft px-3 py-2 text-[12.5px] text-rc-black"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- lista -- */

function DocumentList({ documents, canWrite }: { documents: DocumentsView; canWrite: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function href(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    next.set("fila", "documente");
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    return `${pathname}?${next.toString()}`;
  }

  async function download(id: string) {
    setBusy(id);
    setError(null);
    const result = await documentDownloadUrl(id);
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    // Legatura trimite fisierul ca atasament, deci pagina ramane pe loc. Dupa un
    // await, window.open ar putea fi blocat; o navigare catre un atasament nu.
    window.location.assign(result.value.url);
  }

  async function remove(id: string) {
    setBusy(id);
    setError(null);
    const result = await deleteDocument(id);
    setBusy(null);
    setConfirming(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.refresh();
  }

  if (documents.failed) {
    return (
      <EmptyState
        title="Documentele nu s-au putut încărca"
        hint="Reîncarcă pagina. Dacă se repetă, anunță administratorul."
      />
    );
  }

  if (documents.total === 0) {
    return (
      <EmptyState
        title="Niciun document"
        hint={
          canWrite
            ? "Încarcă primul document cu formularul de mai sus."
            : "Documentele se încarcă de administrator."
        }
      />
    );
  }

  const pages = Math.max(1, Math.ceil(documents.total / documents.pageSize));

  return (
    <>
      {error ? (
        <p
          role="alert"
          data-testid="document-list-error"
          className="mx-5 mt-4 rounded-[10px] border border-rc-danger bg-rc-danger-soft px-3 py-2 text-[12.5px] text-rc-black"
        >
          {error}
        </p>
      ) : null}

      <Table>
        <thead>
          <tr>
            <Th>Denumire</Th>
            <Th>Tip</Th>
            <Th align="right">Mărime</Th>
            <Th>Încărcat la</Th>
            <Th></Th>
          </tr>
        </thead>
        <tbody>
          {documents.rows.map((d) => (
            <tr key={d.id} data-testid="document-row" data-name={d.originalName} data-id={d.id}>
              <Td>
                <span className="font-semibold text-rc-black break-all">{d.originalName}</span>
              </Td>
              <Td>{DOCUMENT_KIND_LABEL[d.kind]}</Td>
              <Td align="right">{formatBytes(d.sizeBytes)}</Td>
              <Td>{formatDate(d.createdAt)}</Td>
              <Td align="right">
                {confirming === d.id ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="text-[12.5px] text-rc-black">Ștergi definitiv documentul?</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      onClick={() => remove(d.id)}
                      disabled={busy === d.id}
                      data-testid="document-delete-confirm"
                    >
                      {busy === d.id ? "Se șterge..." : "Da, șterge"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setConfirming(null)}
                      disabled={busy === d.id}
                      data-testid="document-delete-cancel"
                    >
                      Renunță
                    </Button>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => download(d.id)}
                      disabled={busy === d.id}
                      data-testid="document-download"
                    >
                      {busy === d.id ? "Se pregătește..." : "Descarcă"}
                    </Button>
                    {canWrite ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirming(d.id)}
                        data-testid="document-delete"
                      >
                        Șterge
                      </Button>
                    ) : null}
                  </span>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      {!documents.showAll && documents.total > documents.rows.length ? (
        <div className="px-5 py-4 border-t border-rc-line">
          <Link
            href={href({ documente: "toate", "pagina-documente": null })}
            className="text-[12.5px] text-rc-orange-deep hover:underline"
            data-testid="documents-all"
          >
            Vezi toate cele {documents.total} documente
          </Link>
        </div>
      ) : null}

      {documents.showAll ? (
        <div
          className="flex items-center justify-between gap-3 px-5 py-4 border-t border-rc-line text-[12.5px]"
          data-testid="documents-pager"
        >
          <span className="text-rc-muted">
            Pagina {documents.page} din {pages}, {documents.total}{" "}
            {documents.total === 1 ? "document" : "documente"}
          </span>
          <span className="inline-flex items-center gap-4">
            {documents.page > 1 ? (
              <Link
                href={href({ "pagina-documente": String(documents.page - 1) })}
                className="text-rc-orange-deep hover:underline"
                data-testid="documents-prev"
              >
                Pagina anterioară
              </Link>
            ) : null}
            {documents.page < pages ? (
              <Link
                href={href({ "pagina-documente": String(documents.page + 1) })}
                className="text-rc-orange-deep hover:underline"
                data-testid="documents-next"
              >
                Pagina următoare
              </Link>
            ) : null}
            <Link
              href={href({ documente: null, "pagina-documente": null })}
              className="text-rc-orange-deep hover:underline"
              data-testid="documents-summary"
            >
              Doar cele mai noi
            </Link>
          </span>
        </div>
      ) : null}
    </>
  );
}
