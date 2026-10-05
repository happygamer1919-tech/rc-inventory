"use server";

// P3-128. EXPORTUL PROIECTELOR: vederea curenta a listei, ca fisier CSV cu antetul
// modelului de import al proiectelor.
//
// FILTRUL ESTE AL LISTEI, NU AL EXPORTULUI. Actiunea primeste parametrii cu care e desenata
// lista (cautare, stare, client), ii trece prin `parseProjectQuery`, adica prin aceeasi
// functie ca pagina, si citeste prin `listProjectRowsForExport`, adica prin aceeasi functie
// din baza ca ecranul (search_projects). Pagina nu conteaza: se exporta toate randurile
// filtrului, pana la IMPORT_MAX_ROWS.
//
// NICIO CITIRE NOUA A LISTEI. Singura citire in plus este cea pe care ecranul o face deja
// pentru un singur proiect (fisa proiectului): coloanele pe care lista nu le intoarce (data
// inceput si notele), citite pentru ID-urile randurilor deja alese de lista. Nu alege nimic,
// doar completeaza.
//
// CLIENTUL SE SCRIE DUPA DENUMIRE, exact cum e stocata: asa il potriveste importul.
//
// NUMAI ADMINISTRATORUL, ca importul si ca exportul de clienti.

import { createClient, getSessionUser } from "@/lib/supabase/server";
import type { ActionResult } from "./inbound-types";
import { listProjectRowsForExport, parseProjectQuery } from "./projects-list";
import { IMPORT_MAX_ROWS } from "./project-import-types";
import { formatCsvNumber } from "./import-shared";
import { PROJECT_STATUS_LABEL } from "./projects-types";
import {
  projectExportCsv,
  projectExportTruncatedNotice,
  type ExportProjectRow,
} from "./project-export-types";

/** Ce trimite ecranul: filtrele listei, fara pagina, sub numele din adresa paginii. */
export type ProjectExportRequest = { q?: string; stare?: string; client?: string };

export type ProjectExportOutcome = {
  csv: string;
  /** Randurile din fisier. */
  count: number;
  /** Randurile pe care le are filtrul. */
  total: number;
  truncated: boolean;
  /** Propozitia romaneasca de aratat cand fisierul a fost taiat, altfel null. */
  notice: string | null;
};

/** Cate id-uri intra intr-o cerere `in (...)`: adresa cererii are o limita. */
const ID_CHUNK = 100;

type DetailRow = { id: string; start_date: string | null; notes: string | null };

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function exportProjects(
  request: ProjectExportRequest,
): Promise<ActionResult<ProjectExportOutcome>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") {
    return { ok: false, message: "Doar administratorul poate exporta proiecte." };
  }

  // Valori necunoscute cad pe implicit, nu extind exportul.
  const query = parseProjectQuery({
    q: typeof request.q === "string" ? request.q : "",
    stare: typeof request.stare === "string" ? request.stare : "",
    client: typeof request.client === "string" ? request.client : "",
  });

  let listed: Awaited<ReturnType<typeof listProjectRowsForExport>>;
  try {
    listed = await listProjectRowsForExport(query, IMPORT_MAX_ROWS);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Exportul a eșuat." };
  }
  const { rows, total } = listed;

  const supabase = await createClient();
  const details = new Map<string, DetailRow>();
  for (const part of chunks(
    rows.map((r) => r.id),
    ID_CHUNK,
  )) {
    const { data, error } = await supabase
      .from("projects")
      .select("id, start_date, notes")
      .in("id", part);
    if (error) return { ok: false, message: `Nu s-au putut citi proiectele: ${error.message}` };
    for (const d of (data ?? []) as unknown as DetailRow[]) details.set(d.id, d);
  }

  const projects: ExportProjectRow[] = rows.map((r) => {
    const d = details.get(r.id);
    return {
      client: r.clientName,
      name: r.name,
      address: r.address ?? "",
      status: PROJECT_STATUS_LABEL[r.status],
      startDate: d?.start_date ?? "",
      plannedEndDate: r.plannedEndDate ?? "",
      // MDL, cu virgula zecimala: forma pe care o citeste readBudget din import si Excel romanesc.
      budgetMdl: r.budgetMdl === null ? "" : formatCsvNumber(r.budgetMdl),
      notes: d?.notes ?? "",
    };
  });

  const truncated = total > rows.length;
  return {
    ok: true,
    value: {
      csv: projectExportCsv(projects),
      count: projects.length,
      total,
      truncated,
      notice: truncated ? projectExportTruncatedNotice(total) : null,
    },
  };
}
