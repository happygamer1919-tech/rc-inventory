// Clientii activi pentru selectoare (filtrul de proiecte, formularul de proiect,
// cumparatorul de la iesiri, sarcini, facturare), cititi pe pagini.
//
// PostgREST taie un raspuns la 1000 de randuri, iar leadurile stau in aceeasi
// tabela, deci un import poate trece usor peste prag. Fara pagini lipsea, fara
// niciun mesaj, o parte din clienti, iar proprietarul ar fi creat un dublat.
//
// O CITIRE CARE ESUEAZA ARUNCA, nu da lista goala: eroarea ajunge la ecranul
// 500 din app/error.tsx, cu butonul de reincercare.
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const CLIENT_OPTIONS_PAGE = 1000;
export const CLIENT_OPTIONS_READ_FAILED = "Nu am putut citi clienții. Încercați din nou.";

export async function readActiveClientOptions(
  supabase: Supabase,
): Promise<{ id: string; name: string; phone?: string | null; fiscal_code?: string | null }[]> {
  const rows: { id: string; name: string; phone?: string | null; fiscal_code?: string | null }[] = [];
  for (let from = 0; ; from += CLIENT_OPTIONS_PAGE) {
    const { data, error } = await supabase
      .from("clients")
      .select("id, name, phone, fiscal_code")
      .eq("active", true)
      .eq("stage", "client")
      .order("name")
      .order("id")
      .range(from, from + CLIENT_OPTIONS_PAGE - 1);
    if (error || !data) throw new Error(CLIENT_OPTIONS_READ_FAILED);
    for (const r of data)
      rows.push({
        id: r.id as string,
        name: r.name as string,
        phone: r.phone as string | null,
        fiscal_code: r.fiscal_code as string | null,
      });
    if (data.length < CLIENT_OPTIONS_PAGE) break;
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name, "ro"));
}
