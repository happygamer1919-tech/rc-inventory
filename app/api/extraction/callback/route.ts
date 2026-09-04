// Punctul de sosire al callback-ului de la Make.
//
// Contract: docs/contracts/extraction-v2.md, sectiunile 4, 5 si 6. Tabelul de
// coduri este fixat prin hotararea R-014 si nu este o alegere de implementare:
//
//   202 acceptat      ciorna scrisa prima data
//   200 duplicat      acelasi order_id, ciorna INLOCUITA
//   400 respins       payload care nu respecta contractul
//   401 secret gresit MAKE_CALLBACK_SECRET lipsa sau gresit
//   5xx reincercabil  a cazut la noi, NU s-a scris nimic
//
// Make reincearca pe 5xx si NU reincearca pe 4xx, deci impartirea aceasta
// decide daca un payload gresit este reincercat la nesfarsit sau abandonat o
// singura data.
//
// UN 5xx TREBUIE SA INSEMNE CA NU S-A SCRIS NIMIC. Daca scriem pe jumatate si
// apoi cadem, reincercarea ajunge peste un rand scris partial. De aceea
// validarea intreaga se face INAINTE de prima scriere si liniile se sterg si se
// rescriu ca un lot.
//
// CINE SCRIE. Callback-ul vine de la Make, fara sesiune, iar politicile RLS sunt
// "to authenticated": o cerere anonima nu se potriveste cu nicio politica. Deci
// se foloseste clientul cu cheia de service_role, DUPA ce antetul secret a fost
// verificat. Secretul partajat este singura autentificare pe care contractul o
// prevede, si el se verifica primul, inaintea oricarei alte munci.

import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/supabase/env";
import {
  hasExtractionDocumentSource,
  hasExtractionPageCount,
  hasReconciliationFailedCode,
} from "@/lib/data/schema-capability";
import { reconcile } from "@/lib/data/reconciliation";
import {
  CALLBACK_CODES,
  effectiveSource,
  isDocumentSource,
  isExtractionErrorCode,
  isExtractionStatus,
} from "@/lib/data/extraction-types";

export const dynamic = "force-dynamic";

/** numeric() peste PostgREST vine ca string; null ramane null, mereu. */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Un sir prezent si gol NU este o valoare. Contract, regula globala 2.1. */
function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

function bool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

/**
 * EXT-09. Numarul de pagini raportat DE MODEL, citit din _meta.
 *
 * UN RAPORT STRICAT DEVINE null SI NU UN REFUZ. Cardul spune ca absenta nu este
 * o eroare si ca un semnal lipsa nu are voie sa respinga un document citit
 * corect. Zero, negativ, fractionar sau un sir sunt toate rapoarte stricate, si
 * un raport stricat spune exact cat spune si absenta: nu se stie. Un 400 aici ar
 * arunca un document intreg din cauza unui camp de diagnostic.
 *
 * ZERO NU ESTE UN NUMAR MAI MIC DE PAGINI. Un document are cel putin o pagina,
 * deci zero nu este o citire mai prudenta ci una imposibila, si ea nu are voie
 * sa fie stocata ca si cum ar fi o citire. Constrangerea din 0032 este a doua
 * usa, pentru un scriitor care nu este ruta aceasta.
 *
 * FRACTIONARUL ESTE RESPINS EXPLICIT si nu rotunjit. 2.5 pagini nu este o
 * citire mai putin precisa, este un camp care nu inseamna ce credem noi ca
 * inseamna, iar rotunjirea ar ascunde tocmai asta.
 */
function pageCount(meta: unknown): number | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const raw = (meta as Record<string, unknown>).page_count;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) return null;
  return raw;
}

function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (typeof key !== "string" || key.trim().length === 0) return null;
  return createServiceClient(supabaseUrl(), key.trim(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(request: Request) {
  // --- 401 inainte de orice altceva ----------------------------------------
  const expected = process.env.MAKE_CALLBACK_SECRET;
  const provided = request.headers.get("x-rc-callback-secret");
  if (
    typeof expected !== "string" ||
    expected.trim().length === 0 ||
    provided === null ||
    provided !== expected
  ) {
    return NextResponse.json({ error: "secret invalid" }, { status: CALLBACK_CODES.badSecret });
  }

  // --- 400: tot ce nu respecta contractul, verificat INAINTE de a scrie ----
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "corp invalid" }, { status: CALLBACK_CODES.rejected });
  }

  const orderId = str(body.order_id);
  if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
    return NextResponse.json({ error: "order_id lipseste sau nu este uuid" }, { status: CALLBACK_CODES.rejected });
  }

  const status = body.status;
  if (!isExtractionStatus(status)) {
    return NextResponse.json({ error: "status in afara multimii" }, { status: CALLBACK_CODES.rejected });
  }

  const errorCodeRaw = body.error_code ?? null;
  if (errorCodeRaw !== null && !isExtractionErrorCode(errorCodeRaw)) {
    return NextResponse.json({ error: "error_code in afara multimii" }, { status: CALLBACK_CODES.rejected });
  }
  // Contractul: error_code este non-null exact cand statusul este failed sau
  // partial. Aceeasi regula este si o constrangere in migratia 0008; verificata
  // aici ca sa raspundem 400 in loc de 500.
  if ((status === "failed" || status === "partial") && errorCodeRaw === null) {
    return NextResponse.json({ error: "error_code obligatoriu la failed si partial" }, { status: CALLBACK_CODES.rejected });
  }
  if (status === "extracted" && errorCodeRaw !== null) {
    return NextResponse.json({ error: "error_code interzis la extracted" }, { status: CALLBACK_CODES.rejected });
  }

  // EXT-15. UNDE A GASIT EXTRACTORUL TEXTUL.
  //
  // Declarat de el, fiindca numai el stie: mime_type nu raspunde la intrebare,
  // iar unul dintre documentele de proba este un PDF fara strat de text.
  //
  // O VALOARE PE CARE NU O CUNOASTEM ESTE REFUZATA, nu ignorata. Un `photo`
  // scapat printre valori ar cadea prin effectiveSource in ramura sigura, ceea ce
  // ar fi corect din intamplare astazi si tacut in ziua in care cineva adauga a
  // treia valoare si uita o ramura.
  if (body.document_source !== undefined && body.document_source !== null
      && !isDocumentSource(body.document_source)) {
    return NextResponse.json(
      { error: "document_source in afara multimii" },
      { status: CALLBACK_CODES.rejected },
    );
  }
  const documentSource = effectiveSource(body.document_source);

  // EXT-15. POATE BAZA SA STOCHEZE SURSA?
  //
  // Migratia 0033 este autorata, fuzionata si NEAPLICATA. Codul acesta ajunge in
  // productie inaintea coloanei, iar PostgREST intoarce 42703 pentru o coloana
  // necunoscuta: un update care o numeste ar raspunde 500 lui Make, care ar
  // reincerca la nesfarsit. Aceea este exact INC-05, si check:pending-schema-reads
  // a refuzat prima varianta a acestui fisier pentru ea.
  //
  // PANA CAND COLOANA EXISTA, COMPORTAMENTUL ESTE CEL DE ASTAZI, nu cel nou. A nu
  // putea sti sursa nu inseamna `scan`: inseamna ca regula EXT-15 nu se aplica
  // inca, deci liniile se pastreaza ca pana acum. Implicitul `scan` din
  // effectiveSource priveste un payload care NU A DECLARAT sursa pe o baza care
  // POATE sa o pastreze, ceea ce este alta intrebare.


  const rawLines = Array.isArray(body.lines) ? body.lines : null;
  if (rawLines === null) {
    return NextResponse.json({ error: "lines lipseste" }, { status: CALLBACK_CODES.rejected });
  }

  // EXT-15. O SCANARE CARE A ESUAT NU PASTREAZA NICIO LINIE.
  //
  // Regula proprietarului, din rezultatul scanarii din 2026-09-02: calea de
  // scanare a intors PATRU LINII GRESITE DIN SAPTE, fiecare consistenta aritmetic.
  // O linie marcata este tot o linie: poarta o denumire, o cantitate si un pret,
  // si sta intr-un camp de formular pe care cineva il poate accepta. Nu exista
  // nimic PE linie pe care un om sa il observe, fiindca fiecare se inmultea
  // corect. Singura randare sigura a unei linii care s-ar putea sa fie inventata
  // este NICIO linie.
  //
  // DISTINCTIA ESTE SURSA, NU ESECUL. Un document digital care esueaza ramane
  // partial cu liniile atasate, exact ca pana acum.

  for (const l of rawLines) {
    if (!l || typeof l !== "object" || !str((l as Record<string, unknown>).product_name)) {
      return NextResponse.json({ error: "o linie nu are product_name" }, { status: CALLBACK_CODES.rejected });
    }
  }

  const supabase = serviceClient();
  if (!supabase) {
    // 5xx: a cazut la noi si nu s-a scris nimic, deci Make are voie sa reincerce.
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY lipseste din mediu" },
      { status: 500 },
    );
  }

  // EXT-15. POATE BAZA SA STOCHEZE SURSA?
  //
  // Migratia 0033 este autorata, fuzionata si NEAPLICATA, deci acest cod ajunge
  // in productie inaintea coloanei. PostgREST intoarce 42703 pentru o coloana
  // necunoscuta, iar un update care o numeste ar raspunde 500 lui Make, care
  // reincearca la 5xx. Aceea este INC-05, si check:pending-schema-reads a refuzat
  // prima varianta a acestui fisier exact pentru ea.
  //
  // SONDA FOLOSESTE CLIENTUL DE SERVICE_ROLE, adica acelasi cu care se scrie mai
  // jos. O sonda pe alta legatura raspunde la alta intrebare: pe clientul de
  // sesiune ar primi un refuz RLS pe un endpoint de masina fara sesiune si ar
  // citi refuzul acela ca "coloana lipseste".
  //
  // PANA CAND COLOANA EXISTA, COMPORTAMENTUL ESTE CEL DE ASTAZI, nu cel nou. A nu
  // putea sti sursa nu inseamna `scan`: inseamna ca regula EXT-15 nu se aplica
  // inca, deci liniile se pastreaza. Implicitul `scan` din effectiveSource
  // priveste un payload care NU A DECLARAT sursa pe o baza care POATE sa o
  // pastreze, ceea ce este alta intrebare.
  const canStoreSource = await hasExtractionDocumentSource(supabase);

  // --- EXT-16. RECONCILIEREA, PE PARTEA NOASTRA ---------------------------
  //
  // ORDINEA NU ESTE O PREFERINTA. dropLines de mai jos citeste `status`, iar
  // treaba acestui card este exact sa transforme un payload `extracted` intr-unul
  // `failed`. Daca reconcilierea ar rula dupa, EXT-15 ar decide pe statusul vechi
  // si liniile inventate ar fi pastrate.
  //
  // SE APLICA NUMAI PE SCANARI. Un document digital in afara tolerantei este
  // neatins de acest card: acolo cifrele vin din text, nu dintr-o citire, si o
  // nepotrivire inseamna altceva. Cardul o spune si cazul o dovedeste.
  //
  // VALORI NOI IN LOC DE REATRIBUIRE, ca nimic de deasupra acestei linii sa nu
  // poata vedea suprascrierea si ca payload-ul ORIGINAL sa ramana citibil.
  const canFlagReconciliation = await hasReconciliationFailedCode(() =>
    supabase
      .from("extraction_drafts")
      .select("order_id")
      .eq("error_code", "reconciliation_failed")
      .limit(1),
  );
  const verdict =
    documentSource === "scan" && status === "extracted"
      ? reconcile({
          lineTotals: (rawLines as unknown[]).map(
            (l): number | null => num((l as Record<string, unknown>).line_total),
          ),
          subtotal: num(body.subtotal),
          documentTotal: num(body.document_total),
          pricesIncludeVat: bool(body.prices_include_vat),
        })
      : null;

  // POARTA, SI FARA EA NIMIC NU AR FI CERUT-O. 0034 adauga o ETICHETA DE ENUM, si
  // check:pending-schema-reads nu vede `alter type ... add value`. Scrierea
  // etichetei inaintea aplicarii da 22P02 si ruta ar raspunde 500. Cat timp baza
  // nu o cunoaste, comportamentul este cel de astazi: payload-ul se pastreaza asa
  // cum a sosit, fiindca a refuza fara a putea spune DE CE ar fi mai rau decat a
  // nu refuza.
  const reconciliationFailed = verdict !== null && !verdict.ok && canFlagReconciliation;
  const effectiveStatus = reconciliationFailed ? "failed" : status;
  const effectiveErrorCode = reconciliationFailed ? "reconciliation_failed" : errorCodeRaw;

  const dropLines =
    canStoreSource && documentSource === "scan" && effectiveStatus === "failed";

  // --- exista deja o ciorna pentru acest order_id? -------------------------
  const { data: existing, error: readError } = await supabase
    .from("extraction_drafts")
    .select("order_id, callback_at")
    .eq("order_id", orderId)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 500 });
  }
  if (!existing) {
    // Nu am trimis niciodata acest document. Nu este un esec al nostru, deci nu
    // este 5xx: este un payload despre ceva ce nu ne apartine.
    return NextResponse.json({ error: "order_id necunoscut" }, { status: CALLBACK_CODES.rejected });
  }

  // --- vocabularul de categorii, citit INAINTE de orice scriere ------------
  //
  // Contract sectiunea 4.4: category se valideaza fata de RANDURILE din
  // categories prezente la momentul extragerii, nu fata de o constanta compilata
  // undeva, fiindca lista este randuri pe care clientul le poate redenumi la
  // P2-14 fara migratie si fara cod. docs/contracts/categories.json este
  // fotografia acelei liste, nu autoritatea ei.
  //
  // CE NU SE MAPEAZA RAMANE null, SI NU SE GHICESTE. category_raw poarta oricum
  // cuvintele documentului, verbatim, deci nimic nu se pierde: se pierde doar
  // pretentia ca am recunoscut ceva ce nu am recunoscut. O valoare mapata gresit
  // ar arata pe ecran exact ca una corecta.
  //
  // Citirea sta aici, inaintea primei scrieri, ca esecul ei sa fie 5xx cu nimic
  // scris, adica exact ce spune sectiunea 6 din contract.
  const { data: categoryRows, error: categoryError } = await supabase
    .from("categories")
    .select("name")
    .eq("active", true);

  if (categoryError) {
    return NextResponse.json({ error: categoryError.message }, { status: 500 });
  }
  const knownCategories = new Set(
    (categoryRows ?? []).map((c) => String((c as { name: string }).name)),
  );

  // "Duplicat" inseamna un AL DOILEA CALLBACK, deci se citeste din callback_at,
  // care este scris numai de un callback. Statusul nu raspunde la aceeasi
  // intrebare: un rand poate avea status si nu poate avea callback_at decat
  // dupa ce a raspuns cineva. Comparatia este cu == null, care prinde si
  // undefined: un camp absent din raspuns nu inseamna "a raspuns deja".
  const isRepeat = existing.callback_at != null;

  // EXT-09. page_count intra in update NUMAI daca baza il are.
  //
  // Migratia 0032 este in registrul de asteptare, deci pe productie coloana
  // poate sa nu existe inca. Un update care o numeste primeste 42703 de la
  // PostgREST, ruta raspunde 500, iar Make REINCEARCA pe 5xx: ar fi o bucla, nu
  // un esec singular. Mai rau, contractul spune in sectiunea 6 ca un 5xx
  // inseamna ca nu s-a scris nimic, si aici nu ar fi adevarat, fiindca toate
  // celelalte campuri sunt in acelasi update.
  //
  // POARTA INTREABA PE ACEEASI LEGATURA PE CARE SE SCRIE, adica pe clientul de
  // service_role de mai sus. O sonda pe alta legatura ar raspunde la alta
  // intrebare: politicile RLS de pe extraction_drafts sunt "to authenticated",
  // deci un client de sesiune fara sesiune ar da o eroare care nu are nimic de a
  // face cu existenta coloanei.
  //
  // CAT TIMP COLOANA LIPSESTE, VALOAREA NU SE PIERDE: _meta este stocat verbatim
  // si o poarta pe el, exact ca pana acum. Ziua in care 0032 se aplica, ea incepe
  // sa fie scrisa si separat, fara alta livrare.
  const draftUpdate: Record<string, unknown> = {
    status: effectiveStatus,
    error_code: effectiveErrorCode,
    reason: str(body.reason),
    supplier_name: str(body.supplier_name),
    order_date: str(body.order_date),
    subtotal: num(body.subtotal),
    vat_amount: num(body.vat_amount),
    document_total: num(body.document_total),
    prices_include_vat: bool(body.prices_include_vat),
    vat_rate: num(body.vat_rate),
    currency: str(body.currency),
    currency_raw: str(body.currency_raw),
    // _meta ESTE STOCAT VERBATIM, INCLUSIV characters_extracted CAND SOSESTE.
    // EXT-09 scoate campul din CE ASTEPTAM, nu din ce toleram: partea lui Andre
    // si a noastra nu se desfasoara in aceeasi secunda, iar o schimbare de
    // contract care invalideaza payload-ul versiunii precedente este o pana
    // programata pentru ziua in care el livreaza primul. Campul este ignorat,
    // adica nimic nu il citeste si nimic nu il cere. Nu este si sters: _meta
    // este blocul de diagnostic, si a arunca ce a ales expeditorul sa trimita
    // pierde tocmai lucrul pentru care blocul exista.
    meta: body._meta ?? null,
    callback_at: new Date().toISOString(),
  };

  if (await hasExtractionPageCount(supabase)) {
    draftUpdate.page_count = pageCount(body._meta);
  }

  // EXT-15, folosind aceeasi poarta ca EXT-09 si din acelasi motiv. canStoreSource
  // este calculat mai sus prin hasExtractionDocumentSource, pe clientul de
  // service_role, adica pe legatura care chiar scrie.
  //
  // DOUA MIGRATII, DOUA PORTI, SI ELE NU SE INLOCUIESC UNA PE ALTA. Coloanele
  // sosesc in productie separat, fiindca sunt fisiere separate, deci fiecare
  // scriere isi intreaba propria coloana. O poarta comuna ar lega soarta lor
  // impreuna si ar ascunde exact cazul in care una este aplicata si cealalta nu.
  if (canStoreSource) {
    draftUpdate.document_source = documentSource;
  }

  const { error: updateError } = await supabase
    .from("extraction_drafts")
    .update(draftUpdate)
    .eq("order_id", orderId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Liniile se inlocuiesc ca lot: sterse si rescrise, ca o a doua sosire sa nu
  // adauge langa cele vechi. Acesta este singurul delete din tot fluxul si el
  // sterge liniile unei CIORNE, niciodata date reale.
  const { error: clearError } = await supabase
    .from("extraction_draft_lines")
    .delete()
    .eq("order_id", orderId);
  if (clearError) {
    return NextResponse.json({ error: clearError.message }, { status: 500 });
  }

  if (rawLines.length > 0 && !dropLines) {
    const rows = rawLines.map((raw, i) => {
      const l = raw as Record<string, unknown>;
      return {
        order_id: orderId,
        line_no: i + 1,
        product_name: str(l.product_name),
        quantity: num(l.quantity),
        unit: str(l.unit),
        unit_raw: str(l.unit_raw),
        unit_price: num(l.unit_price),
        line_total: num(l.line_total),
        currency: str(l.currency),
        currency_raw: str(l.currency_raw),
        category: (() => {
          const mapped = str(l.category);
          return mapped !== null && knownCategories.has(mapped) ? mapped : null;
        })(),
        category_raw: str(l.category_raw),
      };
    });
    const { error: insertError } = await supabase.from("extraction_draft_lines").insert(rows);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json(
    // CE S-A SCRIS, NU CE A SOSIT. Cand EXT-16 respinge o scanare, statusul
    // stocat este `failed` iar raspunsul trebuie sa spuna acelasi lucru: un 202
    // care raporteaza `extracted` peste un rand scris `failed` este exact
    // genul de raspuns care face ca partea cealalta sa creada ca liniile exista.
    { order_id: orderId, status: effectiveStatus, lines: dropLines ? 0 : rawLines.length },
    { status: isRepeat ? CALLBACK_CODES.duplicate : CALLBACK_CODES.accepted },
  );
}

/**
 * Citirea unei ciorne, pentru verificare.
 *
 * NU ESTE PUBLICA. Cere acelasi antet secret ca scrierea, fiindca o ciorna
 * poarta ce scria pe documentul unui furnizor: nume, preturi, termeni
 * comerciali. Un uuid ghicit nu are voie sa fie de ajuns.
 *
 * Ecranul operatorului NU trece pe aici: P2-09 citeste ciornele prin sesiunea
 * lui, sub RLS, ca orice alt ecran. Acesta este drumul masinii, si exista ca
 * linia de acceptanta sa poata verifica exact ce s-a scris.
 */
export async function GET(request: Request) {
  const expected = process.env.MAKE_CALLBACK_SECRET;
  const provided = request.headers.get("x-rc-callback-secret");
  if (
    typeof expected !== "string" ||
    expected.trim().length === 0 ||
    provided === null ||
    provided !== expected
  ) {
    return NextResponse.json({ error: "secret invalid" }, { status: CALLBACK_CODES.badSecret });
  }

  const orderId = new URL(request.url).searchParams.get("order_id");
  if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
    return NextResponse.json({ error: "order_id lipseste" }, { status: CALLBACK_CODES.rejected });
  }

  const supabase = serviceClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY lipseste din mediu" },
      { status: 500 },
    );
  }

  const { data: draft, error } = await supabase
    .from("extraction_drafts")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!draft) return NextResponse.json({ error: "necunoscut" }, { status: 404 });

  const { data: lines } = await supabase
    .from("extraction_draft_lines")
    .select("*")
    .eq("order_id", orderId)
    .order("line_no", { ascending: true });

  return NextResponse.json({ ...draft, lines: lines ?? [] }, { status: 200 });
}
