// P3-306. PERSOANA DE CONTACT A RANDURILOR EXPORTATE, CITITA PE PAGINI.
//
// DEFECTUL DE PANA ACUM. Exportul citea contactele a 100 de clienti pe cerere, fara
// `.range`. PostgREST taie orice raspuns la `max_rows` (1000 pe stiva locala) si nu
// spune: un lot de 100 de clienti cu cate 11 persoane de contact pierdea ultimele
// randuri, iar acei clienti ieseau in fisier fara nume de contact, fara niciun semn.
//
// Fiecare lot de id-uri trece acum prin `readAllPages`, care numara: randurile adunate
// trebuie sa fie cat totalul cerut in aceeasi cerere, oricare ar fi limita serverului.
// O citire care nu se potriveste este o eroare vizibila, nu un fisier mai scurt.
import type { createClient } from "@/lib/supabase/server";
import { inBatches, readAllPages, type CountedPage, type IdsFetcher } from "./id-list";

type Supabase = Awaited<ReturnType<typeof createClient>>;

type ContactRow = { id: string; client_id: string; name: string; is_primary: boolean };

/**
 * Numele persoanei de contact pentru fiecare client din `clientIds`: cea principala,
 * altfel prima adaugata. Importul creeaza persoana principala, deci asta este ce se
 * intoarce la reimport. Un client fara contact activ nu apare in rezultat.
 *
 * Arunca, cu textul citirii, daca o pagina esueaza sau o lista nu se poate numara.
 */
export async function readContactNames(
  supabase: Supabase,
  clientIds: readonly string[],
): Promise<Map<string, string>> {
  const contactOf = new Map<string, { name: string; primary: boolean }>();

  for (const part of inBatches(clientIds)) {
    // Ordinea este stabila (data adaugarii, apoi id), ca paginile sa se lege.
    const pageOf = (select: string) => (from: number, to: number) =>
      supabase
        .from("contacts")
        .select(select, { count: "exact" })
        .in("client_id", part)
        .eq("active", true)
        .order("created_at", { ascending: true })
        .order("id")
        .range(from, to);

    const contacts = await readAllPages<ContactRow>(
      "persoanele de contact",
      pageOf("id, client_id, name, is_primary") as unknown as (
        from: number,
        to: number,
      ) => PromiseLike<CountedPage<ContactRow>>,
      undefined,
      undefined,
      pageOf("id") as unknown as IdsFetcher,
    );

    for (const c of contacts) {
      const had = contactOf.get(c.client_id);
      if (!had || (c.is_primary && !had.primary)) {
        contactOf.set(c.client_id, { name: c.name, primary: c.is_primary });
      }
    }
  }

  return new Map([...contactOf].map(([id, c]) => [id, c.name]));
}
