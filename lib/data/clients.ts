import "server-only";

// Citirile clientilor, cardul P3-06.
//
// CAUTAREA SI FILTRAREA SE FAC PE SERVER, nu in browser. Un ecran care aduce
// toata tabela si o filtreaza in memorie merge perfect pana in ziua in care nu
// mai merge, si ziua aceea vine fara sa anunte. Paginarea la 25 din P3-06 ar fi
// oricum o minciuna daca randurile ar fi deja toate aduse.

import { createClient } from "@/lib/supabase/server";
import {
  CLIENTS_PAGE_SIZE,
  isClientType,
  type ClientDetail,
  type ClientListQuery,
  type ClientRow,
} from "./clients-types";

/** Ce a cerut ecranul, si cate randuri exista in total pentru acele filtre. */
export type ClientListResult = {
  rows: ClientRow[];
  total: number;
  page: number;
  pageCount: number;
};

/** Citeste filtrele din sirul de interogare, cu valori implicite sigure.
 *
 *  Un parametru gresit din URL nu este o eroare de ecran: cineva a scris in
 *  bara de adrese, sau a trimis o legatura veche. Ecranul revine la implicit si
 *  arata ceva, in loc sa afiseze o pagina de eroare pentru un `page=abc`. */
export function parseClientQuery(params: {
  q?: string;
  tip?: string;
  stare?: string;
  pagina?: string;
}): ClientListQuery {
  const page = Number(params.pagina);
  return {
    q: (params.q ?? "").trim(),
    type: isClientType(params.tip) ? params.tip : "",
    status:
      params.stare === "inactive" || params.stare === "toate"
        ? params.stare
        : "active",
    page: Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1,
  };
}

/**
 * Lista de clienti, filtrata si paginata.
 *
 * CAUTAREA ESTE O SINGURA CASUTA peste denumire, IDNO, telefon si email, fara
 * diacritice si fara majuscule, exact ca in P3-06. Nu patru filtre separate:
 * operatorul stie ce cauta, nu in ce coloana se afla.
 *
 * PLIEREA SE FACE CU public.fold_text, functia din migratia 0017, si nu cu un
 * `ilike` peste textul brut. Un `ilike '%tigla%'` nu gaseste "Țiglă", ceea ce
 * este exact defectul pe care faza 1 l-a gasit pe ecran si l-a scris in
 * docs/LEARNINGS.md. Aceeasi functie o foloseste si backfill-ul, deci ce
 * gaseste cautarea si ce potriveste o migratie nu pot sa se contrazica.
 */
export async function listClients(query: ClientListQuery): Promise<ClientListResult> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("search_clients", {
    p_q: query.q,
    p_type: query.type === "" ? null : query.type,
    p_status: query.status,
    p_limit: CLIENTS_PAGE_SIZE,
    p_offset: (query.page - 1) * CLIENTS_PAGE_SIZE,
  });

  if (error) throw new Error(`Nu s-au putut citi clienții: ${error.message}`);

  const rows = (data ?? []) as {
    id: string;
    name: string;
    type: string;
    phone: string | null;
    active: boolean;
    active_projects: number | string;
    total_count: number | string;
  }[];

  // ZERO RANDURI INSEAMNA ZERO IN TOTAL PENTRU FILTRELE ACESTEA, si nu "nu stiu".
  // Totalul vine dintr-o functie de fereastra peste multimea filtrata, deci
  // exista pe fiecare rand si lipseste exact cand nu exista niciun rand.
  const total = rows.length > 0 ? Number(rows[0]!.total_count) : 0;

  return {
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: isClientType(r.type) ? r.type : "company",
      phone: r.phone,
      activeProjects: Number(r.active_projects) || 0,
      active: Boolean(r.active),
    })),
    total,
    page: query.page,
    pageCount: Math.max(1, Math.ceil(total / CLIENTS_PAGE_SIZE)),
  };
}

/** Un client, pentru ruta de detaliu. Null cand id-ul nu exista. */
export async function getClient(id: string): Promise<ClientDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("clients")
    .select("id, name, type, fiscal_code, address, phone, email, notes, active, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id as string,
    name: data.name as string,
    type: isClientType(data.type) ? data.type : "company",
    fiscalCode: (data.fiscal_code as string | null) ?? null,
    address: (data.address as string | null) ?? null,
    phone: (data.phone as string | null) ?? null,
    email: (data.email as string | null) ?? null,
    notes: (data.notes as string | null) ?? null,
    active: Boolean(data.active),
    createdAt: data.created_at as string,
  };
}
