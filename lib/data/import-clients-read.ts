// Citirea clientilor existenti pentru importul de clienti si de leaduri.
//
// PostgREST taie un raspuns la 1000 de randuri, deci tabela se citeste pe
// pagini: un dublat peste primul 1000 nu trebuie sa scape planului. Aceeasi
// regula ca la importul de proiecte si de materiale.
//
// O CITIRE CARE ESUEAZA NU DA O LISTA GOALA. O lista goala ar face ca fiecare
// rand din fisier sa para nou si importul ar crea dublate. Citirea arunca
// ImportReadError, iar actiunea o transforma in mesajul de mai jos.
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const CLIENTS_READ_FAILED = "Nu am putut citi clienții existenți. Încercați din nou.";

/** Mesajul pentru orice alta citire a importurilor (proiecte, produse, categorii). */
export const readFailedMessage = (what: string) => `Nu am putut citi ${what}. Încercați din nou.`;

export class ImportReadError extends Error {
  constructor(message: string = CLIENTS_READ_FAILED) {
    super(message);
    this.name = "ImportReadError";
  }
}

const PAGE = 1000;

export async function readAllRows(
  supabase: Supabase,
  table: "clients" | "projects" | "categories" | "products",
  columns: string,
  failure: string = CLIENTS_READ_FAILED,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error || !data) throw new ImportReadError(failure);
    rows.push(...(data as unknown as Record<string, unknown>[]));
    if (data.length < PAGE) break;
  }
  return rows;
}

export async function readAllClients(
  supabase: Supabase,
  columns: string,
): Promise<Record<string, string | null>[]> {
  return (await readAllRows(supabase, "clients", columns)) as Record<string, string | null>[];
}

/** Ruleaza o citire si intoarce mesajul romanesc cand ea esueaza. */
export async function loadOrRefuse<T>(
  read: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
  try {
    return { ok: true, value: await read() };
  } catch (error) {
    if (error instanceof ImportReadError) return { ok: false, message: error.message };
    throw error;
  }
}
