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
import { inBatches, readAllPages } from "./id-list";
import { isDocumentSource, readExtractionMeta } from "./extraction-types";
import {
  hasExtractionDocumentSource,
  hasExtractionPageCount,
  hasExtractionUploadPageCount,
  hasExtractionInboundFields,
  hasExtractionDerivedPartial,
  hasSupplierDocumentRef,
} from "./schema-capability";
import type { ExtractionDraft, ExtractionStatus, StoredErrorCode } from "./extraction-types";

/** EXT-15. Aceeasi lista, plus coloana pe care 0032 o adauga.
 *
 *  DOUA LISTE SI NU UNA CU UN CAMP OPTIONAL, fiindca PostgREST nu are camp
 *  optional: o coloana necunoscuta intr-un select este 42703 si citirea arunca.
 *  Care dintre ele se foloseste o decide hasExtractionDocumentSource(). */
const DRAFT_COLUMNS_WITH_SOURCE =
  "order_id, document_path, document_filename, mime_type, size_bytes, status, error_code, reason, supplier_name, order_date, subtotal, vat_amount, document_total, prices_include_vat, vat_rate, currency, currency_raw, document_source, fired_at, callback_at, confirmed_at, confirmed_inbound_order_id";

const DRAFT_COLUMNS =
  "order_id, document_path, document_filename, mime_type, size_bytes, status, error_code, reason, supplier_name, order_date, subtotal, vat_amount, document_total, prices_include_vat, vat_rate, currency, currency_raw, fired_at, callback_at, confirmed_at, confirmed_inbound_order_id";

/** EXT-11. Aceleasi liste, plus perechea pe care 0036 o adauga.
 *
 *  O A TREIA LISTA SI NU O CONCATENARE INLINE, din acelasi motiv pentru care
 *  exista deja doua: tipurile lui supabase-js parseaza sirul de select ca
 *  literal, iar o expresie conditionala le da o uniune si parserul renunta cu o
 *  eroare de tip. Alegerea se face in draftColumnsFor si rezultatul se tine
 *  intr-un `string` larg, care il face sa intoarca forma generica, exact ce vrea
 *  mapDraft: el citeste campurile pe nume dintr-un Record. */
const SUPPLIER_REF_COLUMNS = ", order_ref, order_ref_series";

/** EXT-28. Numarul de pagini NUMARAT DE NOI la incarcare, adaugat de 0043. Un
 *  sufix separat, din acelasi motiv ca perechea de mai sus. */
const UPLOAD_PAGE_COUNT_COLUMN = ", upload_page_count";

/** P3-72, constatarea F5. Numarul de pagini RAPORTAT DE MODEL, adaugat de 0032.
 *
 *  ALT SUFIX SI ALTA POARTA decat cel de deasupra, si nu este dublare. 0032 si
 *  0043 sunt fisiere separate care ajung in productie separat, exact motivul
 *  pentru care `schema-capability.ts` tine deja doua sonde distincte. */
const MODEL_PAGE_COUNT_COLUMN = ", page_count";

/** P3-72, constatarea F5. Blocul de diagnostic al modelului, stocat verbatim.
 *
 *  FARA POARTA, SI ACEASTA ESTE SINGURA COLOANA DE AICI CARE NU ARE NEVOIE DE
 *  UNA. `meta` vine din `0008_extraction_drafts.sql`, care este fisierul care
 *  CREEAZA tabela: coloana si tabela au aceeasi soarta, deci o baza pe care
 *  `extraction_drafts` exista are intotdeauna si `meta`. Nu exista fereastra in
 *  care selectul ar putea intoarce 42703 pe ea si tabela sa raspunda oricum.
 *  Sondele de mai sus exista fiindca 0032, 0036 si 0043 sunt migratii DE MAI
 *  TARZIU, care ajung in productie la fuziune, in timp ce codul pleaca din
 *  acelasi push. */
const META_COLUMN = ", meta";

/** EXT-34. Cele doua coloane de pe document pe care 0053 le adauga, si cele trei
 *  de pe linie. Aceeasi poarta pentru toate cinci, fiindca sosesc in acelasi
 *  fisier. */
const INBOUND_DRAFT_COLUMNS = ", document_type, client_ref";
const INBOUND_LINE_COLUMNS = ", supplier_code, description, line_total_source";

/** P3-80, constatarea F6. Mutarea NOASTRA in `partial`, adaugata de 0054. Un
 *  sufix separat si o poarta separata, fiindca 0054 este alt fisier. */
const DERIVED_PARTIAL_COLUMN = ", platform_derived_partial";

/** Ce coloane exista CHIAR ACUM pe baza catre care arata aplicatia.
 *
 *  INTREBARI SEPARATE SI NU UNA, fiindca 0033, 0036 si 0043 sunt fisiere separate
 *  si ajung in productie separat. O poarta comuna ar lega soarta lor si ar
 *  ascunde exact starea in care una este aplicata si cealalta nu. */
async function draftColumnsFor(supabase: Parameters<typeof hasExtractionDocumentSource>[0] & Parameters<typeof hasSupplierDocumentRef>[0]): Promise<string> {
  const base = (await hasExtractionDocumentSource(supabase))
    ? DRAFT_COLUMNS_WITH_SOURCE
    : DRAFT_COLUMNS;
  const withRef = (await hasSupplierDocumentRef(supabase)) ? base + SUPPLIER_REF_COLUMNS : base;
  // P3-72. `meta` se adauga neconditionat: vezi META_COLUMN pentru de ce este
  // singura de aici fara sonda.
  const withMeta = withRef + META_COLUMN;
  const withUpload = (await hasExtractionUploadPageCount(supabase))
    ? withMeta + UPLOAD_PAGE_COUNT_COLUMN
    : withMeta;
  const withModel = (await hasExtractionPageCount(supabase))
    ? withUpload + MODEL_PAGE_COUNT_COLUMN
    : withUpload;
  const withInbound = (await hasExtractionInboundFields(supabase))
    ? withModel + INBOUND_DRAFT_COLUMNS
    : withModel;
  return (await hasExtractionDerivedPartial(supabase))
    ? withInbound + DERIVED_PARTIAL_COLUMN
    : withInbound;
}

const LINE_COLUMNS =
  "order_id, line_no, product_name, quantity, unit, unit_raw, unit_price, line_total, currency, currency_raw, category, category_raw";

/** EXT-34. Coloanele liniei, plus cele trei din 0053 cand exista. */
async function lineColumnsFor(supabase: Parameters<typeof hasExtractionInboundFields>[0]): Promise<string> {
  return (await hasExtractionInboundFields(supabase)) ? LINE_COLUMNS + INBOUND_LINE_COLUMNS : LINE_COLUMNS;
}

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
    // EXT-34. Cand 0053 nu este inca aplicata coloanele lipsesc din select si
    // valorile sunt null, ceea ce este adevarul: nu au fost stocate.
    supplierCode: (row.supplier_code as string | null) ?? null,
    lineDescription: (row.description as string | null) ?? null,
    lineTotalSource: (row.line_total_source as string | null) ?? null,
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
    // P3-71. StoredErrorCode: coloana poate purta si un cod scris de noi care nu
    // circula pe sarma, si un cast la multimea de pe sarma ar minti despre el.
    errorCode: (row.error_code as StoredErrorCode | null) ?? null,
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
    // EXT-11. Doua coloane, doua campuri, si nimic nu le lipeste aici. Cand 0036
    // nu este inca aplicata coloanele lipsesc din select si amandoua sunt null,
    // ceea ce este comportamentul de pana acum: referinta furnizorului nu era
    // stocata deloc.
    orderRef: (row.order_ref as string | null) ?? null,
    orderRefSeries: (row.order_ref_series as string | null) ?? null,
    // EXT-34. Aceeasi regula ca la liniile de mai sus.
    documentType: (row.document_type as string | null) ?? null,
    clientRef: (row.client_ref as string | null) ?? null,
    // P3-80. Cand 0054 nu este inca aplicata coloana lipseste din select si
    // valoarea este null, ceea ce este adevarul: regula nu a rulat.
    derivedPartial: typeof row.platform_derived_partial === "boolean" ? row.platform_derived_partial : null,
    // EXT-28. Cand 0043 nu este inca aplicata coloana lipseste din select si
    // valoarea este null, ceea ce este adevarul: nimeni nu a numarat.
    uploadPageCount:
      Number.isInteger(row.upload_page_count) && (row.upload_page_count as number) >= 1
        ? (row.upload_page_count as number)
        : null,
    // P3-72, constatarea F5. Numarul raportat DE MODEL, aceeasi poarta de
    // valoare ca la cel numarat de noi: sub 1 nu este un numar mai mic de
    // pagini, este un raport stricat, si se citeste ca "nu s-a raportat". Cand
    // 0032 nu este aplicata coloana lipseste din select si valoarea este null,
    // ceea ce este adevarul despre randul acela.
    modelPageCount:
      Number.isInteger(row.page_count) && (row.page_count as number) >= 1
        ? (row.page_count as number)
        : null,
    // P3-72, constatarea F5. `jsonb` NEVALIDAT, citit camp cu camp si niciodata
    // crezut pe cuvant. Vezi readExtractionMeta.
    meta: readExtractionMeta(row.meta),
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
  const draftColumns: string = await draftColumnsFor(supabase);
  const lineColumns: string = await lineColumnsFor(supabase);

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
  //
  // P3-39. PAGINI CITITE PANA LA CAPAT, CU TOTALUL CERUT IN ACEEASI CERERE.
  //
  // Pana la P3-39 citirea nu avea nici interval, nici numar. PostgREST taie orice
  // lista la limita lui de randuri fara sa spuna, iar ordinea de mai jos punea
  // taietura pe coada: documentele care asteptau de cel mai mult timp dispareau
  // de pe ecran, si un raspuns taiat era, pentru fiecare linie de dedesubt,
  // aceeasi valoare ca unul intreg. readAllPages, in id-list.ts, cere totalul pe
  // fiecare pagina si refuza un raspuns scurt. Liniile imbricate nu sunt atinse:
  // limita le taie per ciorna, nu peste tot raspunsul (masurat la P3-38).
  //
  // order_id DUPA fired_at, fiindca paginile se leaga prin pozitie. Doua ciorne
  // cu acelasi fired_at, sau amandoua fara el, nu au altfel o ordine stabila, si
  // una s-ar putea vedea de doua ori iar alta niciodata.
  //
  // P3-38. EROAREA SE CITESTE, acum inauntrul lui readAllPages. O citire cazuta
  // este un ESEC VIZIBIL, nu o lista goala.
  const rows = await readAllPages<Record<string, unknown>>(
    "ciornele de extragere",
    async (from, to) => {
      const { data, count, error } = await supabase
        .from("extraction_drafts")
        .select(`${draftColumns}, extraction_draft_lines(${lineColumns})`, { count: "exact" })
        // confirmed_at, NU cheia straina. Vezi antetul migratiei 0011: pointerul
        // catre comanda poarta on delete set null, deci poate redeveni null, iar o
        // ciorna consumata ar reaparea aici si s-ar putea confirma a doua oara.
        // confirmed_at nu il scrie nimic altceva decat o confirmare.
        .is("confirmed_at", null)
        .order("fired_at", { ascending: false, nullsFirst: false })
        .order("order_id", { ascending: true })
        .range(from, to);
      return { data: data as unknown as Record<string, unknown>[] | null, count, error };
    },
  );
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
