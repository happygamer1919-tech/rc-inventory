// P3-181. Loturile si miscarile unui produs, citite pe pagini.
//
// FISIER SEPARAT DE products.ts, FARA "server-only" SI FARA createClient: clientul
// vine ca argument, ca un test sa-i poata da unul fals si sa dovedeasca citirea pe
// pagini fara baza de date. Aceeasi forma ca stock-read.ts si inbound-read.ts.
//
// INAINTE, listProductBatches si listProductMovements citeau fiecare tabel intr-o
// singura cerere, fara pagini. PostgREST taie orice lista la `max_rows` randuri si
// nu spune, deci un produs cu peste 1000 de linii de iesire avea un istoric cu
// randuri lipsa, poate chiar cele mai noi, in timp ce stocul lui (citit pe pagini
// de la P3-136) era corect. Acum citirea merge pana la capat prin readAllPages,
// care cere si totalul si face din orice nepotrivire un esec vizibil.
//
// LISTA DE SELECT A IESIRILOR SI POARTA EI RAMAN IN products.ts. Coloanele
// adaugate de 0067 se cer numai cand hasOutboundIssueMode a raspuns da, iar
// raspunsul vine aici ca `withMode`. Fisierul acesta nu numeste nicio coloana noua.

import { dedupeById, readAllPages, type CountedPage } from "./id-list";
import type { OutboundMode } from "./outbound-types";

export type ProductBatch = {
  id: string;
  quantity: number;
  arrivedAt: string;
  orderReference: string | null;
};

export type ProductMovement = {
  id: string;
  direction: "in" | "out";
  quantity: number;
  at: string;
  reference: string;
  context: string;
  /** P3-120 clauza 3, hotararea R-215. Ce fel de eliberare a scazut cantitatea.
   *
   *  NULABIL AICI, SPRE DEOSEBIRE DE OutboundIssue.mode, SI DIN DOUA MOTIVE CARE
   *  SUNT AMANDOUA ADEVARATE:
   *
   *    O INTRARE NU ARE MOD. Clauza 3 vorbeste despre randurile de IESIRE, si o
   *    recepție de la furnizor nu este nici proiect, nici client direct: "project"
   *    pe un rand de intrare ar fi un raspuns inventat la o intrebare care nu se
   *    pune. Null spune ca intrebarea nu se aplica.
   *
   *    CAT TIMP 0067 NU ESTE APLICATA nu se poate citi coloana, deci nu se stie, si
   *    atunci panoul nu scrie niciun mod: decizia B a instructiunii cardului. Un rand
   *    de iesire cu mod null este exact fereastra aceea, si componentul nu are nevoie
   *    de niciun al doilea semnal ca sa o recunoasca. */
  mode: OutboundMode | null;
};

/** Forma minima a clientului pe care o folosesc citirile de mai jos. Clientul
 *  supabase-js o satisface; un test o satisface cu un obiect scris de mana. */
export type MovementQuery<T> = PromiseLike<CountedPage<T>> & {
  eq(column: string, value: string): MovementQuery<T>;
  order(column: string, options: { ascending: boolean }): MovementQuery<T>;
  range(from: number, to: number): MovementQuery<T>;
};

export type MovementClient = {
  from(table: "batches" | "outbound_lines"): {
    select(columns: string, options: { count: "exact" }): MovementQuery<{ id: string }>;
  };
};

/**
 * Toate randurile unui produs dintr-un tabel, pe pagini, cele mai noi intai.
 *
 * Fiecare pagina se cere in ordinea coloanei de data, apoi dupa id, care este
 * unic, ca doua randuri cu aceeasi data sa nu-si schimbe locul intre doua pagini.
 * Un rand citit de doua ori (vezi dedupeById) nu ajunge de doua ori in istoric.
 */
async function readProductRows<T extends { id: string }>(
  client: MovementClient,
  table: "batches" | "outbound_lines",
  what: string,
  columns: string,
  dateColumn: string,
  productId: string,
  pageSize?: number,
): Promise<T[]> {
  const rows = await readAllPages<T>(
    what,
    (from, to) =>
      client
        .from(table)
        .select(columns, { count: "exact" })
        .eq("product_id", productId)
        .order(dateColumn, { ascending: false })
        .order("id", { ascending: false })
        .range(from, to) as unknown as PromiseLike<CountedPage<T>>,
    pageSize,
  );
  return dedupeById(rows);
}

function toNumber(value: unknown): number {
  // numeric() vine din PostgREST ca string, ca sa nu piarda precizie.
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Cele mai noi primele; la aceeasi data, id descrescator, ca ordinea sa fie fixa. */
function newestFirst<T extends { id: string }>(at: (row: T) => string) {
  return (a: T, b: T): number => at(b).localeCompare(at(a)) || b.id.localeCompare(a.id);
}

type BatchRow = {
  id: string;
  quantity: unknown;
  arrived_at: string;
  inbound_orders: unknown;
};

/** Loturile unui produs, cele mai noi primele, toate, pe pagini. */
export async function readProductBatches(
  client: MovementClient,
  productId: string,
  pageSize?: number,
): Promise<ProductBatch[]> {
  const rows = await readProductRows<BatchRow>(
    client,
    "batches",
    "loturile produsului",
    "id, quantity, arrived_at, inbound_orders(reference)",
    "arrived_at",
    productId,
    pageSize,
  );
  return rows
    .map((row) => ({
      id: row.id,
      quantity: toNumber(row.quantity),
      arrivedAt: row.arrived_at,
      orderReference: (row.inbound_orders as { reference: string } | null)?.reference ?? null,
    }))
    .sort(newestFirst((b) => b.arrivedAt));
}

type IssuedRow = { id: string; quantity: unknown; outbound_issues: unknown };

/**
 * Miscarile unui produs: intrarile din loturi si iesirile din liniile de iesire,
 * toate, pe pagini, imbinate si ordonate descrescator.
 *
 * `issueSelect` si `withMode` vin din products.ts, unde se intreaba poarta lui
 * 0067 (hasOutboundIssueMode).
 *
 * Liniile de iesire se cer in ordinea created_at a liniei, apoi id: data emiterii
 * sta pe outbound_issues, iar PostgREST nu ordoneaza randurile parinte dupa o
 * coloana a resursei imbricate. Ordinea paginilor trebuie doar sa fie stabila;
 * ordinea afisata o da sortarea finala, dupa data emiterii, apoi id.
 */
export async function readProductMovements(
  client: MovementClient,
  productId: string,
  issueSelect: string,
  withMode: boolean,
  pageSize?: number,
): Promise<ProductMovement[]> {
  const [batches, issued] = await Promise.all([
    readProductRows<BatchRow>(
      client,
      "batches",
      "loturile produsului",
      "id, quantity, arrived_at, inbound_orders(reference, supplier_name)",
      "arrived_at",
      productId,
      pageSize,
    ),
    readProductRows<IssuedRow>(
      client,
      "outbound_lines",
      "liniile de iesire ale produsului",
      issueSelect,
      "created_at",
      productId,
      pageSize,
    ),
  ]);

  const movements: ProductMovement[] = [];

  for (const row of batches) {
    const order = row.inbound_orders as { reference: string; supplier_name: string | null } | null;
    movements.push({
      id: row.id,
      direction: "in",
      quantity: toNumber(row.quantity),
      at: row.arrived_at,
      reference: order?.reference ?? "-",
      context: order?.supplier_name ?? "Recepție",
      // P3-120. RANDURILE DE INTRARE NU SE ATING, si clauza 3 cere exact atat: ea
      // vorbeste despre randurile de iesire. O recepție de la furnizor nu are un fel
      // de eliberare, deci nu i se inventeaza unul.
      mode: null,
    });
  }

  for (const row of issued) {
    type Named = { name: string } | { name: string }[] | null;
    const pickName = (v: Named): string | null =>
      Array.isArray(v) ? (v[0]?.name ?? null) : (v?.name ?? null);
    const issue = row.outbound_issues as
      | {
          reference: string;
          issued_at: string;
          /** P3-120: absent cat timp poarta a raspuns nu, fiindca atunci lista de
           *  select nu l-a cerut. */
          issue_mode?: string | null;
          projects: ({ name: string; clients: Named } | { name: string; clients: Named }[]) | null;
          /** Clientul PROPRIU al iesirii, al modului direct. */
          direct_client?: Named;
        }
      | null;
    const project = Array.isArray(issue?.projects) ? issue?.projects[0] : issue?.projects;
    const projectName = project?.name ?? null;

    // P3-120 clauza 3. MODUL, CITIT NUMAI CAND POARTA L-A LASAT SA FIE CITIT: null
    // cand 0067 nu este aplicata, si atunci panoul nu scrie nimic despre fel.
    const mode = withMode
      ? issue?.issue_mode === "direct_client"
        ? ("direct_client" as const)
        : ("project" as const)
      : null;

    // CUMPARATORUL VINE DE PE DRUMUL MODULUI. Pe o iesire pe proiect clientul se
    // citeste de pe proiect, cum il citeste de la P3-04b incoace; pe una catre client
    // direct nu exista proiect de citit, deci se citeste de pe coloana client_id a
    // iesirii.
    const clientName =
      mode === "direct_client"
        ? pickName(issue?.direct_client ?? null)
        : pickName(project?.clients ?? null);

    // P3-120 clauza 3. CONTEXTUL SPUNE CUI A PLECAT MATERIALUL, pe amandoua felurile.
    // Pana la acest card un rand de client direct scria doar "Ieșire": nicio
    // destinatie, pe exact randul care explica de ce a scazut o cantitate. Pe modul
    // direct cumparatorul ESTE destinatia intreaga, fiindca nu exista santier in
    // spatele lui, deci numele lui singur este raspunsul complet. Felul eliberarii nu
    // se repeta in acest sir: el are coloana lui pe ecran.
    // Rezerva este "Client necunoscut" si NU cuvantul modului: un rand de mod direct
    // ARE un client, prin outbound_issues_direct_client_mode_shape, deci singurul fel
    // in care numele poate lipsi este sa nu fi putut fi citit. Si eticheta modului nu
    // se scrie de mana nici aici: ea are un singur loc, OUTBOUND_MODE_LABEL.
    const context =
      mode === "direct_client"
        ? (clientName ?? "Client necunoscut")
        : clientName && projectName
          ? `${clientName} · ${projectName}`
          : (projectName ?? "Ieșire");

    movements.push({
      id: row.id,
      direction: "out",
      quantity: toNumber(row.quantity),
      at: issue?.issued_at ?? "",
      reference: issue?.reference ?? "-",
      context,
      mode,
    });
  }

  return movements.sort(newestFirst((m) => m.at));
}
