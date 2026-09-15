"use server";

// Scrierile documentelor: incarcare, legatura de descarcare, stergere. Cardul P3-15.
//
// FISIERUL NU TRECE PRIN SERVERUL APLICATIEI. Aplicatia ruleaza pe Vercel, unde
// corpul unei cereri catre o functie are un plafon de aproximativ 4,5 MB, iar
// cardul cere 20 MB. Asa ca incarcarea are trei pasi:
//
//   1. prepareDocumentUpload verifica rolul, tipul (dupa extensie) si marimea
//      declarata, alege calea si cere Supabase o legatura de incarcare semnata
//      pentru EXACT acea cale;
//   2. browserul trimite fisierul direct in bucket, pe acea legatura; bucketul
//      isi aplica singur limitele din 0044, 20 MB si cele opt tipuri;
//   3. confirmDocumentUpload citeste de la Supabase marimea REALA a obiectului si
//      primii lui octeti, ii compara cu tipul extensiei, si abia apoi scrie
//      randul. Un obiect care nu trece este sters.
//
// VERIFICAREA DE PE SERVER ESTE REGULA, cea din browser o curtoazie, ca in
// OrderDocumentUpload. Pasul 3 nu crede nimic din ce a spus browserul la pasul 1.
//
// LEGATURA DE DESCARCARE ESTE CEA A SUPABASE, direct, cu viata de 15 minute, la
// fel ca signedDocumentUrl din inbound-actions.ts. Nu trece prin
// app/api/documents: aceea exista pentru contractul de extragere si nu are
// legatura cu acest card.
//
// STERGEREA: intai obiectul, apoi randul. Daca obiectul nu se poate sterge,
// randul ramane si actiunea spune de ce. Cine a sters scrie baza de date, prin
// declansatorul documents_record_deletion din 0044, nu aceasta functie.

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { hasDocuments } from "./schema-capability";
import { DOCS_BUCKET, type ActionResult } from "./inbound-types";
import {
  DOCUMENT_MESSAGES,
  DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  SNIFF_BYTES,
  contentMatchesType,
  documentExtension,
  isDocumentKind,
  type DocumentOwner,
} from "./documents-types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function normalizeOwner(owner: unknown): DocumentOwner | null {
  if (!owner || typeof owner !== "object") return null;
  const { type, id } = owner as { type?: unknown; id?: unknown };
  if (type !== "client" && type !== "project") return null;
  if (typeof id !== "string") return null;
  // Litere mici: calea trebuie sa fie identica cu client_id::text din baza.
  const lower = id.toLowerCase();
  return UUID.test(lower) ? { type, id: lower } : null;
}

function ownerPage(owner: DocumentOwner): string {
  return owner.type === "client" ? `/clienti/${owner.id}` : `/proiecte/${owner.id}`;
}

/** Numai administratorul scrie. Politicile din 0044 refuza oricum; aici se spune romaneste. */
async function ownerGate(): Promise<{ ok: true; supabase: Supabase } | { ok: false; message: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: DOCUMENT_MESSAGES.session };
  if (user.role !== "owner") return { ok: false, message: DOCUMENT_MESSAGES.forbidden };
  const supabase = await createClient();
  if (!(await hasDocuments(supabase))) return { ok: false, message: DOCUMENT_MESSAGES.notActive };
  return { ok: true, supabase };
}

async function ownerExists(supabase: Supabase, owner: DocumentOwner): Promise<boolean> {
  const { data } = await supabase
    .from(owner.type === "client" ? "clients" : "projects")
    .select("id")
    .eq("id", owner.id)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Obiectul stocat la o cale, cu marimea lui, citit de la Supabase.
 * "error" inseamna ca nu s-a putut afla, null ca obiectul nu exista.
 */
async function storedObject(
  supabase: Supabase,
  path: string,
): Promise<{ size: number } | null | "error"> {
  const slash = path.lastIndexOf("/");
  const folder = path.slice(0, slash);
  const name = path.slice(slash + 1);
  const { data, error } = await supabase.storage
    .from(DOCS_BUCKET)
    .list(folder, { search: name, limit: 10 });
  if (error || !data) return "error";
  const item = data.find((o) => o.name === name);
  if (!item) return null;
  const size = Number((item.metadata as { size?: unknown } | null)?.size);
  return { size: Number.isFinite(size) ? size : -1 };
}

/** O citire a primilor octeti care nu raspunde in atat se opreste. */
const FIRST_BYTES_TIMEOUT_MS = 15_000;

/**
 * Primii octeti ai unui obiect, printr-o legatura semnata de un minut.
 * "error" inseamna ca nu s-au putut citi, si atunci nu se spune nimic despre continut.
 *
 * FARA CITITOR DE FLUX SI FARA cancel(). Prima versiune citea din response.body
 * pana la SNIFF_BYTES si apoi astepta reader.cancel(). In CI, rularea 34909961251,
 * confirmarea nu a mai raspuns niciodata in toate cele noua cazuri: incarcarea in
 * bucket raspundea 200, iar actiunea de confirmare ramanea fara raspuns si butonul
 * pe "Se incarca...". Singurul lucru pe care confirmarea il face si pregatirea nu
 * este aceasta citire. Acum se cere numai intervalul de octeti si se citeste tot
 * corpul: SNIFF_BYTES octeti cand serverul respecta Range, cel mult limita
 * bucketului cand nu il respecta.
 *
 * CU TERMEN, ca actiunea sa raspunda intotdeauna: o citire blocata devine un mesaj
 * romanesc, nu un buton care se invarte pentru totdeauna.
 */
async function firstBytes(supabase: Supabase, path: string): Promise<Uint8Array | "error"> {
  const { data } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(path, 60);
  if (!data?.signedUrl) return "error";

  try {
    const response = await fetch(data.signedUrl, {
      headers: { Range: `bytes=0-${SNIFF_BYTES - 1}` },
      cache: "no-store",
      signal: AbortSignal.timeout(FIRST_BYTES_TIMEOUT_MS),
    });
    if (!response.ok) return "error";
    return new Uint8Array(await response.arrayBuffer()).subarray(0, SNIFF_BYTES);
  } catch {
    return "error";
  }
}

async function removeObject(supabase: Supabase, path: string): Promise<void> {
  await supabase.storage.from(DOCS_BUCKET).remove([path]);
}

/* ------------------------------------------------------------- incarcare -- */

export async function prepareDocumentUpload(input: {
  owner: DocumentOwner;
  fileName: string;
  sizeBytes: number;
  kind: string;
}): Promise<ActionResult<{ path: string; token: string; contentType: string }>> {
  const gate = await ownerGate();
  if (!gate.ok) return gate;
  const { supabase } = gate;

  const owner = normalizeOwner(input.owner);
  if (!owner) return { ok: false, message: "Documentul nu are un client sau un proiect valid." };
  if (!isDocumentKind(input.kind)) return { ok: false, message: DOCUMENT_MESSAGES.noKind, field: "kind" };

  const ext = documentExtension(String(input.fileName ?? ""));
  if (!ext) return { ok: false, message: DOCUMENT_MESSAGES.wrongType, field: "file" };

  const size = Number(input.sizeBytes);
  if (!Number.isFinite(size) || size <= 0) return { ok: false, message: DOCUMENT_MESSAGES.empty, field: "file" };
  if (size > MAX_DOCUMENT_BYTES) return { ok: false, message: DOCUMENT_MESSAGES.tooLarge, field: "file" };

  if (!(await ownerExists(supabase, owner))) {
    return {
      ok: false,
      message: owner.type === "client" ? "Clientul nu mai există." : "Proiectul nu mai există.",
    };
  }

  // CALEA NU CONTINE NUMELE FISIERULUI. Un nume dat de utilizator intr-o cale de
  // stocare este o intrebare de traversare pe care nu are nimeni nevoie sa o aiba.
  const path = `${owner.type}/${owner.id}/${randomUUID()}.${ext}`;

  const { data, error } = await supabase.storage.from(DOCS_BUCKET).createSignedUploadUrl(path);
  if (error || !data?.token) {
    return { ok: false, message: `Încărcarea nu a putut începe. ${error?.message ?? ""}`.trim() };
  }

  return { ok: true, value: { path, token: data.token, contentType: DOCUMENT_TYPES[ext]! } };
}

export async function confirmDocumentUpload(input: {
  owner: DocumentOwner;
  path: string;
  fileName: string;
  kind: string;
}): Promise<ActionResult<{ id: string }>> {
  const gate = await ownerGate();
  if (!gate.ok) return gate;
  const { supabase } = gate;

  const owner = normalizeOwner(input.owner);
  if (!owner) return { ok: false, message: "Documentul nu are un client sau un proiect valid." };
  if (!isDocumentKind(input.kind)) return { ok: false, message: DOCUMENT_MESSAGES.noKind, field: "kind" };

  const fileName = String(input.fileName ?? "").trim();
  const ext = documentExtension(fileName);
  if (!ext) return { ok: false, message: DOCUMENT_MESSAGES.wrongType, field: "file" };

  // Calea trebuie sa fie exact forma aleasa de prepareDocumentUpload pentru acest
  // client sau proiect si aceasta extensie. Altfel nu se confirma nimic.
  const expected = new RegExp(
    `^${owner.type}/${owner.id}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.${ext}$`,
  );
  const path = String(input.path ?? "");
  if (!expected.test(path)) return { ok: false, message: "Încărcarea nu poate fi confirmată." };

  const stored = await storedObject(supabase, path);
  if (stored === "error") return { ok: false, message: "Nu s-a putut verifica fișierul încărcat. Încearcă din nou." };
  if (stored === null) return { ok: false, message: "Fișierul nu a ajuns în depozit. Încearcă din nou." };

  // MARIMEA REALA, nu cea declarata la pasul 1.
  if (stored.size <= 0) {
    await removeObject(supabase, path);
    return { ok: false, message: DOCUMENT_MESSAGES.empty, field: "file" };
  }
  if (stored.size > MAX_DOCUMENT_BYTES) {
    await removeObject(supabase, path);
    return { ok: false, message: DOCUMENT_MESSAGES.tooLarge, field: "file" };
  }

  // CONTINUTUL REAL, nu extensia si nu tipul trimis de browser.
  const mimeType = DOCUMENT_TYPES[ext]!;
  const head = await firstBytes(supabase, path);
  if (head === "error") {
    // Nu se stie ce este in fisier, deci nu se scrie randul si obiectul nu ramane orfan.
    await removeObject(supabase, path);
    return { ok: false, message: "Nu s-a putut verifica fișierul încărcat. Încearcă din nou." };
  }
  if (!contentMatchesType(head, mimeType)) {
    await removeObject(supabase, path);
    return { ok: false, message: DOCUMENT_MESSAGES.contentMismatch, field: "file" };
  }

  const user = await getSessionUser();
  const { data, error } = await supabase
    .from("documents")
    .insert({
      client_id: owner.type === "client" ? owner.id : null,
      project_id: owner.type === "project" ? owner.id : null,
      storage_path: path,
      original_name: fileName.slice(0, 255),
      mime_type: mimeType,
      size_bytes: stored.size,
      kind: input.kind,
      uploaded_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    await removeObject(supabase, path);
    if (error?.code === "42501") return { ok: false, message: DOCUMENT_MESSAGES.forbidden };
    return { ok: false, message: `Documentul nu a putut fi salvat. ${error?.message ?? ""}`.trim() };
  }

  revalidatePath(ownerPage(owner));
  return { ok: true, value: { id: data.id as string } };
}

/* ------------------------------------------------------------ descarcare -- */

/**
 * Legatura semnata, cu viata de 15 minute, catre un document.
 *
 * Oricine autentificat o poate cere, ca in politica de citire din 0044. Supabase
 * trimite fisierul ca atasament, cu numele original, deci un clic il descarca.
 */
export async function documentDownloadUrl(documentId: string): Promise<ActionResult<{ url: string }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: DOCUMENT_MESSAGES.session };

  const id = String(documentId ?? "").toLowerCase();
  if (!UUID.test(id)) return { ok: false, message: "Documentul nu mai există." };

  const supabase = await createClient();
  if (!(await hasDocuments(supabase))) return { ok: false, message: DOCUMENT_MESSAGES.notActive };

  const { data: row } = await supabase
    .from("documents")
    .select("storage_path, original_name")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { ok: false, message: "Documentul nu mai există." };

  const { data, error } = await supabase.storage
    .from(DOCS_BUCKET)
    .createSignedUrl(row.storage_path as string, 60 * 15, { download: row.original_name as string });

  if (error || !data?.signedUrl) {
    return { ok: false, message: `Nu s-a putut genera legătura. ${error?.message ?? ""}`.trim() };
  }
  return { ok: true, value: { url: data.signedUrl } };
}

/* -------------------------------------------------------------- stergere -- */

export async function deleteDocument(documentId: string): Promise<ActionResult> {
  const gate = await ownerGate();
  if (!gate.ok) return gate;
  const { supabase } = gate;

  const id = String(documentId ?? "").toLowerCase();
  if (!UUID.test(id)) return { ok: false, message: "Documentul nu mai există." };

  const { data: row } = await supabase
    .from("documents")
    .select("storage_path, client_id, project_id")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { ok: false, message: "Documentul nu mai există." };

  const path = row.storage_path as string;

  // INTAI OBIECTUL. Supabase raspunde fara eroare si cu o lista goala si cand
  // politica nu lasa stergerea, deci lista goala se verifica: daca obiectul este
  // inca acolo, randul ramane.
  const { data: removed, error: removeError } = await supabase.storage.from(DOCS_BUCKET).remove([path]);
  if (removeError) {
    return { ok: false, message: `Documentul nu a putut fi șters. ${removeError.message}` };
  }
  if (!removed || removed.length === 0) {
    const still = await storedObject(supabase, path);
    if (still === "error") return { ok: false, message: "Documentul nu a putut fi șters. Încearcă din nou." };
    // Obiectul lipsea deja: randul arata spre nimic si se sterge mai jos.
    if (still !== null) return { ok: false, message: DOCUMENT_MESSAGES.forbidden };
  }

  // APOI RANDUL. Declansatorul din 0044 scrie cine si cand, in aceeasi tranzactie.
  const { data: deleted, error } = await supabase.from("documents").delete().eq("id", id).select("id");
  if (error || !deleted || deleted.length === 0) {
    return {
      ok: false,
      message: "Fișierul a fost șters, dar documentul a rămas în listă. Încearcă din nou.",
    };
  }

  const owner: DocumentOwner = row.client_id
    ? { type: "client", id: row.client_id as string }
    : { type: "project", id: row.project_id as string };
  revalidatePath(ownerPage(owner));
  return { ok: true, value: undefined };
}
