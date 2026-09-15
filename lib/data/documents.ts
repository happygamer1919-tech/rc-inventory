import "server-only";

// Citirea documentelor unui client sau ale unui proiect. Cardul P3-15.
//
// INTAI SE INTREABA DACA TABELA EXISTA. Migratia 0044 ajunge in productie pe
// fuziune, in aproximativ doua minute, iar codul acesta pleaca din acelasi push.
// Fara hasDocuments, fila Documente ar cere o tabela inexistenta in fereastra
// aceea. Raspunsul null inseamna "nu este inca activ", nu "niciun document".

import { createClient } from "@/lib/supabase/server";
import { hasDocuments } from "./schema-capability";
import {
  DOCUMENTS_INLINE,
  DOCUMENTS_PAGE_SIZE,
  isDocumentKind,
  type DocumentOwner,
  type DocumentRow,
  type DocumentsView,
} from "./documents-types";

export async function listDocuments(
  owner: DocumentOwner,
  opts: { showAll: boolean; page: number },
): Promise<DocumentsView | null> {
  const supabase = await createClient();
  if (!(await hasDocuments(supabase))) return null;

  // DOCTRINA DENSITATII: fila este un rezumat, cel mult 5 randuri. Lista
  // completa se cere explicit si pagineaza la 25.
  const showAll = opts.showAll;
  const pageSize = showAll ? DOCUMENTS_PAGE_SIZE : DOCUMENTS_INLINE;
  const page = showAll && Number.isInteger(opts.page) && opts.page > 1 ? opts.page : 1;
  const from = (page - 1) * pageSize;

  const { data, count, error } = await supabase
    .from("documents")
    .select("id, original_name, mime_type, size_bytes, kind, created_at", { count: "exact" })
    .eq(owner.type === "client" ? "client_id" : "project_id", owner.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) {
    return { rows: [], total: 0, showAll, page, pageSize, failed: true };
  }

  const rows: DocumentRow[] = (data ?? []).map((r) => ({
    id: r.id as string,
    originalName: r.original_name as string,
    mimeType: r.mime_type as string,
    sizeBytes: Number(r.size_bytes),
    kind: isDocumentKind(String(r.kind)) ? (r.kind as DocumentRow["kind"]) : "altele",
    createdAt: r.created_at as string,
  }));

  return { rows, total: count ?? rows.length, showAll, page, pageSize, failed: false };
}
