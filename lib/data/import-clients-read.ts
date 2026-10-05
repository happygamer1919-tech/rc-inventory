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

export class ImportReadError extends Error {
  constructor() {
    super(CLIENTS_READ_FAILED);
    this.name = "ImportReadError";
  }
}

const PAGE = 1000;

export async function readAllClients(
  supabase: Supabase,
  columns: string,
): Promise<Record<string, string | null>[]> {
  const rows: Record<string, string | null>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("clients")
      .select(columns)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error || !data) throw new ImportReadError();
    rows.push(...(data as unknown as Record<string, string | null>[]));
    if (data.length < PAGE) break;
  }
  return rows;
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
