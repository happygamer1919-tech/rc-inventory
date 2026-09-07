import "server-only";

// Citirile lanei de extragere: ce asteapta verificare si ce s-a extras.
//
// ECRANUL OPERATORULUI NU TRECE PRIN ENDPOINTUL DE CALLBACK. Acela este drumul
// masinii, cu secret partajat si cheie de service_role. Aici se citeste prin
// sesiunea operatorului, sub RLS, ca orice alt ecran.
//
// CE INSEAMNA "ASTEAPTA VERIFICARE", scris o singura data si folosit peste tot:
// o ciorna neconfirmata al carei order_id NU este id-ul unei comenzi existente.
// Motivul intreg este in antetul migratiei 0010. Pe scurt: o ciorna al carei
// order_id numeste deja o comanda vine din cealalta lane, unde operatorul a
// tastat comanda intai si a atasat documentul la ea. Comanda exista, deci nu
// mai e nimic de confirmat, si a o oferi spre confirmare ar produce un duplicat.

import { createClient } from "@/lib/supabase/server";
import { inBatches } from "./id-list";
import { isDocumentSource } from "./extraction-types";
import { hasExtractionDocumentSource } from "./schema-capability";
import type { ExtractionDraft, ExtractionErrorCode, ExtractionStatus } from "./extraction-types";

/** EXT-15. Aceeasi lista, plus coloana pe care 0032 o adauga.
 *
 *  DOUA LISTE SI NU UNA CU UN CAMP OPTIONAL, fiindca PostgREST nu are camp
 *  optional: o coloana necunoscuta intr-un select este 42703 si citirea arunca.
 *  Care dintre ele se foloseste o decide hasExtractionDocumentSource(). */
const DRAFT_COLUMNS_WITH_SOURCE =
  "order_id, document_path, document_filename, mime_type, size_bytes, status, error_code, reason, supplier_name, order_date, subtotal, vat_amount, document_total, prices_include_vat, vat_rate, currency, currency_raw, document_source, fired_at, callback_at, confirmed_at, confirmed_inbound_order_id";

const DRAFT_COLUMNS =
  "order_id, document_path, document_filename, mime_type, size_bytes, status, error_code, reason, supplier_name, order_date, subtotal, vat_amount, document_total, prices_include_vat, vat_rate, currency, currency_raw, fired_at, callback_at, confirmed_at, confirmed_inbound_order_id";

const LINE_COLUMNS =
  "order_id, line_no, product_name, quantity, unit, unit_raw, unit_price, line_total, currency, currency_raw, category, category_raw";

/** numeric() peste PostgREST vine ca sir. null ramane null, mereu: contract 2.1. */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

type LineRow = Record<string, unknown>;

function mapLine(row: LineRow) {
  return {
    lineNo: Number(row.line_no),
    productName: String(row.product_name),
    quantity: num(row.quantity),
    unit: (row.unit as string | null) ?? null,
    unitRaw: (row.unit_raw as string | null) ?? null,
    unitPrice: num(row.unit_price),
    lineTotal: num(row.line_total),
    currency: (row.currency as string | null) ?? null,
    currencyRaw: (row.currency_raw as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    categoryRaw: (row.category_raw as string | null) ?? null,
  };
}

function mapDraft(row: Record<string, unknown>, lines: LineRow[]): ExtractionDraft {
  return {
    orderId: String(row.order_id),
    documentPath: String(row.document_path),
    documentFilename: String(row.document_filename),
    mimeType: String(row.mime_type),
    sizeBytes: Number(row.size_bytes),
    status: (row.status as ExtractionStatus | null) ?? null,
    errorCode: (row.error_code as ExtractionErrorCode | null) ?? null,
    reason: (row.reason as string | null) ?? null,
    supplierName: (row.supplier_name as string | null) ?? null,
    orderDate: (row.order_date as string | null) ?? null,
    subtotal: num(row.subtotal),
    vatAmount: num(row.vat_amount),
    documentTotal: num(row.document_total),
    pricesIncludeVat: (row.prices_include_vat as boolean | null) ?? null,
    vatRate: num(row.vat_rate),
    currency: (row.currency as string | null) ?? null,
    currencyRaw: (row.currency_raw as string | null) ?? null,
    // EXT-15. null aici inseamna "extractorul nu a spus" SI "randul este de
    // dinaintea migratiei 0032". Amandoua se citesc ca `scan` de catre apelant,
    // prin effectiveSource, si niciuna nu este rescrisa aici intr-o afirmatie pe
    // care nimeni nu a facut-o.
    documentSource: isDocumentSource(row.document_source) ? row.document_source : null,
    firedAt: (row.fired_at as string | null) ?? null,
    callbackAt: (row.callback_at as string | null) ?? null,
    lines: lines.map(mapLine).sort((a, b) => a.lineNo - b.lineNo),
  };
}

/**
 * Ciornele care asteapta verificare, cea mai noua prima.
 *
 * Include starile failed si partial: exact ele sunt suprafata vizibila a
 * esecului. Un document cazut care nu apare in lista este un document care pare
 * ca se proceseaza la nesfarsit, si operatorul invata sa nu creada ecranul.
 */
export async function listReviewDrafts(): Promise<ExtractionDraft[]> {
  const supabase = await createClient();

  // EXT-15. Lista se alege inainte si se tine intr-un `string` simplu.
  //
  // Tipurile lui supabase-js parseaza sirul de select ca literal ca sa infereze
  // forma randului; o expresie conditionala le da o uniune de doua literale si
  // parserul renunta cu o eroare de tip in loc sa produca forma. Un `string`
  // larg il face sa intoarca forma generica, care este exact ce vrea mapDraft:
  // el citeste campurile pe nume dintr-un Record si nu depinde de inferenta.
  const draftColumns: string = (await hasExtractionDocumentSource(supabase))
    ? DRAFT_COLUMNS_WITH_SOURCE
    : DRAFT_COLUMNS;

  // P3-38. LINIILE VIN IMBRICATE, INTR-O SINGURA CERERE, FARA NICIO LISTA DE
  // ID-URI.
  //
  // Pana la 2026-09-05 liniile se cereau separat, cu `.in("order_id", ids)`
  // peste TOATE ciornele in asteptare. Filtrul acela ajunge in adresa cererii,
  // deci lungimea ei crestea cu numarul de documente ale clientului, si peste
  // circa doua sute portarul din fata lui PostgREST raspundea 414. Codul nu
  // citea eroarea, harta pe comanda ramanea goala, si FIECARE ciorna se randa
  // cu zero linii. Ecranul nu putea deosebi "nu are linii" de "nu am putut citi
  // liniile", si nici operatorul.
  //
  // DE CE IMBRICAREA SI NU UN LOT. `extraction_draft_lines.order_id` are cheie
  // straina catre `extraction_drafts.order_id` (migratia 0008), deci PostgREST
  // exprima jonctiunea singur. Un lot ar fi fost o marime aleasa, iar o marime
  // aleasa este un prag pe care cineva il intalneste din nou. Aici nu mai exista
  // niciun prag de intalnit.
  const { data: drafts, error: draftsError } = await supabase
    .from("extraction_drafts")
    .select(`${draftColumns}, extraction_draft_lines(${LINE_COLUMNS})`)
    // confirmed_at, NU cheia straina. Vezi antetul migratiei 0011: pointerul
    // catre comanda poarta on delete set null, deci poate redeveni null, iar o
    // ciorna consumata ar reaparea aici si s-ar putea confirma a doua oara.
    // confirmed_at nu il scrie nimic altceva decat o confirmare.
    .is("confirmed_at", null)
    .order("fired_at", { ascending: false, nullsFirst: false });

  // P3-38. EROAREA SE CITESTE. O citire cazuta este un ESEC VIZIBIL, nu o lista
  // goala: acesta este defectul, iar lungimea adresei a fost doar declansatorul.
  if (draftsError) {
    throw new Error(`Nu s-au putut citi ciornele de extragere: ${draftsError.message}`);
  }

  const rows = (drafts ?? []) as unknown as Record<string, unknown>[];
  if (rows.length === 0) return [];

  // Ciornele din cealalta lane, unde comanda exista deja. Vezi antetul.
  const taken = await existingOrderIds(
    supabase,
    rows.map((r) => String(r.order_id)),
  );

  const pending = rows.filter((r) => !taken.has(String(r.order_id)));
  if (pending.length === 0) return [];

  return pending.map((r) => mapDraft(r, linesOf(r)));
}

/**
 * Liniile imbricate ale unei ciorne.
 *
 * P3-38. UN VECTOR GOL SI O CHEIE LIPSA NU SUNT ACELASI LUCRU, si diferenta
 * este chiar defectul pe care cardul il inchide. Vector gol inseamna "documentul
 * nu are linii", ceea ce se intampla si este corect. Cheie lipsa inseamna ca
 * selectul nu a cerut resursa imbricata, adica un defect de cod, si el nu are
 * voie sa ajunga pe ecran ca un document fara linii.
 */
function linesOf(row: Record<string, unknown>): LineRow[] {
  const embedded = row.extraction_draft_lines;
  if (!Array.isArray(embedded)) {
    throw new Error(
      "Ciorna a venit fara resursa imbricata extraction_draft_lines. " +
        "Selectul nu a cerut-o, deci lipsa liniilor nu poate fi citita ca document fara linii.",
    );
  }
  return embedded as LineRow[];
}

/**
 * Care dintre id-urile date numesc o comanda de intrare care exista deja.
 *
 * P3-38. AICI LOTUL ESTE RASPUNSUL SI IMBRICAREA NU ESTE, fiindca
 * `extraction_drafts.order_id` NU are cheie straina catre `inbound_orders`, si
 * asta este deliberat: antetul migratiei 0008 spune ca daca id-ul numeste sau nu
 * o comanda existenta este decizia lui P2-09, nu a migratiei. Fara cheie straina
 * PostgREST nu poate exprima jonctiunea, deci lista se taie in loturi.
 *
 * ERA ACELASI DEFECT CU AL LINIILOR, MAI PUTIN EXPUS. La 414 `data` ramanea
 * nedefinit, multimea iesea goala, si ecranul arata MAI MULTE ciorne, nu mai
 * putine: un document deja preluat pe cealalta lane se oferea a doua oara spre
 * confirmare. Se repara aici, in aceeasi trecere, fiindca este aceeasi citire
 * nelimitata a carei eroare nu era citita.
 */
async function existingOrderIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: readonly string[],
): Promise<Set<string>> {
  const taken = new Set<string>();

  for (const batch of inBatches(ids)) {
    const { data, error } = await supabase.from("inbound_orders").select("id").in("id", batch);
    if (error) {
      throw new Error(`Nu s-au putut citi comenzile de intrare existente: ${error.message}`);
    }
    for (const order of data ?? []) {
      taken.add(String((order as { id: string }).id));
    }
  }

  return taken;
}
