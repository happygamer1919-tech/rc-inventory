import "server-only";

// Citirile iesirilor catre proiecte.
//
// Iesire catre santier, nu vanzare cu amanuntul: client, proiect, si materialele
// care pleaca acolo. Regula este a fazei 1 si nu se schimba.

import { createClient } from "@/lib/supabase/server";
import { dedupeById, ID_LIST_BATCH_SIZE, readAllPages, type CountedPage } from "./id-list";
import { clampPage, LIST_PAGE_SIZE } from "./list-paging";
import { readIssuePage, type IssueClient } from "./outbound-page-read";
import { hasOutboundIssueMode } from "./schema-capability";
import { isUnitCode, type UnitCode } from "./units";
import type { StatusEvent } from "./inbound-types";
import type { OutboundIssue, OutboundMode, OutboundStatus } from "./outbound-types";
import { one } from "./row";

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// project_id si relatia catre projects sunt adaugate de migratia 0017. Cat timp
// ea nu este aplicata, coloana nu exista, un select care o numeste intoarce
// 42703 si ecranul de comenzi cade cu 500, ceea ce s-a si intamplat pe
// 2026-08-31. Se cere doar ce exista.
// P3-04b: ONE SELECT LIST, because there is no longer a schema in which the old
// one would work. SELECT_BASE named client_name and project_name, which 0026
// drops, and it was only ever reached when hasPhase3Schema() said no. The wave 1
// migrations are applied, so that branch is unreachable AND unsafe: a select
// naming a dropped column returns 42703 and the screen answers 500, which is
// exactly the INC-05 shape.
const SELECT_ISSUE = `
  id, reference, issued_at, shipped_at, status,
  project_id,
  projects ( id, name, client_id, clients ( id, name ) ),
  outbound_lines (
    id, product_id, quantity, sale_price_mdl, created_at,
    products ( sku, name, unit )
  )
`;

// P3-120, hotararea R-215. A DOUA LISTA DE SELECT, SI NUMAI ATAT O DEOSEBESTE DE
// CEA DE DEASUPRA: cele trei coloane ale migratiei 0067 si clientul propriu al
// iesirii.
//
// DE CE DOUA LISTE SI NU UNA. Cat timp 0067 este in registrul de asteptare de la
// docs/migrations/APPLY-LOG.md, coloanele nu exista pe baza catre care arata
// aplicatia, iar un select care le numeste primeste 42703 de la PostgREST si
// ecranul de comenzi raspunde 500. Aceea este chiar forma incidentului INC-05 din
// 2026-08-31, scrisa pe larg in antetul lui lib/data/schema-capability.ts, si ea
// este motivul pentru care poarta nu este optionala.
//
// `clients!outbound_issues_client_id_fkey` SI NU `clients`, CU NUMELE RESTRICTIEI
// SCRIS. De la 0067 incoace exista un drum DIRECT de la outbound_issues la
// clients, prin coloana client_id, pe langa cel care trece prin projects. Doua
// drumuri intre aceleasi doua tabele sunt tocmai situatia in care PostgREST
// raspunde cu o eroare de relatie ambigua in loc de randuri. Indicatia este
// numele pe care PostgreSQL il da singur unei restrictii scrise inline,
// `<tabela>_<coloana>_fkey`, si migratia 0067 o scrie chiar inline:
// `client_id uuid references public.clients (id) on delete restrict`.
//
// `direct_client:` este un ALIAS si nu un token stocat: fara el cheia randului ar
// fi tot `clients`, adica aceeasi cu cea din projects, iar tipul randului ar
// deveni greu de citit. Niciun token englezesc nu ajunge pe ecran din el.
const SELECT_ISSUE_WITH_MODE = `
  id, reference, issued_at, shipped_at, status,
  project_id, issue_mode, pickup_date,
  projects ( id, name, client_id, clients ( id, name ) ),
  direct_client:clients!outbound_issues_client_id_fkey ( id, name ),
  outbound_lines (
    id, product_id, quantity, sale_price_mdl, created_at,
    products ( sku, name, unit )
  )
`;

type Probe = Parameters<typeof hasOutboundIssueMode>[0];

async function issueSelect(supabase: Probe): Promise<string> {
  return (await hasOutboundIssueMode(supabase)) ? SELECT_ISSUE_WITH_MODE : SELECT_ISSUE;
}

/**
 * P3-120, DECIZIA B A INSTRUCTIUNII. Al doilea fel de iesire exista pe baza catre
 * care arata aplicatia?
 *
 * ECRANELE O INTREABA PE EA SI NU CITESC MODUL DE PE UN RAND. Cat timp raspunsul
 * este "nu", niciun cuvant de mod nu apare pe liste, nu apare controlul de filtrare
 * si nu apare nicio data de ridicare: obiceiul acestui proiect este ca ce nu se
 * poate folosi nu apare pe ecran, si aici este si adevarul gol, fiindca fara
 * coloanele migratiei 0067 nu poate exista nicio iesire catre client direct de
 * aratat.
 *
 * POARTA ESTE CHEMATA DE DOUA ORI PE O PAGINA SI ASTA NU COSTA UN AL DOILEA DRUM
 * LA BAZA: hasOutboundIssueMode isi tine minte raspunsul un minut, in
 * schema-capability.ts, si al doilea apel il citeste de acolo.
 */
export async function outboundModeVisible(): Promise<boolean> {
  const supabase = await createClient();
  return hasOutboundIssueMode(supabase);
}

/** Ordinea liniilor unei ieșiri, cerută explicit si identica pe fiecare ecran.
 *
 *  CARDUL P3-115, CONSTATAREA G13 a raportului
 *  docs/reports/2026-09-29-critic-bug-sweep-2.md. Constatarea este despre FACTURA facuta
 *  dintr-o ieșire, care isi re-sorta liniile alfabetic in timp ce comentariul de deasupra
 *  spunea altceva, si paguba pe care o numeste este ca "operatorul care compara avizul de
 *  ieșire cu factura citeste aceleasi linii in doua ordini". Jumatatea aceea nu se repara
 *  atingand numai factura: o resursa PostgREST incorporata FARA `order` nu promite nicio
 *  ordine, deci fisa ieșirii putea oricand sa se aseze altfel decat factura. Se cere
 *  aceeasi ordine in amandoua locurile, si asta este tot ce se schimba aici.
 *
 *  `created_at` APOI `id`, si nu ordinea in care au fost tastate, fiindca aceea nu este
 *  stocata: public.outbound_lines nu are o coloana de ordine, iar `created_at` este acelasi
 *  pe toate liniile unei ieșiri, care se scriu in aceeasi tranzacție. Ce se promite este ca
 *  ordinea este DETERMINISTA si ACEEASI pe ecrane, nu ca ea reface avizul. O coloana de
 *  ordine pe outbound_lines ar fi o migratie si un card al ei.
 *
 *  SE SCRIE LA FIECARE CITIRE si nu se ascunde intr-o functie ajutatoare: tipurile lui
 *  supabase-js poarta forma cererii prin fiecare apel, iar o functie care le-ar accepta pe
 *  toate ar trebui sa isi slabeasca tipul pana la punctul in care nu mai verifica nimic. */
const LINES_ORDER = { referencedTable: "outbound_lines", ascending: true } as const;

/** P3-136. Cate iesiri se cer intr-o pagina; PostgREST taie la 1000, deci o
 *  singura cerere ca pana acum cat tabelul incape, apoi pagini. */
const ISSUE_PAGE_SIZE = 1000;

type LineRow = {
  id: string;
  product_id: string;
  quantity: unknown;
  sale_price_mdl: unknown;
  products: { sku: string; name: string; unit: string } | null;
};

type IssueRow = {
  id: string;
  reference: string;
  issued_at: string;
  shipped_at: string | null;
  status: string;
  // P3-118: NULL PE O IESIRE CATRE CLIENT DIRECT. Coloana a fost NOT NULL de la
  // 0026 pana la migratia 0067, si tipul spunea `string`.
  project_id: string | null;
  // P3-120: OPTIONALE, fiindca lista de select care le numeste este cerută numai
  // cand poarta a raspuns da. Absente, nu nule: un rand citit cu lista veche nu
  // poarta deloc cheile acestea, si tipul spune asta.
  issue_mode?: string | null;
  pickup_date?: string | null;
  projects?:
    | { id: string; name: string; client_id: string; clients: { id: string; name: string } | { id: string; name: string }[] | null }
    | { id: string; name: string; client_id: string; clients: { id: string; name: string } | { id: string; name: string }[] | null }[]
    | null;
  /** Clientul PROPRIU al iesirii, al modului direct. Alt drum decat
   *  `projects.clients`, si pe o iesire catre client direct singurul care exista. */
  direct_client?: { id: string; name: string } | { id: string; name: string }[] | null;
  outbound_lines: LineRow[] | null;
};

/** Ce scrie coloana `issue_mode`, redus la uniune.
 *
 *  ORICE ALTCEVA DECAT "direct_client" ESTE "project", inclusiv absenta cheii cand
 *  poarta a raspuns nu, si asta nu este o ghicire: implicitul coloanei in migratia
 *  0067 este chiar 'project', iar restrictia outbound_issues_direct_client_mode_shape
 *  nu lasa un rand de mod direct sa existe fara client si fara data de ridicare. Un
 *  sir necunoscut citit ca "project" este randul pe care baza de date il descrie. */
function toMode(value: unknown): OutboundMode {
  return value === "direct_client" ? "direct_client" : "project";
}

/** Supabase tipizeaza o relatie ca obiect sau ca tablou dupa forma cheii
 *  straine, asa ca amandoua formele sunt acceptate in loc sa fie presupusa una. */
function toIssue(row: IssueRow, history: StatusEvent[] = []): OutboundIssue {
  const project = one(row.projects);
  const mode = toMode(row.issue_mode);

  // P3-120. CLIENTUL VINE DE PE DRUMUL MODULUI SI NU DE PE AMANDOUA. Pe o iesire
  // pe proiect clientul se citeste de pe proiect, cum il citeste de la P3-04b
  // incoace; pe o iesire catre client direct NU EXISTA PROIECT, prin
  // outbound_issues_direct_client_mode_shape, deci singurul client care exista este
  // cel pe care il numeste chiar coloana client_id a iesirii.
  const client = mode === "direct_client" ? one(row.direct_client ?? null) : one(project?.clients ?? null);

  return {
    id: row.id,
    reference: row.reference,
    mode,
    // P3-10: destinatia ca INREGISTRARE, ca sa se poata lega.
    //
    // P3-04b: THE NAMES COME FROM THE JOINED RECORDS AND NOWHERE ELSE. The text
    // columns are dropped, so there is no second representation left that could
    // disagree with the project.
    //
    // P3-04b ALSO SAID THIS, AND CARD P3-118 MAKES IT FALSE RATHER THAN DELETING
    // IT, per CLAUDE.md section 9c:
    //
    //   "project_id is NOT NULL as of 0026, so the join resolves for every row;
    //    the fallbacks below are for a project or client row deleted out from
    //    under an issue, which the foreign keys refuse anyway."
    //
    // IT IS TRUE OF A PROJECT ISSUE AND ONLY OF ONE. Since migration 0067 and
    // ruling R-215 an issue can be in mode direct_client, which HAS NO PROJECT
    // by outbound_issues_direct_client_mode_shape, so the join resolves to
    // nothing and the two fallbacks below are what such a row reads as today.
    // THAT IS A PLACEHOLDER AND NOT THE ANSWER: naming the direct client and
    // showing the mode is card P3-120, which reads the columns this card added.
    // P3-118 touches no screen, so the fallback is left visible rather than
    // half-fixed here, and P3-120 is where it stops being a placeholder.
    //
    // CARDUL P3-120 A FACUT-O, SI PROPOZITIA DE DEASUPRA ESTE PASTRATA ca sa se
    // citeasca ce a fost, sub secțiunea 9c din CLAUDE.md. "Client necunoscut" nu
    // se mai vede pe nicio iesire catre client direct: clientul se citeste acum de
    // pe coloana client_id a iesirii, cateva randuri mai sus. Cele doua rezerve
    // rămân pentru ce le-a chemat la viata, un rand istoric nereconciliat de P3-04,
    // si "Fără proiect" este adaugata pentru randul care prin restricție NU ARE
    // proiect: acolo "Proiect necunoscut" ar spune "nu se stie", care este o
    // minciuna, in loc de "nu exista", care este randul.
    projectId: row.project_id,
    clientId: client?.id ?? null,
    clientName: client?.name ?? "Client necunoscut",
    projectName:
      project?.name ?? (mode === "direct_client" ? "Fără proiect" : "Proiect necunoscut"),
    pickupDate: row.pickup_date ?? null,
    issuedAt: row.issued_at,
    shippedAt: row.shipped_at,
    status: (row.status as OutboundStatus) ?? "awaiting_shipment",
    lines: (row.outbound_lines ?? []).map((l) => ({
      id: l.id,
      productId: l.product_id,
      productSku: l.products?.sku ?? "-",
      productName: l.products?.name ?? "Produs necunoscut",
      unit: isUnitCode(l.products?.unit) ? (l.products!.unit as UnitCode) : "pcs",
      quantity: toNumber(l.quantity),
      salePriceMdl: toNullableNumber(l.sale_price_mdl),
    })),
    history,
  };
}

export async function listOutboundIssues(): Promise<OutboundIssue[]> {
  const supabase = await createClient();
  const select = await issueSelect(supabase);
  // P3-136. PE PAGINI, cu id ca departajare stabila: peste 1000 de iesiri, lista se
  // oprea tacut la 1000, iar paginile unei ordini fara departajare nu se leaga.
  const rows = await readAllPages<IssueRow>(
    "ieșirile",
    (from, to) =>
      supabase
        .from("outbound_issues")
        .select(select, { count: "exact" })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .order("created_at", LINES_ORDER)
        .order("id", LINES_ORDER)
        .range(from, to) as unknown as PromiseLike<CountedPage<IssueRow>>,
    ISSUE_PAGE_SIZE,
  );
  // Un rand mutat intre pagini vine de doua ori; ordinea citirii ramane.
  return dedupeById(rows).map((row) => toIssue(row));
}

/** P3-142. Filtrele listei de iesiri de pe Comenzi. Fiecare lipseste cand nu este pus. */
export type OutboundFilter = {
  /** /comenzi?proiect=<id>: iesirile unui proiect. */
  projectId?: string;
  /** /comenzi?client=<id>: iesirile unui client, pe proiect sau directe. */
  clientId?: string;
  /** Felul eliberarii. Se aplica numai cand 0067 este aplicata (poarta de mai jos). */
  mode?: OutboundMode;
};

export type OutboundPage = {
  issues: OutboundIssue[];
  /** Iesirile listei filtrate, nu ale paginii. */
  total: number;
  /** Din ele, cate sunt de expediat. Numarate in baza, nu pe pagina. */
  awaiting: number;
  page: number;
};

/**
 * P3-142. O PAGINA din lista de iesiri, cu filtrele puse in cerere, in aceeasi ordine ca
 * listOutboundIssues (cea mai noua intai, id ca departajare), cu totalul exact si numarul
 * celor de expediat. Cele 50 de iesiri vin cu liniile lor, intr-o singura cerere.
 *
 * listOutboundIssues ramane citirea intreaga, pentru tabloul de bord, necesar si ce mai
 * are nevoie de toate iesirile.
 */
export async function listOutboundIssuesPage(
  filter: OutboundFilter,
  page: number,
): Promise<OutboundPage> {
  const supabase = await createClient();
  const select = await issueSelect(supabase);
  const modeActive = await hasOutboundIssueMode(supabase);

  // Iesirile unui client: cele pe proiectele lui, plus (cand 0067 este aplicata) cele
  // catre el direct. Proiectele se afla intr-o cerere mica, iar `.in` are un prag de
  // lungime a adresei (ID_LIST_BATCH_SIZE); un client cu mai multe proiecte decat atat
  // trece pe citirea intreaga, ca inainte, in loc sa se piarda iesiri.
  let clientClause: string | null = null;
  if (filter.clientId) {
    const { data: projects, error } = await supabase
      .from("projects")
      .select("id")
      .eq("client_id", filter.clientId);
    if (error) throw new Error(`Nu s-au putut citi proiectele clientului: ${error.message}`);
    const ids = (projects ?? []).map((p) => p.id as string);
    if (ids.length > ID_LIST_BATCH_SIZE) return pageFromFullRead(filter, page);
    const parts: string[] = [];
    if (ids.length > 0) parts.push(`project_id.in.(${ids.join(",")})`);
    if (modeActive) parts.push(`client_id.eq.${filter.clientId}`);
    if (parts.length === 0) return { issues: [], total: 0, awaiting: 0, page: 1 };
    clientClause = parts.join(",");
  }

  const read = await readIssuePage<IssueRow>(
    supabase as unknown as IssueClient<IssueRow>,
    select,
    {
      projectId: filter.projectId,
      clientClause,
      // Felul eliberarii se filtreaza numai cand poarta a raspuns da (coloana exista).
      equals: modeActive && filter.mode ? [["issue_mode", filter.mode]] : [],
    },
    page,
    LINES_ORDER,
  );

  return {
    issues: read.rows.map((row) => toIssue(row)),
    total: read.total,
    awaiting: read.awaiting,
    page: read.page,
  };
}

/** Rezerva pentru un client cu prea multe proiecte ca sa le pui in adresa: citirea intreaga,
 *  aleasa dupa inregistrare (clientId), apoi taiata pe pagina. */
async function pageFromFullRead(filter: OutboundFilter, page: number): Promise<OutboundPage> {
  const all = (await listOutboundIssues()).filter(
    (o) =>
      (!filter.clientId || o.clientId === filter.clientId) &&
      (!filter.projectId || o.projectId === filter.projectId) &&
      (!filter.mode || o.mode === filter.mode),
  );
  const current = clampPage(page, all.length);
  const start = (current - 1) * LIST_PAGE_SIZE;
  return {
    issues: all.slice(start, start + LIST_PAGE_SIZE),
    total: all.length,
    awaiting: all.filter((o) => o.status === "awaiting_shipment").length,
    page: current,
  };
}

export async function getOutboundIssue(id: string): Promise<OutboundIssue | null> {
  const supabase = await createClient();
  // Lista de select se cere INAINTE de Promise.all: poarta este o citire si ea, iar
  // `await` intr-un argument al unei promisiuni deja pornite ar fi doua ordini de
  // executie scrise pe un rand.
  const select = await issueSelect(supabase);
  const [{ data, error }, { data: history }] = await Promise.all([
    supabase
      .from("outbound_issues")
      .select(select)
      .eq("id", id)
      .order("created_at", LINES_ORDER)
      .order("id", LINES_ORDER)
      .maybeSingle(),
    supabase
      .from("status_history")
      .select("id, from_status, to_status, note, created_at")
      .eq("entity_type", "outbound_issue")
      .eq("entity_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (error) throw new Error(`Nu s-a putut citi ieșirea: ${error.message}`);
  if (!data) return null;

  const events: StatusEvent[] = (history ?? []).map((h) => ({
    id: h.id as string,
    fromStatus: (h.from_status as string | null) ?? null,
    toStatus: h.to_status as string,
    note: (h.note as string | null) ?? null,
    at: h.created_at as string,
  }));

  return toIssue(data as unknown as IssueRow, events);
}

/** Urmatoarea referinta de iesire, in formatul din faza 1: IES-AAAA-NNNN. */
export async function nextOutboundReference(): Promise<string> {
  const supabase = await createClient();
  const year = new Date().getUTCFullYear();
  const prefix = `IES-${year}-`;

  const { data } = await supabase
    .from("outbound_issues")
    .select("reference")
    .like("reference", `${prefix}%`)
    .order("reference", { ascending: false })
    .limit(1);

  const last = data?.[0]?.reference as string | undefined;
  const n = last ? Number(last.slice(prefix.length)) : 0;
  const next = Number.isFinite(n) ? n + 1 : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

