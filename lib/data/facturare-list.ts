import "server-only";

// Citirea listei de facturi. Cardul P3-109, goal G65 partea 2.
//
// NULL INSEAMNA "MIGRATIA 0063 NU ESTE INCA APLICATA", exact ca in
// facturare-settings.ts, si ruta deseneaza atunci linia romaneasca in loc sa cada
// cu 500. Poarta este hasFacturareSettings si NU una noua: 0063 creeaza enumul si
// toate cele patru tabele INTR-O SINGURA TRANZACTIE, deci "exista
// invoice_settings" si "exista invoices" sunt acelasi fapt, iar o a doua sonda ar
// fi un al doilea drum la baza pentru un raspuns care nu poate diferi.
//
// CE FILTREAZA BAZA SI CE FILTREAZA FISIERUL ACESTA, si de ce nu totul intr-un
// loc. Starea, clientul si perioada sunt filtre ale bazei. Cautarea si capatul
// exact al perioadei sunt aici, din doua motive:
//
//   1. NUMARUL FACTURII NU ESTE O COLOANA. Este seria plus numarul, compus la
//      afisare de invoiceNumberText, si un `ilike` peste un sir care nu este
//      stocat nu se poate scrie. A stoca a treia copie a aceleiasi informatii
//      numai ca sa fie cautabila este exact ce refuza partea 1 in antetul ei.
//   2. O CIORNA NU ARE ZI DE EMITERE, deci ziua ei este ziua crearii, iar
//      created_at este un `timestamptz`: ziua lui in Chisinau nu este ziua lui in
//      UTC pentru trei ore din fiecare zi. Baza primeste perioada cu o zi de
//      margine la fiecare capat, si ziua calendaristica din Chisinau se calculeaza
//      aici, cu chisinauDateOf, care este chiar functia pe care restul aplicatiei
//      o foloseste pentru exact aceasta distinctie.
//
// ECRANUL NU FILTREAZA NIMIC. Primeste randurile care i se cuvin, numarul si
// suma, si le deseneaza. Aceeasi regula pe care o scrie ClientsScreen in antetul
// lui: un component care ar filtra in memorie ar putea ajunge sa spuna alt numar
// decat linia de totaluri de sub tabel.
//
// NICIO PAGINARE, si nu din uitare: perioada ESTE marginea. Filtrul implicit este
// luna curenta, iar o luna de facturi a unei firme de constructii din Chisinau
// este o lista pe care un om o parcurge. Cand ea nu va mai fi, paginarea este un
// card, nu o taiere tacuta a randurilor care ar face linia de totaluri sa mintA.

import { createClient } from "@/lib/supabase/server";
import { chisinauDateOf, normalizeText } from "./format";
import { hasFacturareSettings } from "./schema-capability";
import { invoiceNumberText, type InvoiceStatus } from "./facturare-types";
import { one } from "./row";
import { isLiveInvoice } from "./facturare-list-types";
import type {
  InvoiceClientChoice,
  InvoiceListQuery,
  InvoiceListResult,
  InvoiceListRow,
} from "./facturare-list-types";

const SELECT_INVOICE = `
  id, series, number, status, issue_date, created_at, total_mdl,
  client_id,
  clients ( id, name ),
  project_id,
  projects ( id, name )
`;

type Named = { id: string; name: string };

type InvoiceRow = {
  id: string;
  series: string | null;
  number: number | string | null;
  status: string;
  issue_date: string | null;
  created_at: string;
  total_mdl: number | string | null;
  client_id: string;
  clients?: Named | Named[] | null;
  project_id: string | null;
  projects?: Named | Named[] | null;
};

/** numeric(14,2) ajunge prin PostgREST ca sir. Number() o data, aici. */
function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Ziua `YYYY-MM-DD` mutata cu `days` zile, pe UTC si pe siruri. */
function shiftDay(day: string, days: number): string {
  const at = new Date(0);
  at.setUTCFullYear(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)) + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`;
}

function toRow(row: InvoiceRow): InvoiceListRow {
  const client = one(row.clients ?? null);
  const project = one(row.projects ?? null);
  const issueDate = row.issue_date;
  return {
    id: row.id,
    series: row.series,
    number: row.number === null || row.number === undefined ? null : Number(row.number),
    status: row.status as InvoiceStatus,
    date: issueDate ?? chisinauDateOf(row.created_at),
    dateIsCreation: issueDate === null,
    clientId: row.client_id,
    // Cheile straine refuza stergerea unui client sau a unui proiect legat de o
    // factura, deci randul incorporat exista; textele de mai jos sunt pentru cazul
    // in care politicile de citire l-ar ascunde, nu pentru o legatura rupta.
    clientName: client?.name ?? "Client necunoscut",
    projectId: row.project_id,
    projectName: project?.name ?? null,
    totalMdl: toNumber(row.total_mdl),
  };
}

/** Numarul scris al facturii si numele clientului, pentru o cautare intr-o casuta. */
function haystack(row: InvoiceListRow): string {
  return normalizeText(`${invoiceNumberText(row.series, row.number) ?? ""} ${row.clientName}`);
}

/**
 * Facturile perioadei cerute, cu numarul si suma a ceea ce a ramas dupa filtre.
 *
 * Intoarce null cand migratia 0063 nu este aplicata sau cand PostgREST nu poate
 * raspunde. Un cont fara profil activ nu primeste null: politicile de tip select
 * filtreaza randuri, deci el citeste o lista GOALA, care este distinctia pe care o
 * scrie migratia 0055. Ecranul lui arata starea goala, nu o eroare.
 */
export async function listInvoices(query: InvoiceListQuery): Promise<InvoiceListResult | null> {
  const supabase = await createClient();
  if (!(await hasFacturareSettings(supabase))) return null;

  const emitted = `and(issue_date.gte.${query.from},issue_date.lte.${query.to})`;
  // Marginea de o zi la fiecare capat: ziua din Chisinau a unui moment poate cadea
  // in ziua UTC de dinainte sau de dupa, si comparatia exacta se face mai jos.
  const drafted =
    `and(issue_date.is.null,` +
    `created_at.gte.${shiftDay(query.from, -1)}T00:00:00Z,` +
    `created_at.lt.${shiftDay(query.to, 2)}T00:00:00Z)`;

  let request = supabase
    .from("invoices")
    .select(SELECT_INVOICE)
    .or(`${emitted},${drafted}`)
    .order("created_at", { ascending: false });

  if (query.status !== "") request = request.eq("status", query.status);
  if (query.clientId !== "") request = request.eq("client_id", query.clientId);

  const { data, error } = await request;
  if (error) return null;

  const needle = normalizeText(query.q);
  const rows = ((data ?? []) as unknown as InvoiceRow[])
    .map(toRow)
    .filter((row) => row.date >= query.from && row.date <= query.to)
    .filter((row) => needle === "" || haystack(row).includes(needle))
    // Cele mai noi intai. La aceeasi zi decide momentul crearii, care este ordinea
    // in care baza le-a dat, deci sortarea este stabila si nu se rastoarna.
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));

  // NUMAI EMISE SI PLATITE, si asta este chiar constatarea G7 a raportului
  // docs/reports/2026-09-29-critic-bug-sweep-2.md, reparata de cardul P3-115. Aici se
  // aduna pana acum FIECARE rand, deci ciornele, care nu sunt documente si nu au
  // număr, si anulările, care sunt declaratia ca banii NU sunt datorati. Filtrul
  // implicit de stare este gol, adica Toate stările, deci cifra era greşită pentru
  // orice lună care contine o anulare, si specificatia veche o si cerea aşa.
  //
  // Randul de pe ecran rămâne numărat intreg, separat, fiindca "cate facturi vad" si
  // "cat am facturat" sunt doua intrebari si nu una.
  const live = rows.filter((row) => isLiveInvoice(row.status));

  return {
    rows,
    count: rows.length,
    liveCount: live.length,
    // Suma se aduna din CHIAR randurile de pe ecran, si nu se cere bazei separat:
    // doua numere din doua surse care ar trebui sa fie egale sunt doua numere care
    // pot sa nu fie.
    liveSumMdl: live.reduce((total, row) => total + row.totalMdl, 0),
    clients: await listInvoiceClients(supabase),
  };
}

// P3-110, goal G65 partea 3. FACTURILE UNUI CLIENT SAU ALE UNUI PROIECT, fara nicio
// perioada, pentru fila de pe fisa lui.
//
// AICI SI NU INTR-UN FISIER NOU, si nu este comoditate: acesta este acelasi rand, cu
// acelasi `select` si aceeasi transformare. Un al doilea fisier ar fi a doua forma a
// aceluiasi rand si primul loc in care cele doua ar incepe sa se deosebeasca. Ce nu
// se refoloseste este FILTRUL: aici nu exista perioada si nici cautare, fiindca
// intrebarea de pe fisa unui client este "ce i-am facturat", nu "ce am facturat luna
// asta", iar un filtru de luna pe o fila ar ascunde exact istoricul pe care omul a
// deschis fisa sa il vada.
//
// FARA PAGINARE, din acelasi motiv scris in antet pentru lista: cand o fisa nu va mai
// incapea, paginarea este un card si nu o taiere tacuta a randurilor.

/**
 * Facturile unei inregistrari, cele mai noi intai.
 *
 * Intoarce null cand migratia 0063 nu este aplicata, exact ca listInvoices, iar fila
 * deseneaza atunci linia romaneasca in loc sa cada. Un cont fara profil activ citeste
 * o lista GOALA si nu null (migratia 0055).
 */
export async function listInvoicesForRecord(
  owner: { kind: "client"; id: string } | { kind: "project"; id: string },
): Promise<InvoiceListRow[] | null> {
  const supabase = await createClient();
  if (!(await hasFacturareSettings(supabase))) return null;

  const column = owner.kind === "client" ? "client_id" : "project_id";
  const { data, error } = await supabase
    .from("invoices")
    .select(SELECT_INVOICE)
    .eq(column, owner.id)
    .order("created_at", { ascending: false });

  if (error) return null;

  return ((data ?? []) as unknown as InvoiceRow[])
    .map(toRow)
    // Cele mai noi intai, pe ziua randului, exact ca pe lista. La aceeasi zi decide
    // ordinea in care baza le-a dat, care este momentul crearii, deci sortarea este
    // stabila si nu se rastoarna.
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
}

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Clientii care au cel putin o factura, alfabetic.
 *
 * NU TOTI CLIENTII. Un filtru al carui fiecare optiune poate da un rand este un
 * filtru in care operatorul are incredere; unul plin de clienti fara nicio factura
 * il invata sa il ocoleasca. Este aceeasi judecata pe care o scrie raportul de
 * proiectare despre filtrul de locatie, care nu exista pe acest ecran.
 *
 * FARA PERIOADA: alegerea unui client trebuie sa ramana posibila si cand luna de
 * pe ecran nu are nicio factura a lui, fiindca atunci urmatorul lucru pe care il
 * face operatorul este sa largeasca perioada.
 */
async function listInvoiceClients(supabase: Client): Promise<InvoiceClientChoice[]> {
  const { data, error } = await supabase.from("invoices").select("client_id, clients ( id, name )");
  if (error) return [];

  const byId = new Map<string, string>();
  for (const row of (data ?? []) as unknown as { client_id: string; clients?: Named | Named[] | null }[]) {
    const client = one(row.clients ?? null);
    if (client) byId.set(client.id, client.name);
  }
  return [...byId.entries()]
    .map(([id, name]): InvoiceClientChoice => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "ro"));
}
