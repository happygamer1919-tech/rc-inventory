import "server-only";

// Ecranul Azi, cardul P3-91, goal G46.
//
// O SINGURA LISTA CU TOTI CEI DE SUNAT AZI SAU INTARZIATI, leaduri si clienti la un
// loc. Nu este a doua lista de clienti: randurile vin prin aceeasi functie ca
// /clienti, search_clients_next_action (0058), altfel search_clients_by_stage
// (0040, 0057), fara vedere si fara etapa, deci fiecare client activ. Ce este "de
// facut azi" se hotaraste aici, in aplicatie, fiindca functia nu stie sa filtreze
// dupa zi si o functie noua ar fi o migratie.
//
// SE CITESC TOATE PAGINILE, prin readAllPages, nu pagina de 25 a listei: Azi nu
// are pagini si trebuie sa vada fiecare rand ca sa gaseasca randurile datorate.
// Cateva sute de clienti activi sunt o pagina sau doua de cate 500.
//
// CARE ZI CONTEAZA. Data urmatorului pas (G44), cand exista, fiindca este cea mai
// noua promisiune. Fara ea, data de reluare, NUMAI la etapa De reluat: aceeasi
// regula ca `overdue` din 0057, o data ramasa pe un lead mutat mai departe nu mai
// este o promisiune. Ambele sunt zile calendaristice si se compara ca sir cu
// chisinauToday().
//
// DE RELUAT FARA PAS, DUPA "AM SUNAT". Am sunat sterge pasul prin addClientNote,
// care nu scrie niciodata follow_up_date (acela ramane al lui set_client_stage).
// Fara regula de mai jos, un lead De reluat ar cadea inapoi pe data de reluare si
// ar ramane pe lista dupa apel. Regula: un rand adus DOAR de data de reluare iese
// de pe lista cand exista o nota scrisa in ziua aceea sau dupa ea, in Chisinau.
// Apelul este inregistrat; urmatoarea data de reluare o pune omul, din Modifică.
//
// FISIER SEPARAT, ca client-notes.ts: un fisier pe grija.

import { createClient } from "@/lib/supabase/server";
import { hasClientLeaduri, hasClientNextAction, hasClientNotes } from "./schema-capability";
import { inBatches, readAllPages } from "./id-list";
import { chisinauDateOf, chisinauToday } from "./format";
import { isClientStage, type AziRow } from "./clients-types";

type ListRow = {
  id: string;
  name: string;
  phone: string | null;
  stage?: string;
  follow_up_date?: string | null;
  next_action_at?: string | null;
  next_action?: string | null;
  total_count: number | string;
};

export type AziList = {
  rows: AziRow[];
  /** Daca Am sunat poate sterge pasul, adica 0058 exista. */
  nextActionAvailable: boolean;
};

/** Fiecare lead si client activ de sunat azi sau intarziat, intarziatii primii. */
export async function getAziList(): Promise<AziList> {
  const supabase = await createClient();

  // Inainte de 0040 nu exista nici etapa, nici data de reluare: nimic de aratat.
  if (!(await hasClientLeaduri(supabase))) return { rows: [], nextActionAvailable: false };
  const withNextAction = await hasClientNextAction(supabase);

  const all = await readAllPages<ListRow>("clienții pentru Azi", async (from, to) => {
    const { data, error } = await supabase.rpc(
      withNextAction ? "search_clients_next_action" : "search_clients_by_stage",
      {
        p_q: "",
        p_type: null,
        p_status: "active",
        p_view: null,
        p_stage: null,
        p_limit: to - from + 1,
        p_offset: from,
      },
    );
    const rows = (data ?? []) as ListRow[];
    // Totalul vine pe fiecare rand, din aceeasi cerere. O pagina goala spune zero.
    return {
      data: rows,
      count: error ? null : rows.length > 0 ? Number(rows[0]!.total_count) : 0,
      error,
    };
  });

  const today = chisinauToday();
  const due: AziRow[] = [];
  for (const r of all) {
    const stage = isClientStage(r.stage) ? r.stage : null;
    const nextActionAt = withNextAction ? (r.next_action_at ?? null) : null;
    let dueDate: string | null = null;
    let dueFrom: AziRow["dueFrom"] = "next_action";
    if (nextActionAt !== null) {
      if (nextActionAt <= today) dueDate = nextActionAt;
    } else if (stage === "follow_up" && r.follow_up_date && r.follow_up_date <= today) {
      dueDate = r.follow_up_date;
      dueFrom = "follow_up";
    }
    if (dueDate === null) continue;
    due.push({
      id: r.id,
      name: r.name,
      phone: r.phone?.trim() || null,
      stage,
      dueDate,
      dueFrom,
      overdue: dueDate < today,
      nextAction: withNextAction ? r.next_action?.trim() || null : null,
      ownerId: null,
    });
  }

  const ids = due.map((r) => r.id);
  const called = await calledSince(supabase, due.filter((r) => r.dueFrom === "follow_up"));
  const owners = await ownersOf(supabase, ids);

  return {
    rows: due
      .filter((r) => !called.has(r.id))
      .map((r) => ({ ...r, ownerId: owners.get(r.id) ?? null }))
      // Cea mai veche zi prima, deci intarziatii inaintea celor de azi; la aceeasi zi,
      // dupa nume, ca in lista de clienti.
      .sort((a, b) =>
        a.dueDate === b.dueDate ? a.name.localeCompare(b.name, "ro") : a.dueDate < b.dueDate ? -1 : 1,
      ),
    nextActionAvailable: withNextAction,
  };
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Randurile aduse de data de reluare pentru care exista o nota scrisa in ziua
 *  aceea sau dupa ea, in Chisinau. Gol inainte de 0059. */
async function calledSince(supabase: Supabase, rows: AziRow[]): Promise<Set<string>> {
  const called = new Set<string>();
  if (rows.length === 0 || !(await hasClientNotes(supabase))) return called;

  const dueById = new Map(rows.map((r) => [r.id, r.dueDate]));
  // O zi inainte de cea mai veche data, in UTC: ziua din Chisinau incepe cu doua
  // sau trei ore inaintea celei din UTC. Filtrul doar micsoreaza citirea; ziua se
  // hotaraste mai jos, pe fiecare nota.
  const oldest = rows.reduce((min, r) => (r.dueDate < min ? r.dueDate : min), rows[0]!.dueDate);
  const [y, m, d] = oldest.split("-").map(Number);
  const since = new Date(Date.UTC(y!, m! - 1, d! - 1)).toISOString();

  for (const batch of inBatches([...dueById.keys()])) {
    const notes = await readAllPages<{ client_id: string; created_at: string }>(
      "notele pentru Azi",
      (from, to) =>
        supabase
          .from("client_notes")
          .select("client_id, created_at", { count: "exact" })
          .in("client_id", batch)
          .gte("created_at", since)
          .order("created_at")
          .order("id")
          .range(from, to),
    );
    for (const n of notes) {
      const dueDate = dueById.get(n.client_id);
      if (dueDate !== undefined && chisinauDateOf(n.created_at) >= dueDate) called.add(n.client_id);
    }
  }
  return called;
}

/** Responsabilul fiecarui rand, pentru filtru. Functia listei nu il intoarce. */
async function ownersOf(supabase: Supabase, ids: string[]): Promise<Map<string, string | null>> {
  const owners = new Map<string, string | null>();
  for (const batch of inBatches(ids)) {
    const { data, error } = await supabase.from("clients").select("id, owner_id").in("id", batch);
    if (error) throw new Error(`Nu s-au putut citi responsabilii: ${error.message}`);
    for (const r of (data ?? []) as { id: string; owner_id: string | null }[]) owners.set(r.id, r.owner_id);
  }
  return owners;
}
