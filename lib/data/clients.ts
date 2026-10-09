import "server-only";

// Citirile clientilor, cardul P3-06.
//
// CAUTAREA SI FILTRAREA SE FAC PE SERVER, nu in browser. Un ecran care aduce
// toata tabela si o filtreaza in memorie merge perfect pana in ziua in care nu
// mai merge, si ziua aceea vine fara sa anunte. Paginarea la 25 din P3-06 ar fi
// oricum o minciuna daca randurile ar fi deja toate aduse.
//
// P3-45. LEADURI ESTE O VEDERE A ACESTEI LISTE, NU O A DOUA LISTA. Vederea Leaduri
// si vederea Clienți trec prin aceeasi functie de aici, listClients, cu un
// parametru in plus. O a doua functie de date pentru leaduri ar fi exact deriva pe
// care cardul o numeste: doua ecrane care citesc clientii prin doua interogari si
// care, intr-o zi, nu mai sunt de acord asupra unui rand.

import { createClient } from "@/lib/supabase/server";
import { readOwnerProfiles } from "./import-clients-read";
import { hasClientLeaduri, hasClientNextAction, hasClientStage } from "./schema-capability";
import {
  CLIENTS_PAGE_SIZE,
  CLIENT_STAGES,
  isClientSource,
  isClientStage,
  isClientType,
  isClientView,
  type ClientDetail,
  type ClientListQuery,
  type ClientOwnerChoice,
  type ClientRow,
  type ClientStageCounts,
} from "./clients-types";

/** Ce a cerut ecranul, si cate randuri exista in total pentru acele filtre. */
export type ClientListResult = {
  rows: ClientRow[];
  total: number;
  page: number;
  pageCount: number;
  /** P3-89. Daca randurile poarta urmatorul pas, adica 0058 exista. */
  nextActionAvailable: boolean;
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
  vedere?: string;
  etapa?: string;
}): ClientListQuery {
  const page = Number(params.pagina);

  const asked = isClientView(params.vedere) ? params.vedere : "";

  // P3-112, goal G68. VEDEREA INACTIVI ESTE EA INSASI FILTRUL DE STARE, si de aceea
  // se citeste INAINTE de regula etapei de mai jos. Ea arata fiecare rand dezactivat,
  // lead si client deopotriva, deci `stare` este intotdeauna `inactive` si `etapa`
  // nu inseamna nimic acolo: o etapa aleasa ar rupe vederea in doua si ar readuce
  // exact ascunderea pe care cardul o scoate. Ecranul nici nu ofera cipurile acolo.
  //
  // O LEGATURA VECHE CARE POARTA SI `stare=active` NU POATE GOLI VEDEREA. Starea nu
  // se citeste din URL cand vederea o hotaraste, deci /clienti?vedere=inactivi&stare=active
  // arata tot cei dezactivati, si nu o lista goala care ar arata ca un defect.
  const inactivi = asked === "inactivi";

  // P3-45. ETAPA HOTARASTE VEDEREA. O etapa de lead se afla in Leaduri, iar
  // `client` in Clienți, deci o legatura care poarta doar `etapa` ajunge in
  // vederea potrivita in loc sa arate o combinatie imposibila, cum ar fi etapa
  // `client` in vederea Leaduri, care ar fi mereu goala.
  const stage = inactivi ? "" : isClientStage(params.etapa) ? params.etapa : "";
  const view = inactivi
    ? "inactivi"
    : stage === ""
      ? asked
      : stage === "client"
        ? "clienti"
        : "leaduri";

  return {
    q: (params.q ?? "").trim(),
    type: isClientType(params.tip) ? params.tip : "",
    status: inactivi
      ? "inactive"
      : params.stare === "inactive" || params.stare === "toate"
        ? params.stare
        : "active",
    page: Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1,
    view,
    stage,
  };
}

type SearchRow = {
  id: string;
  name: string;
  type: string;
  phone: string | null;
  active: boolean;
  active_projects: number | string;
  total_count: number | string;
  stage?: string;
  follow_up_date?: string | null;
  overdue?: boolean;
  next_action_at?: string | null;
  next_action?: string | null;
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * CITIREA UNICA A LISTEI: argumentele si cele trei cai (0058, 0040, 0020) sunt scrise
 * AICI, o data, iar ecranul (o pagina de 25) si exportul de leaduri (P3-126, pagini de
 * pana la 1000) trec amandoua prin ea. Asa fisierul si ecranul nu pot ajunge sa inteleaga
 * diferit un filtru: nu exista o a doua interogare si nici o a doua functie in baza.
 */
async function searchClientRows(
  supabase: SupabaseClient,
  query: ClientListQuery,
  limit: number,
  offset: number,
): Promise<{ rows: SearchRow[]; withLeaduri: boolean; withNextAction: boolean }> {
  const common = {
    p_q: query.q,
    p_type: query.type === "" ? null : query.type,
    p_status: query.status,
    p_limit: limit,
    p_offset: offset,
  };

  const withLeaduri = await hasClientLeaduri(supabase);
  const withNextAction = withLeaduri && (await hasClientNextAction(supabase));
  // P3-112. INACTIVI TRIMITE p_view NULL, EXPLICIT. Vederea aceea arata fiecare
  // rand dezactivat, lead si client, adica exact ce inseamna "fara vedere" pentru
  // functia din 0040; comentariul ei spune ca orice alta valoare decat leaduri sau
  // clienti este "every row by name", deci "inactivi" ar merge si nescris. Se scrie
  // oricum, fiindca o vedere care functioneaza pentru ca un token nu este recunoscut
  // este o vedere pe care urmatoarea versiune a functiei o poate strica in tacere.
  // Starea, `inactive`, este cea care alege randurile, si ea vine din `common`.
  const staged = {
    ...common,
    p_view: query.view === "" || query.view === "inactivi" ? null : query.view,
    p_stage: query.stage === "" ? null : query.stage,
  };
  const { data, error } = withNextAction
    ? await supabase.rpc("search_clients_next_action", staged)
    : withLeaduri
      ? await supabase.rpc("search_clients_by_stage", staged)
      : await supabase.rpc("search_clients", common);

  if (error) throw new Error(`Nu s-au putut citi clienții: ${error.message}`);

  return { rows: (data ?? []) as SearchRow[], withLeaduri, withNextAction };
}

/**
 * P3-126. TOATE RANDURILE FILTRULUI, nu pagina vizibila, pana la `max`, pentru export.
 *
 * ACELASI FILTRU, ACEEASI CITIRE: pagini de 1000 prin `searchClientRows`, adica prin
 * aceleasi functii din baza ca lista. Paginile sunt de 1000 fiindca PostgREST taie un
 * raspuns la `max_rows` (1000 in supabase/config.toml); o singura cerere de 5000 ar
 * intoarce in tacere numai 1000. Ordinea este a listei.
 */
export async function listClientRowsForExport(
  query: ClientListQuery,
  max: number,
): Promise<{ rows: SearchRow[]; total: number; withLeaduri: boolean; withNextAction: boolean }> {
  const supabase = await createClient();
  const PAGE = 1000;

  const rows: SearchRow[] = [];
  let total = 0;
  let withLeaduri = false;
  let withNextAction = false;

  while (rows.length < max) {
    const got = await searchClientRows(supabase, query, Math.min(PAGE, max - rows.length), rows.length);
    withLeaduri = got.withLeaduri;
    withNextAction = got.withNextAction;
    if (got.rows.length === 0) break;
    total = Number(got.rows[0]!.total_count);
    rows.push(...got.rows);
    if (rows.length >= total) break;
  }

  return { rows, total, withLeaduri, withNextAction };
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
 *
 * P3-45. DOUA CAI, O SINGURA FUNCTIE. Cand migratia 0040 exista, lista trece prin
 * public.search_clients_by_stage, care stie vederile, etapa si ordinea dupa data
 * de reluare. Pana atunci trece prin public.search_clients din 0020, exact ca
 * inainte de card, iar vederea si etapa sunt ignorate: ecranul nici nu le ofera.
 *
 * P3-89. A TREIA CALE, ACEEASI FUNCTIE. Cand migratia 0058 exista, lista trece prin
 * public.search_clients_next_action: aceleasi sapte argumente si aceleasi randuri
 * ca search_clients_by_stage, plus urmatorul pas, iar Leaduri se ordoneaza dupa
 * data urmatorului pas, altfel dupa data de reluare. Pana atunci, calea din 0040.
 */
export async function listClients(query: ClientListQuery): Promise<ClientListResult> {
  const supabase = await createClient();

  const { rows, withLeaduri, withNextAction } = await searchClientRows(
    supabase,
    query,
    CLIENTS_PAGE_SIZE,
    (query.page - 1) * CLIENTS_PAGE_SIZE,
  );


  // P3-48. INTERESUL SE CITESTE PENTRU RANDURILE PAGINII, printr-un select simplu
  // pe aceleasi id-uri, si numai in vederea Leaduri, singura care il arata.
  // search_clients_by_stage nu il intoarce, iar schimbarea functiei ar fi o
  // migratie, pe care cardul nu o are. Cel mult o pagina de id-uri, o cerere.
  const interestById = new Map<string, string | null>();
  if (withLeaduri && query.view === "leaduri" && rows.length > 0) {
    const { data: extra, error: extraError } = await supabase
      .from("clients")
      .select("id, interest")
      .in("id", rows.map((r) => r.id));
    if (extraError) throw new Error(`Nu s-au putut citi clienții: ${extraError.message}`);
    for (const r of (extra ?? []) as { id: string; interest: string | null }[]) {
      interestById.set(r.id, r.interest);
    }
  }

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
      stage: isClientStage(r.stage) ? r.stage : null,
      followUpDate: r.follow_up_date ?? null,
      overdue: r.overdue === true,
      interest: interestById.get(r.id) ?? null,
      nextActionAt: withNextAction ? (r.next_action_at ?? null) : null,
      nextAction: withNextAction ? (r.next_action ?? null) : null,
    })),
    total,
    page: query.page,
    pageCount: Math.max(1, Math.ceil(total / CLIENTS_PAGE_SIZE)),
    nextActionAvailable: withNextAction,
  };
}

/**
 * P3-45. Cati clienti sunt la fiecare etapa, sub aceeasi cautare, acelasi tip si
 * aceeasi stare ca lista, dar NU sub vederea sau etapa aleasa: numarul de langa un
 * cip spune cate randuri ar arata acel cip.
 *
 * Null cand migratia 0040 nu exista inca. Ecranul citeste null ca "nu arata
 * vederile", nu ca zero.
 */
export async function countClientsByStage(query: ClientListQuery): Promise<ClientStageCounts | null> {
  const supabase = await createClient();
  if (!(await hasClientLeaduri(supabase))) return null;

  const { data, error } = await supabase.rpc("client_stage_counts", {
    p_q: query.q,
    p_type: query.type === "" ? null : query.type,
    p_status: query.status,
  });
  if (error) throw new Error(`Nu s-au putut număra clienții pe etape: ${error.message}`);

  // FIECARE ETAPA ARE UN NUMAR, zero inclus. Functia le intoarce pe toate cinci;
  // pornirea de la zero aici este plasa pentru o etapa care ar lipsi din raspuns.
  const counts = Object.fromEntries(CLIENT_STAGES.map((s) => [s, 0])) as ClientStageCounts;
  for (const r of (data ?? []) as { stage: string; total: number | string }[]) {
    if (isClientStage(r.stage)) counts[r.stage] = Number(r.total) || 0;
  }
  return counts;
}

/**
 * P3-112, goal G68. CATI SUNT DEZACTIVATI, pentru numarul de pe vederea Inactivi.
 *
 * ACEEASI FUNCTIE DE BAZA, ALTA STARE. Trece prin public.client_stage_counts din
 * 0040, cu `p_status` fixat pe `inactive`, si adună toate cele cinci etape: un rand
 * dezactivat este dezactivat fie ca este lead, fie ca este client, si vederea le
 * arata pe toate intr-o singura lista. O a doua interogare a clientilor, scrisa
 * numai pentru numarul acesta, ar fi exact deriva pe care P3-45 o interzice.
 *
 * SUB ACEEASI CAUTARE SI ACELASI TIP CA LISTA, si nu sub starea listei: de aceea
 * numarul de langa Inactivi spune cate randuri arata Inactivi chiar si privit din
 * vederea Leaduri, unde starea listei este `active`. Este aceeasi regula pe care
 * 0040 o scrie pentru cipurile de etapa, aplicata acestei vederi.
 *
 * Null cand migratia 0040 nu exista inca, exact ca countClientsByStage: ecranul
 * citeste null ca "nu arata vederile", nu ca zero.
 */
export async function countInactiveClients(query: ClientListQuery): Promise<number | null> {
  const supabase = await createClient();
  if (!(await hasClientLeaduri(supabase))) return null;

  const { data, error } = await supabase.rpc("client_stage_counts", {
    p_q: query.q,
    p_type: query.type === "" ? null : query.type,
    p_status: "inactive",
  });
  if (error) throw new Error(`Nu s-au putut număra clienții dezactivați: ${error.message}`);

  let total = 0;
  for (const r of (data ?? []) as { stage: string; total: number | string }[]) {
    total += Number(r.total) || 0;
  }
  return total;
}

/**
 * P3-45. Cine poate primi un lead: profilurile active, dupa numele complet.
 *
 * Politica de select de pe profiles (0001) arata toate randurile doar
 * administratorului, si doar administratorul poate crea clienti. Pentru oricine
 * altcineva lista ar avea un singur rand, al lui, deci ecranul nici nu o cere.
 * Un profil fara nume complet se arata prin email, ca optiunea sa nu fie goala.
 */
export async function listClientOwnerChoices(): Promise<ClientOwnerChoice[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("active", true);
  if (error || !data) return [];

  return (data as { id: string; full_name: string | null; email: string | null }[])
    .map((p) => ({ id: p.id, fullName: ownerDisplayName(p) }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "ro"));
}

/** Ca listClientOwnerChoices, dar o citire esuata arunca ImportReadError in loc de
 *  lista goala. Pentru importuri, unde lista goala ar face din fiecare responsabil
 *  din fisier "nu este in echipa". */
export async function readClientOwnerChoices(): Promise<ClientOwnerChoice[]> {
  const profiles = await readOwnerProfiles(await createClient());
  return profiles
    .map((p) => ({ id: p.id, fullName: ownerDisplayName(p) }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "ro"));
}

/** P3-48. Cum se arata un responsabil, o singura data: numele complet, altfel
 *  emailul. Lista de responsabili si fisa clientului il citesc amandoua de aici.
 *  P3-90: si autorii de pe fila Note, deci este exportat. */
export function ownerDisplayName(p: { full_name: string | null; email: string | null }): string {
  return p.full_name?.trim() || p.email?.trim() || "Fără nume";
}

const CLIENT_COLUMNS = "id, name, type, fiscal_code, address, phone, email, notes, active, created_at";

/** Un client, pentru ruta de detaliu. Null cand id-ul nu exista. */
export async function getClient(id: string): Promise<ClientDetail | null> {
  const supabase = await createClient();

  // P3-43. ETAPA SE CERE NUMAI DACA EXISTA COLOANA. Functia aceasta inghite
  // eroarea si intoarce null, deci un `select` care ar numi `stage` inainte ca
  // 0039 sa fie aplicata ar face din fiecare fisa de client un 404, iar din
  // filtrul de client de pe /comenzi un filtru care dispare. Poarta intreaba
  // intai, pe aceeasi legatura.
  const withStage = await hasClientStage(supabase);
  // P3-48. Sursa, interesul si responsabilul, din 0040, sub poarta lor, din acelasi
  // motiv: un select care le numeste pe o baza fara ele ar face fisa un 404.
  const withLeaduri = await hasClientLeaduri(supabase);
  // P3-89. Urmatorul pas, din 0058, sub poarta lui, din acelasi motiv.
  const withNextAction = await hasClientNextAction(supabase);
  let columns: string = withStage ? `${CLIENT_COLUMNS}, stage, follow_up_date` : CLIENT_COLUMNS;
  if (withLeaduri) columns = `${columns}, source, interest, owner_id`;
  if (withNextAction) columns = `${columns}, next_action_at, next_action`;

  const { data } = await supabase.from("clients").select(columns).eq("id", id).maybeSingle();

  if (!data) return null;
  const row = data as unknown as Record<string, unknown>;

  // P3-48. RESPONSABILUL SE ARATA CA NUME, NICIODATA CA ID. Se citeste profilul
  // acestui responsabil si nu lista de responsabili: lista are numai profilurile
  // active, iar un om dezactivat ramane responsabilul clientilor lui. Pentru un
  // manager de cont, profiles_select din 0001 nu arata profilul altcuiva, deci
  // numele ramane null si ecranul spune asta in cuvinte.
  const ownerId = withLeaduri ? ((row.owner_id as string | null) ?? null) : null;
  let ownerName: string | null = null;
  if (ownerId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", ownerId)
      .maybeSingle();
    if (profile) ownerName = ownerDisplayName(profile as { full_name: string | null; email: string | null });
  }

  return {
    id: row.id as string,
    name: row.name as string,
    type: isClientType(row.type) ? row.type : "company",
    fiscalCode: (row.fiscal_code as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    active: Boolean(row.active),
    createdAt: row.created_at as string,
    stage: withStage && isClientStage(row.stage) ? row.stage : null,
    followUpDate: withStage ? ((row.follow_up_date as string | null) ?? null) : null,
    leaduriAvailable: withLeaduri,
    source: withLeaduri && isClientSource(row.source) ? row.source : null,
    interest: withLeaduri ? ((row.interest as string | null) ?? null) : null,
    ownerId,
    ownerName,
    nextActionAvailable: withNextAction,
    nextActionAt: withNextAction ? ((row.next_action_at as string | null) ?? null) : null,
    nextAction: withNextAction ? ((row.next_action as string | null) ?? null) : null,
  };
}
