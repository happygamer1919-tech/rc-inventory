// Clientii activi pentru selectoare (filtrul de proiecte, formularul de proiect,
// cumparatorul de la iesiri, sarcini, facturare), cititi pe pagini.
//
// PostgREST taie un raspuns la `max_rows` randuri (valoarea gazduita nu se
// poate citi de aici), iar leadurile stau in aceeasi tabela, deci un import poate
// trece usor peste prag. Fara pagini lipsea, fara niciun mesaj, o parte din
// clienti, iar proprietarul ar fi creat un dublat. Citirea numara: randurile
// adunate trebuie sa fie cat totalul (readAllPages), oricare ar fi limita.
//
// O CITIRE CARE ESUEAZA ARUNCA, nu da lista goala: eroarea ajunge la ecranul
// 500 din app/error.tsx, cu butonul de reincercare.
import type { createClient } from "@/lib/supabase/server";
import { dedupeById, readAllPages } from "./id-list";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const CLIENT_OPTIONS_READ_FAILED = "Nu am putut citi clienții. Încercați din nou.";

export async function readActiveClientOptions(
  supabase: Supabase,
  opts: { buyersOnly?: boolean } = {},
): Promise<
  { id: string; name: string; phone?: string | null; fiscal_code?: string | null; isLead?: boolean }[]
> {
  type Row = {
    id: string;
    name: string;
    phone: string | null;
    fiscal_code: string | null;
    stage: string | null;
  };
  let rows: Row[];
  try {
    rows = await readAllPages<Row>("clientii activi", (from, to) =>
      // P3-196 citea aici, pentru cumparatori, doar etapa 'client': "Leadurile stau
      // in aceeasi tabela si nu se vand (P3-177, acceptanta c)". P3-262, decizia
      // proprietarului din 2026-10-10: cumparatorul de la tejghea poate fi si un
      // lead, marcat "Lead", si devine Client la salvarea bonului (migratia 0081).
      // Etapa se citeste ca lista cumparatorilor sa poata marca leadurile.
      supabase
        .from("clients")
        .select("id, name, phone, fiscal_code, stage", { count: "exact" })
        .eq("active", true)
        .order("name")
        .order("id")
        .range(from, to),
    );
  } catch {
    throw new Error(CLIENT_OPTIONS_READ_FAILED);
  }
  return dedupeById(rows)
    .map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      fiscal_code: r.fiscal_code,
      ...(opts.buyersOnly ? { isLead: r.stage !== "client" } : {}),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ro"));
}
