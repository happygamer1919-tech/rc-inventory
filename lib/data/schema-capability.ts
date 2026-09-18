import "server-only";

// Este schema fazei 3 aplicata pe baza pe care ruleaza aplicatia?
//
// DE CE EXISTA ACEST FISIER, SI DE CE ESTE UN DEFECT DE PRODUCTIE CE L-A ADUS.
//
// Pe 2026-08-31 platforma a cazut cu 500 pe fiecare ecran, inclusiv tabloul de
// bord. Cauza nu a fost o migratie gresita si nici o rezolvare de conflict: cele
// treisprezece migratii ale fazei 3 sunt SCRISE SI FUZIONATE dar NEAPLICATE, iar
// codul fuzionat odata cu ele citea neconditionat coloane care nu exista inca:
//
//   listProducts        -> select ..., supplier_id, ...   (adaugat de 0019)
//   listOutboundIssues  -> select ..., project_id, ...    (adaugat de 0017)
//
// PostgREST intoarce 42703 pentru o coloana inexistenta, cele doua functii arunca
// iar tabloul de bord este prima pagina care le cheama. Rapoartele spuneau, card
// dupa card, "exista in cod si nu pe site-ul viu" si tratau asta ca inofensiv.
// Nu este: CODUL este pe site-ul viu, si citea schema neconditionat.
//
// REGULA PE CARE O IMPUNE ACEST FISIER: un ecran nu are voie sa se prabuseasca
// pentru ca o migratie nu a fost inca aplicata. Ori citeste ce exista, ori spune
// romaneste ca functia nu este inca activa. Ziua in care P3-27 aplica migratiile,
// totul se aprinde singur, fara alta livrare.
//
// SONDA MERGE PRIN PostgREST SI NU PRINTR-O FUNCTIE SQL, deliberat: o functie ar
// fi ea insasi intr-o migratie neaplicata, deci nu ar putea raspunde la intrebare
// tocmai cand intrebarea conteaza.

import { createClient } from "@/lib/supabase/server";

/** Cat timp se tine minte raspunsul, in milisecunde.
 *
 *  NU LA NESFARSIT. O instanta pornita inainte de aplicare ar raspunde "nu"
 *  pentru totdeauna, iar ecranele ar ramane stinse dupa ce schema a aterizat,
 *  fara ca nimeni sa inteleaga de ce. Un minut inseamna ca aplicarea se vede
 *  singura, fara redeploy si fara repornire. */
const TTL_MS = 60_000;

let cached: { value: boolean; at: number } | null = null;

/**
 * True cand tabelele fazei 3 exista pe baza catre care arata aplicatia.
 *
 * Sonda cere UN rand din public.projects. Cand tabela lipseste, PostgREST
 * raspunde cu eroare si raspunsul este "nu". Cand tabela exista dar RLS nu lasa
 * nimic sa treaca, raspunsul este un SET GOL SI NICIO EROARE, deci "da": exact
 * distinctia care conteaza, si motivul pentru care se verifica eroarea si nu
 * numarul de randuri.
 */
export async function hasPhase3Schema(): Promise<boolean> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.value;

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("projects").select("id").limit(1);
    cached = { value: !error, at: now };
  } catch {
    // O sonda care arunca inseamna ca nu se stie, si "nu se stie" se trateaza ca
    // "nu": ecranul degradeaza in loc sa se prabuseasca, ceea ce este intreg
    // rostul acestui fisier.
    cached = { value: false, at: now };
  }
  return cached.value;
}


// ---------------------------------------------------------------------------
// EXT-15. Exista coloana extraction_drafts.document_source?
//
// DE CE ARE NEVOIE DE O POARTA PROPRIE SI NU DE hasPhase3Schema. Aceea intreaba
// daca tabelele fazei 3 sunt aplicate, ceea ce este alta intrebare: 0033 este o
// migratie separata, in asteptare, si poate fi aplicata inainte sau dupa ele.
// O poarta care raspunde la intrebarea gresita este o poarta care se deschide in
// ziua nepotrivita.
//
// FARA ACEASTA POARTA, EXT-15 AR FI FOST INC-05 DIN NOU. Codul fuzionat citeste
// si scrie o coloana pe care baza de productie nu o are inca: PostgREST intoarce
// 42703, citirea arunca, iar callback-ul raspunde 500 lui Make. Exact forma pe
// care check:pending-schema-reads o refuza, si el a refuzat-o.
//
// COMPORTAMENTUL DINAINTE DE APLICARE ESTE CEL DE ASTAZI, NU CEL NOU. Cand
// coloana lipseste nu se stie sursa, iar a nu sti nu inseamna `scan`: inseamna
// ca regula EXT-15 nu se aplica inca. Liniile se pastreaza exact ca pana acum.
// Implicitul `scan` din effectiveSource este pentru un payload care NU A DECLARAT
// sursa pe o baza care POATE sa o stocheze, ceea ce este alt lucru.
//
// SONDA MERGE PE COLOANA, prin PostgREST, din acelasi motiv pentru care sonda de
// mai sus merge pe o tabela si nu pe o functie: o functie ar fi ea insasi
// intr-o migratie neaplicata.

// EXT-09. Exista coloana extraction_drafts.page_count?
//
// DE CE ARE NEVOIE DE O POARTA PROPRIE SI NU DE hasPhase3Schema. Aceea intreaba
// daca TABELELE fazei 3 sunt aplicate, ceea ce este alta intrebare: 0032 este o
// migratie separata, aflata in registrul de asteptare, si poate fi aplicata
// inainte sau dupa ele. O poarta care raspunde la intrebarea gresita este o
// poarta care se deschide in ziua nepotrivita, si o poarta importata numai ca sa
// treaca o verificare este mai rea decat lipsa ei: verificarea devine verde iar
// codul ramane exact la fel de expus.
//
// FARA ACEASTA POARTA, EXT-09 AR FI FOST INC-05 DIN NOU. Ruta de callback ar
// scrie o coloana pe care baza de productie nu o are inca, PostgREST intoarce
// 42703, iar raspunsul catre Make devine 500. Make REINCEARCA pe 5xx, deci nu ar
// fi un esec singular ci o bucla, si contractul spune in sectiunea 6 ca un 5xx
// inseamna ca nu s-a scris nimic, ceea ce nu ar mai fi adevarat: restul
// campurilor s-ar fi scris in acelasi update.
//
// COMPORTAMENTUL DINAINTE DE APLICARE ESTE CEL DE ASTAZI. Cand coloana lipseste,
// numarul de pagini raportat de model nu se pierde: ramane in _meta, care este
// stocat verbatim si care il purta si pana acum. Nu se stie doar ca valoare de
// sine statatoare, iar a nu sti nu inseamna zero.

type ColumnProbe = {
  from: (table: string) => {
    select: (columns: string) => { limit: (n: number) => PromiseLike<{ error: unknown }> };
  };
};

let cachedDocumentSource: { value: boolean; at: number } | null = null;

/**
 * @param client clientul CU CARE VA CITI APELANTUL, si acesta este intregul
 *   motiv pentru care functia ia un parametru.
 *
 *   Prima varianta isi facea singura un client de sesiune. In ruta de callback nu
 *   exista sesiune, fiindca este un endpoint de masina autentificat printr-un
 *   antet secret, iar politicile RLS de pe extraction_drafts sunt "to
 *   authenticated": sonda primea o eroare care nu avea nimic de a face cu
 *   existenta coloanei, o citea ca "coloana lipseste", si poarta raspundea NU
 *   pentru totdeauna acolo unde conteaza cel mai mult.
 *
 *   O sonda care intreaba pe alta legatura decat cea care va citi raspunde la
 *   alta intrebare. Aceasta o ia pe a apelantului.
 */
export async function hasExtractionDocumentSource(client: ColumnProbe): Promise<boolean> {
  const now = Date.now();
  if (cachedDocumentSource && now - cachedDocumentSource.at < TTL_MS) return cachedDocumentSource.value;

  try {
    const { error } = await client.from("extraction_drafts").select("document_source").limit(1);
    cachedDocumentSource = { value: !error, at: now };
  } catch {
    cachedDocumentSource = { value: false, at: now };
  }
  return cachedDocumentSource.value;
}

let cachedPageCount: { value: boolean; at: number } | null = null;

/**
 * @param client clientul CU CARE VA SCRIE APELANTUL, si acesta este intregul
 *   motiv pentru care functia ia un parametru in loc sa isi faca singura unul.
 *
 *   In ruta de callback nu exista sesiune: este un endpoint de masina,
 *   autentificat printr-un antet secret, si scrie cu cheia de service_role.
 *   Politicile RLS de pe extraction_drafts sunt "to authenticated", deci o sonda
 *   care si-ar face singura un client de sesiune ar primi o eroare care nu are
 *   nimic de a face cu existenta coloanei, ar citi-o ca "coloana lipseste", si
 *   poarta ar raspunde NU pentru totdeauna exact acolo unde conteaza.
 *
 *   O sonda care intreaba pe alta legatura decat cea care va scrie raspunde la
 *   alta intrebare. Aceasta o ia pe a apelantului.
 */
export async function hasExtractionPageCount(client: ColumnProbe): Promise<boolean> {
  const now = Date.now();
  if (cachedPageCount && now - cachedPageCount.at < TTL_MS) return cachedPageCount.value;

  try {
    const { error } = await client.from("extraction_drafts").select("page_count").limit(1);
    cachedPageCount = { value: !error, at: now };
  } catch {
    // O sonda care arunca inseamna ca nu se stie, si "nu se stie" se trateaza ca
    // "nu": se scrie fara coloana, in loc sa se incerce si sa se cada.
    cachedPageCount = { value: false, at: now };
  }
  return cachedPageCount.value;
}


// ---------------------------------------------------------------------------
// EXT-28. Exista coloana extraction_drafts.upload_page_count?
//
// POARTA PROPRIE, SI NU CEA DE MAI SUS. hasExtractionPageCount raspunde despre
// 0032, adica despre numarul raportat DE MODEL. 0043 este un fisier separat, cu
// numarul NUMARAT DE NOI, si ajunge in productie pe fuziune, prin aplicatia
// GitHub a Supabase, in aproximativ doua minute. Codul pleaca din acelasi push si
// nu aterizeaza in aceeasi secunda.
//
// FARA EA, FEREASTRA ACEEA ESTE INC-05 DIN NOU, SI MAI RAU DECAT UN ECRAN.
// Upsert-ul din fireExtraction ar numi coloana, PostgREST ar raspunde 42703, si
// niciun document nu ar mai pleca spre extragere; lista de verificare ar cere
// coloana si /incarca-comanda ar raspunde 500.
//
// COMPORTAMENTUL DINAINTE DE APLICARE ESTE CEL DE ASTAZI: nu se stocheaza si nu
// se arata niciun numar. Webhook-ul il poarta oricum, fiindca el vine din bytes.
// ---------------------------------------------------------------------------

let cachedUploadPageCount: { value: boolean; at: number } | null = null;

/**
 * @param client clientul CU CARE VA CITI SAU VA SCRIE APELANTUL, din acelasi
 *   motiv ca la celelalte porti: o sonda care intreaba pe alta legatura decat
 *   cea care va lucra raspunde la alta intrebare.
 */
export async function hasExtractionUploadPageCount(client: ColumnProbe): Promise<boolean> {
  const now = Date.now();
  if (cachedUploadPageCount && now - cachedUploadPageCount.at < TTL_MS) {
    return cachedUploadPageCount.value;
  }
  try {
    const { error } = await client.from("extraction_drafts").select("upload_page_count").limit(1);
    cachedUploadPageCount = { value: !error, at: now };
  } catch {
    // "Nu se stie" se trateaza ca "nu": se lucreaza fara coloana, in loc sa se cada.
    cachedUploadPageCount = { value: false, at: now };
  }
  return cachedUploadPageCount.value;
}


// ---------------------------------------------------------------------------
// EXT-16. Cunoaste baza eticheta reconciliation_failed?
//
// DE CE ARE NEVOIE DE O POARTA, SI DE CE NIMIC NU AR FI CERUT-O. Migratia 0034
// adauga o ETICHETA DE ENUM, iar check:pending-schema-reads nu vede asa ceva:
// objectsAddedBy cauta `create table`, `alter table ... add column` si
// `create function`, si nimic altceva. O adaugare de enum ii este INVIZIBILA.
//
// Deci nicio verificare nu ar fi refuzat un cod care scrie eticheta inaintea
// aplicarii, iar PostgreSQL ar fi raspuns 22P02, invalid input value for enum,
// pe calea de callback. Make reincearca pe 5xx si nu pe 4xx, dar un 22P02
// nemanevrat iese ca 500, deci ar fi fost o bucla. Poarta este aici FIINDCA
// LIPSA EI NU AR FI FOST PRINSA, nu fiindca o verificare a cerut-o. Golul din
// check:pending-schema-reads are cardul lui.
//
// SONDA NU POATE CITI pg_enum PRIN PostgREST, deci intreaba altfel: cere randuri
// FILTRATE pe eticheta. O eticheta necunoscuta face PostgREST sa respinga
// filtrul, ceea ce este exact intrebarea pusa, si un set gol fara eroare
// inseamna ca eticheta exista si nu o poarta niciun rand.

// SONDA ESTE UN THUNK, NU UN CLIENT, SI MOTIVUL ESTE TIPUL. Celelalte doua porti
// primesc clientul si il descriu structural, fiindca `.from().select().limit()`
// se potriveste usor. Lantul de aici are un `.eq()` in plus, iar constructorul de
// filtre din supabase-js este recursiv: TypeScript raspunde TS2589, "type
// instantiation is excessively deep", si REFUZA SA COMPILEZE. Un `any` ar fi
// ascuns exact intrebarea pe care poarta o pune.
//
// Asa, decizia despre ce inseamna "baza cunoaste eticheta" ramane in acest
// fisier, iar interogarea sta la apelant, unde tipurile clientului functioneaza
// deja.
type LabelProbe = () => PromiseLike<{ error: unknown }>;

let cachedReconciliationCode: { value: boolean; at: number } | null = null;

/**
 * @param client clientul CU CARE VA SCRIE APELANTUL, din acelasi motiv ca la
 *   celelalte doua porti: politicile RLS de pe extraction_drafts sunt
 *   "to authenticated", iar ruta de callback scrie cu cheia de service_role.
 */
export async function hasReconciliationFailedCode(probe: LabelProbe): Promise<boolean> {
  const now = Date.now();
  if (cachedReconciliationCode && now - cachedReconciliationCode.at < TTL_MS) {
    return cachedReconciliationCode.value;
  }
  try {
    const { error } = await probe();
    cachedReconciliationCode = { value: !error, at: now };
  } catch {
    cachedReconciliationCode = { value: false, at: now };
  }
  return cachedReconciliationCode.value;
}


// ---------------------------------------------------------------------------
// EXT-28. Cunoaste baza eticheta document_too_large?
//
// ACEEASI FORMA CA POARTA DE MAI SUS SI ACELASI MOTIV. 0042 adauga o ETICHETA DE
// ENUM, pe care check:pending-schema-reads nu o vede, iar scrierea ei inaintea
// aplicarii da 22P02. Pe calea de incarcare asta ar insemna un refuz care nu se
// poate scrie: ciorna ar ramane "in lucru" pentru totdeauna, fara motiv.
//
// COMPORTAMENTUL DINAINTE DE APLICARE ESTE CEL DE ASTAZI: documentul pleaca spre
// extragere, iar plafonul celeilalte parti ramane singurul.
// ---------------------------------------------------------------------------

let cachedDocumentTooLargeCode: { value: boolean; at: number } | null = null;

export async function hasDocumentTooLargeCode(probe: LabelProbe): Promise<boolean> {
  const now = Date.now();
  if (cachedDocumentTooLargeCode && now - cachedDocumentTooLargeCode.at < TTL_MS) {
    return cachedDocumentTooLargeCode.value;
  }
  try {
    const { error } = await probe();
    cachedDocumentTooLargeCode = { value: !error, at: now };
  } catch {
    cachedDocumentTooLargeCode = { value: false, at: now };
  }
  return cachedDocumentTooLargeCode.value;
}


// ---------------------------------------------------------------------------
// P3-71. Cunoaste baza eticheta config_error?
//
// ACEEASI FORMA CA CELE DOUA PORTI DE MAI SUS SI ACELASI MOTIV. 0051 adauga o
// ETICHETA DE ENUM, pe care check:pending-schema-reads nu o vede, iar scrierea ei
// inaintea aplicarii da 22P02.
//
// CE SE INTAMPLA CAND POARTA SPUNE NU ESTE ALTFEL DECAT LA document_too_large, SI
// DIFERENTA ESTE DELIBERATA. Acolo, cand eticheta lipseste, refuzul nu mai are
// loc deloc: documentul pleaca, si plafonul celeilalte parti ramane singurul.
// Aici nu exista asa ceva de ales. MAKE_WEBHOOK_URL chiar lipseste, documentul
// chiar nu poate pleca, si singura intrebare este daca omul afla sau nu. In
// fereastra de doua minute dinaintea aplicarii se scrie acelasi rand, cu acelasi
// motiv romanesc, sub eticheta `download_failed`, care este exact ce scriu deja
// apelantii pentru orice esec fara cod propriu. Codul este atunci mai general
// decat adevarul; tacerea ar fi fost defectul pe care acest card il repara.
// ---------------------------------------------------------------------------

let cachedConfigErrorCode: { value: boolean; at: number } | null = null;

export async function hasConfigErrorCode(probe: LabelProbe): Promise<boolean> {
  const now = Date.now();
  if (cachedConfigErrorCode && now - cachedConfigErrorCode.at < TTL_MS) {
    return cachedConfigErrorCode.value;
  }
  try {
    const { error } = await probe();
    cachedConfigErrorCode = { value: !error, at: now };
  } catch {
    cachedConfigErrorCode = { value: false, at: now };
  }
  return cachedConfigErrorCode.value;
}


// ---------------------------------------------------------------------------
// EXT-10. Exista coloanele products.package_unit si products.package_factor?
//
// DE CE ARE NEVOIE DE O POARTA PROPRIE. hasPhase3Schema intreaba daca TABELELE
// fazei 3 exista, ceea ce este alta intrebare: 0035 este o migratie separata si
// ajunge in productie pe fuziune, prin aplicatia GitHub a Supabase, in aproximativ
// doua minute. Livrarea codului si aplicarea migratiei pleaca din acelasi push si
// NU se termina in aceeasi secunda, deci exista o fereastra in care codul nou
// ruleaza peste schema veche.
//
// FARA ACEASTA POARTA, FEREASTRA ACEEA ESTE INC-05 DIN NOU. listProducts este
// chemata de tabloul de bord, de inventar si de fiecare formular care alege un
// produs. Un `select` care numeste o coloana inexistenta primeste 42703 de la
// PostgREST, functia arunca, si sase ecrane raspund 500 pana cand migratia
// ateriza. Costul portii este o interogare pe minut; costul lipsei ei l-am
// platit deja o data.
//
// SONDA MERGE PE COLOANA, prin PostgREST, din acelasi motiv ca celelalte: o
// functie SQL ar fi ea insasi intr-o migratie care poate lipsi.

let cachedProductPackaging: { value: boolean; at: number } | null = null;

/**
 * @param client clientul CU CARE VA CITI SAU VA SCRIE APELANTUL, din acelasi
 *   motiv ca la celelalte porti: o sonda care intreaba pe alta legatura decat
 *   cea care va lucra raspunde la alta intrebare.
 */
export async function hasProductPackaging(client: ColumnProbe): Promise<boolean> {
  const now = Date.now();
  if (cachedProductPackaging && now - cachedProductPackaging.at < TTL_MS) {
    return cachedProductPackaging.value;
  }
  try {
    const { error } = await client.from("products").select("package_unit").limit(1);
    cachedProductPackaging = { value: !error, at: now };
  } catch {
    // "Nu se stie" se trateaza ca "nu": ecranul citeste ce exista, in loc sa cada.
    cachedProductPackaging = { value: false, at: now };
  }
  return cachedProductPackaging.value;
}


// ---------------------------------------------------------------------------
// EXT-11. Exista coloanele order_ref si order_ref_series?
//
// DE CE ARE POARTA EI SI NU O IMPARTE CU CELELALTE. Migratia 0036 este un fisier
// separat si ajunge in productie pe fuziune, prin aplicatia GitHub a Supabase,
// in aproximativ doua minute. Livrarea codului si aplicarea migratiei pleaca din
// acelasi push si NU se termina in aceeasi secunda, deci exista o fereastra in
// care codul nou ruleaza peste schema veche. O poarta comuna cu 0032 sau 0033 ar
// lega soarta a doua migratii care sosesc separat si ar ascunde exact cazul in
// care una este aplicata si cealalta nu.
//
// FARA EA, FEREASTRA ACEEA ESTE INC-05 DIN NOU. Ruta de callback ar scrie o
// coloana pe care baza nu o are inca, PostgREST intoarce 42703, iar raspunsul
// catre Make devine 500. Make REINCEARCA pe 5xx, deci nu ar fi un esec singular
// ci o bucla, si sectiunea 6 din contract spune ca un 5xx inseamna ca nu s-a
// scris nimic, ceea ce nu ar mai fi adevarat: restul campurilor sunt in acelasi
// update.
//
// O SINGURA SONDA PENTRU AMANDOUA COLOANELE, si aici este invers fata de
// paragraful de mai sus, deliberat: 0036 le adauga pe amandoua in ACEEASI
// tranzactie, deci nu exista stare in care una exista si cealalta nu. Doua sonde
// ar pune de doua ori aceeasi intrebare si ar costa doua interogari pe minut ca
// sa afle acelasi lucru.
//
// SE INTREABA order_ref_series SI NU order_ref, fiindca ea este coloana pe care
// o adauga acest card si singura care nu putea exista dinainte sub alt nume.

let cachedSupplierDocumentRef: { value: boolean; at: number } | null = null;

/**
 * @param client clientul CU CARE VA CITI SAU VA SCRIE APELANTUL, din acelasi
 *   motiv ca la celelalte porti: politicile RLS de pe extraction_drafts sunt
 *   "to authenticated", ruta de callback scrie cu cheia de service_role, si o
 *   sonda care intreaba pe alta legatura decat cea care va lucra raspunde la
 *   alta intrebare.
 */
export async function hasSupplierDocumentRef(client: ColumnProbe): Promise<boolean> {
  const now = Date.now();
  if (cachedSupplierDocumentRef && now - cachedSupplierDocumentRef.at < TTL_MS) {
    return cachedSupplierDocumentRef.value;
  }
  try {
    const { error } = await client.from("extraction_drafts").select("order_ref_series").limit(1);
    cachedSupplierDocumentRef = { value: !error, at: now };
  } catch {
    // "Nu se stie" se trateaza ca "nu": se scrie fara coloane, in loc sa se
    // incerce si sa se cada.
    cachedSupplierDocumentRef = { value: false, at: now };
  }
  return cachedSupplierDocumentRef.value;
}


// ---------------------------------------------------------------------------
// EXT-26. Exista coloanele extraction_drafts.platform_error_code si platform_arm?
//
// ACEEASI FORMA CA EXT-09 SI EXT-15, SI DIN ACELASI MOTIV. 0037 este o migratie
// separata. Codul fuzioneaza in aceeasi secunda in care fisierul fuzioneaza, iar
// integrarea Supabase aplica migratia dupa vreo doua minute: in fereastra aceea
// coloanele nu exista. Un update care le numeste primeste 42703 de la PostgREST,
// ruta raspunde 500, si Make REINCEARCA pe 5xx. Aceea este INC-05.
//
// O SINGURA POARTA PENTRU AMANDOUA COLOANELE, si aici asta ESTE corect, spre
// deosebire de 0032 si 0033 care au primit porti separate. Motivul este ca
// diferă: cele doua coloane sosesc IN ACELASI FISIER DE MIGRATIE, deci nu pot
// fi aplicate una fara cealalta. Doua porti ar sugera unui cititor ca exista o
// stare in care una este prezenta si cealalta nu, si acea stare nu exista.
//
// SONDA CERE AMANDOUA COLOANELE INTR-UN SINGUR SELECT, ca raspunsul sa fie
// despre perechea pe care o scriem si nu despre una dintre ele.
// ---------------------------------------------------------------------------

let cachedPlatformVerdict: { value: boolean; at: number } | null = null;

export async function hasExtractionPlatformVerdict(client: ColumnProbe): Promise<boolean> {
  const now = Date.now();
  if (cachedPlatformVerdict && now - cachedPlatformVerdict.at < TTL_MS) {
    return cachedPlatformVerdict.value;
  }

  try {
    const { error } = await client
      .from("extraction_drafts")
      .select("platform_error_code, platform_arm")
      .limit(1);
    cachedPlatformVerdict = { value: !error, at: now };
  } catch {
    // O sonda care arunca inseamna ca nu se stie, si "nu se stie" se trateaza ca
    // "nu": se scrie fara coloane, in loc sa se incerce si sa se cada.
    cachedPlatformVerdict = { value: false, at: now };
  }
  return cachedPlatformVerdict.value;
}


// ---------------------------------------------------------------------------
// P3-75. Exista coloanele aritmeticii pe linie?
//
//   extraction_draft_lines.platform_math_outcome, platform_math_diff
//   extraction_drafts.platform_line_math_failed
//
// ACEEASI FORMA CA EXT-26 SI DIN ACELASI MOTIV. 0052 aterizeaza pe productie
// prin integrarea Supabase la vreo doua minute dupa fuziune, iar codul pleaca din
// acelasi push. In fereastra aceea un insert care numeste o coloana necunoscuta
// primeste 42703, ruta raspunde 500, si Make REINCEARCA pe 5xx: INC-05.
//
// O SINGURA POARTA PENTRU CELE TREI COLOANE, fiindca sosesc in acelasi fisier de
// migratie. Doua tabele inseamna doua sonde, si poarta spune da NUMAI cand
// amandoua raspund: o jumatate prezenta nu este o stare pe care o scriem.
//
// COMPORTAMENTUL DINAINTE DE APLICARE ESTE CEL DE ASTAZI: ruta scrie exact ce
// scria, fara cele trei coloane.
// ---------------------------------------------------------------------------

let cachedLineMath: { value: boolean; at: number } | null = null;

export async function hasExtractionLineMath(client: ColumnProbe): Promise<boolean> {
  const now = Date.now();
  if (cachedLineMath && now - cachedLineMath.at < TTL_MS) return cachedLineMath.value;

  try {
    const lines = await client
      .from("extraction_draft_lines")
      .select("platform_math_outcome, platform_math_diff")
      .limit(1);
    const drafts = await client
      .from("extraction_drafts")
      .select("platform_line_math_failed")
      .limit(1);
    cachedLineMath = { value: !lines.error && !drafts.error, at: now };
  } catch {
    // "Nu se stie" se trateaza ca "nu": se scrie fara coloane, in loc sa se
    // incerce si sa se cada.
    cachedLineMath = { value: false, at: now };
  }
  return cachedLineMath.value;
}


// ---------------------------------------------------------------------------
// EXT-34. Exista cele cinci coloane primite de la expeditor?
//
//   extraction_drafts.document_type, client_ref
//   extraction_draft_lines.supplier_code, description, line_total_source
//
// ACEEASI FORMA CA P3-75 SI DIN ACELASI MOTIV. 0053 aterizeaza pe productie prin
// integrarea Supabase la vreo doua minute dupa fuziune, iar codul pleaca din
// acelasi push. In fereastra aceea un update sau un insert care numeste o
// coloana necunoscuta primeste 42703, ruta raspunde 500, si Make REINCEARCA pe
// 5xx: INC-05.
//
// O SINGURA POARTA PENTRU CELE CINCI COLOANE, fiindca sosesc in acelasi fisier de
// migratie, deci nu exista stare in care unele exista si altele nu. Doua tabele
// inseamna doua sonde, si poarta spune da NUMAI cand amandoua raspund.
//
// COMPORTAMENTUL DINAINTE DE APLICARE ESTE CEL DE ASTAZI: ruta scrie exact ce
// scria, iar cele cinci campuri sunt acceptate si ignorate, ca pana acum.
// ---------------------------------------------------------------------------

let cachedInboundFields: { value: boolean; at: number } | null = null;

/**
 * @param client clientul CU CARE VA CITI SAU VA SCRIE APELANTUL, din acelasi
 *   motiv ca la celelalte porti: ruta de callback scrie cu cheia de
 *   service_role, ecranul citeste prin sesiune, si o sonda care intreaba pe alta
 *   legatura decat cea care va lucra raspunde la alta intrebare.
 */
export async function hasExtractionInboundFields(client: ColumnProbe): Promise<boolean> {
  const now = Date.now();
  if (cachedInboundFields && now - cachedInboundFields.at < TTL_MS) return cachedInboundFields.value;

  try {
    const drafts = await client
      .from("extraction_drafts")
      .select("document_type, client_ref")
      .limit(1);
    const lines = await client
      .from("extraction_draft_lines")
      .select("supplier_code, description, line_total_source")
      .limit(1);
    cachedInboundFields = { value: !drafts.error && !lines.error, at: now };
  } catch {
    // "Nu se stie" se trateaza ca "nu": se scrie fara coloane, in loc sa se
    // incerce si sa se cada.
    cachedInboundFields = { value: false, at: now };
  }
  return cachedInboundFields.value;
}


// ---------------------------------------------------------------------------
// P3-43. Exista coloanele clients.stage si clients.follow_up_date?
//
// DE CE ARE POARTA EI, SI DE CE hasPhase3Schema NU AJUNGE. Aceea sondeaza doar
// public.projects, deci raspunde "da" si pe o baza fara etapa clientului. 0039
// este un fisier separat si ajunge in productie pe fuziune, prin aplicatia GitHub
// a Supabase, in aproximativ doua minute. Codul pleaca din acelasi push si NU
// aterizeaza in aceeasi secunda, deci exista o fereastra in care codul nou
// ruleaza peste schema veche.
//
// FARA EA, FEREASTRA ACEEA ESTE INC-05 DIN NOU. Fisa clientului ar cere `stage`,
// PostgREST ar intoarce 42703, getClient ar intoarce null, si fiecare fisa de
// client ar raspunde 404 pana cand migratia ateriza. Formularul ar scrie o
// coloana care nu exista si fiecare salvare ar esua.
//
// COMPORTAMENTUL DINAINTE DE APLICARE ESTE CEL DE ASTAZI. Cand coloanele lipsesc,
// fisa nu arata etapa, formularul nu o ofera, iar scrierile nu o ating.
//
// O SINGURA POARTA PENTRU AMANDOUA COLOANELE, din motivul scris la EXT-26: sosesc
// in acelasi fisier de migratie, deci nu exista stare in care una exista si
// cealalta nu. Sonda le cere pe amandoua intr-un singur select.
// ---------------------------------------------------------------------------

let cachedClientStage: { value: boolean; at: number } | null = null;

/**
 * @param client clientul CU CARE VA CITI SAU VA SCRIE APELANTUL, din acelasi
 *   motiv ca la celelalte porti: o sonda care intreaba pe alta legatura decat
 *   cea care va lucra raspunde la alta intrebare.
 */
export async function hasClientStage(client: ColumnProbe): Promise<boolean> {
  const now = Date.now();
  if (cachedClientStage && now - cachedClientStage.at < TTL_MS) {
    return cachedClientStage.value;
  }
  try {
    const { error } = await client.from("clients").select("stage, follow_up_date").limit(1);
    cachedClientStage = { value: !error, at: now };
  } catch {
    // "Nu se stie" se trateaza ca "nu": ecranul arata ce exista azi, in loc sa cada.
    cachedClientStage = { value: false, at: now };
  }
  return cachedClientStage.value;
}


// ---------------------------------------------------------------------------
// P3-45. Exista migratia 0040: coloanele clients.source, interest si owner_id, si
// functiile listei de leaduri?
//
// DE CE ARE POARTA EI SI NU O IMPARTE CU hasClientStage. Aceea raspunde despre
// 0039, care este deja aplicata. 0040 este un fisier separat si ajunge in
// productie pe fuziune, prin aplicatia GitHub a Supabase, in aproximativ doua
// minute. Codul pleaca din acelasi push si NU aterizeaza in aceeasi secunda, deci
// exista o fereastra in care codul nou ruleaza peste schema veche.
//
// FARA EA, FEREASTRA ACEEA ESTE INC-05 DIN NOU. Lista de clienti ar chema
// search_clients_by_stage, PostgREST ar raspunde ca functia nu exista, listClients
// ar arunca, si /clienti ar raspunde 500 pana cand migratia ateriza. Formularul de
// lead ar scrie coloane care nu exista.
//
// COMPORTAMENTUL DINAINTE DE APLICARE ESTE CEL DE ASTAZI. Cand poarta spune nu,
// lista merge prin search_clients din 0020, fara vederi si fara cipuri, iar
// butonul de lead nou nu apare.
//
// O SINGURA SONDA PENTRU TOT FISIERUL, din motivul scris la EXT-26: coloanele si
// functiile sosesc in aceeasi tranzactie, deci nu exista stare in care unele
// exista si celelalte nu. Sonda cere cele trei coloane intr-un singur select.
// ---------------------------------------------------------------------------

let cachedClientLeaduri: { value: boolean; at: number } | null = null;

/**
 * @param client clientul CU CARE VA CITI SAU VA SCRIE APELANTUL, din acelasi
 *   motiv ca la celelalte porti: o sonda care intreaba pe alta legatura decat
 *   cea care va lucra raspunde la alta intrebare.
 */
export async function hasClientLeaduri(client: ColumnProbe): Promise<boolean> {
  const now = Date.now();
  if (cachedClientLeaduri && now - cachedClientLeaduri.at < TTL_MS) {
    return cachedClientLeaduri.value;
  }
  try {
    const { error } = await client.from("clients").select("source, interest, owner_id").limit(1);
    cachedClientLeaduri = { value: !error, at: now };
  } catch {
    // "Nu se stie" se trateaza ca "nu": lista merge pe calea de azi, in loc sa cada.
    cachedClientLeaduri = { value: false, at: now };
  }
  return cachedClientLeaduri.value;
}


// ---------------------------------------------------------------------------
// P3-15. Exista migratia 0044: tabela public.documents?
//
// DE CE ARE POARTA EI. 0044 ajunge in productie pe fuziune, prin aplicatia GitHub
// a Supabase, in aproximativ doua minute, iar codul filei Documente pleaca din
// acelasi push. In fereastra aceea PostgREST ar raspunde ca tabela nu exista.
//
// COMPORTAMENTUL DINAINTE DE APLICARE: fila Documente spune romaneste ca
// documentele nu sunt inca active, fara buton de incarcare. Restul fisei nu se
// schimba. Tabela, jurnalul stergerilor si politicile sosesc in aceeasi
// tranzactie, deci o singura sonda pe tabela ajunge.
// ---------------------------------------------------------------------------

let cachedDocuments: { value: boolean; at: number } | null = null;

/**
 * @param client clientul CU CARE VA CITI SAU VA SCRIE APELANTUL, din acelasi
 *   motiv ca la celelalte porti.
 */
export async function hasDocuments(client: ColumnProbe): Promise<boolean> {
  const now = Date.now();
  if (cachedDocuments && now - cachedDocuments.at < TTL_MS) return cachedDocuments.value;
  try {
    const { error } = await client.from("documents").select("id").limit(1);
    cachedDocuments = { value: !error, at: now };
  } catch {
    cachedDocuments = { value: false, at: now };
  }
  return cachedDocuments.value;
}


// ---------------------------------------------------------------------------
// P3-56. Exista migratia 0045: coloana products.image_path?
//
// DE CE ARE POARTA EI SI NU O IMPARTE CU hasProductPackaging. Aceea raspunde
// despre 0035. 0045 este un fisier separat si ajunge in productie pe fuziune, prin
// aplicatia GitHub a Supabase, in aproximativ doua minute, iar codul pleaca din
// acelasi push si NU aterizeaza in aceeasi secunda.
//
// FARA EA, FEREASTRA ACEEA ESTE INC-05 DIN NOU. Panoul produsului ar cere
// image_path, PostgREST ar raspunde 42703, iar salvarea imaginii ar scrie o
// coloana care nu exista.
//
// COMPORTAMENTUL DINAINTE DE APLICARE ESTE CEL DE ASTAZI: formularul nu arata
// campul de imagine, panoul nu arata blocul de imagine. Coloana, constrangerea si
// politica sosesc in aceeasi tranzactie, deci o singura sonda pe coloana ajunge.
// ---------------------------------------------------------------------------

let cachedProductImage: { value: boolean; at: number } | null = null;

/**
 * @param client clientul CU CARE VA CITI SAU VA SCRIE APELANTUL, din acelasi
 *   motiv ca la celelalte porti.
 */
export async function hasProductImage(client: ColumnProbe): Promise<boolean> {
  const now = Date.now();
  if (cachedProductImage && now - cachedProductImage.at < TTL_MS) return cachedProductImage.value;
  try {
    const { error } = await client.from("products").select("image_path").limit(1);
    cachedProductImage = { value: !error, at: now };
  } catch {
    // "Nu se stie" se trateaza ca "nu": ecranul arata ce exista azi, in loc sa cada.
    cachedProductImage = { value: false, at: now };
  }
  return cachedProductImage.value;
}


// ---------------------------------------------------------------------------
// P3-57. Exista migratia 0046: tabela public.sheet_options si coloanele
// products.sheet_model, sheet_series, sheet_thickness_mm si sheet_finish?
//
// DE CE ARE POARTA EI SI NU O IMPARTE CU hasProductImage. Aceea raspunde despre
// 0045. 0046 este un fisier separat si ajunge in productie pe fuziune, prin
// aplicatia GitHub a Supabase, in aproximativ doua minute, iar codul pleaca din
// acelasi push si NU aterizeaza in aceeasi secunda.
//
// FARA EA, FEREASTRA ACEEA ESTE INC-05 DIN NOU. Pagina de inventar ar cere lista
// de combinatii, PostgREST ar raspunde ca tabela nu exista, iar salvarea unui
// produs ales din lista ar scrie coloane care nu exista.
//
// COMPORTAMENTUL DINAINTE DE APLICARE ESTE CEL DE ASTAZI: formularul nu arata
// alegerea de model, serie si grosime. Tabela, coloanele si constrangerile sosesc
// in aceeasi tranzactie, deci o singura sonda, pe cele patru coloane, ajunge.
// ---------------------------------------------------------------------------

let cachedSheetOptions: { value: boolean; at: number } | null = null;

/**
 * @param client clientul CU CARE VA CITI SAU VA SCRIE APELANTUL, din acelasi
 *   motiv ca la celelalte porti.
 */
export async function hasSheetOptions(client: ColumnProbe): Promise<boolean> {
  const now = Date.now();
  if (cachedSheetOptions && now - cachedSheetOptions.at < TTL_MS) return cachedSheetOptions.value;
  try {
    const { error } = await client
      .from("products")
      .select("sheet_model, sheet_series, sheet_thickness_mm, sheet_finish")
      .limit(1);
    cachedSheetOptions = { value: !error, at: now };
  } catch {
    // "Nu se stie" se trateaza ca "nu": formularul arata ce exista azi, in loc sa cada.
    cachedSheetOptions = { value: false, at: now };
  }
  return cachedSheetOptions.value;
}


// ---------------------------------------------------------------------------
// P3-58. Exista migratia 0047: tabela public.sheet_prices?
//
// DE CE ARE POARTA EI SI NU O IMPARTE CU hasSheetOptions. Aceea raspunde despre
// 0046, care este deja fuzionata. 0047 este un fisier separat si ajunge in
// productie pe fuziune, prin aplicatia GitHub a Supabase, in aproximativ doua
// minute, iar codul pleaca din acelasi push si NU aterizeaza in aceeasi secunda.
// O poarta comuna ar lega soarta a doua migratii care sosesc separat.
//
// FARA EA, FEREASTRA ACEEA ESTE INC-05 DIN NOU. Pagina de inventar ar cere lista
// de preturi, PostgREST ar raspunde ca tabela nu exista, citirea ar arunca si
// intreg inventarul ar raspunde 500, pentru un camp pe care operatorul il poate
// completa si singur.
//
// COMPORTAMENTUL DINAINTE DE APLICARE ESTE CEL DE ASTAZI: alegerea de model,
// serie si grosime completeaza denumirea, unitatea, categoria si furnizorul, iar
// valoarea unitara ramane de scris de mana. Tabela, politica si cele 194 de
// preturi sosesc in aceeasi tranzactie, deci o singura sonda pe tabela ajunge.
// ---------------------------------------------------------------------------

let cachedSheetPrices: { value: boolean; at: number } | null = null;

/**
 * @param client clientul CU CARE VA CITI APELANTUL, din acelasi motiv ca la
 *   celelalte porti.
 */
export async function hasSheetPrices(client: ColumnProbe): Promise<boolean> {
  const now = Date.now();
  if (cachedSheetPrices && now - cachedSheetPrices.at < TTL_MS) return cachedSheetPrices.value;
  try {
    const { error } = await client.from("sheet_prices").select("price_lei").limit(1);
    cachedSheetPrices = { value: !error, at: now };
  } catch {
    // "Nu se stie" se trateaza ca "nu": pretul nu se sugereaza, in loc sa cada ecranul.
    cachedSheetPrices = { value: false, at: now };
  }
  return cachedSheetPrices.value;
}


// ---------------------------------------------------------------------------
// P3-68. Exista migratia 0048: coloana sheet_options.retired_at si scrierile
// proprietarului pe sheet_options si sheet_prices?
//
// DE CE ARE POARTA EI SI NU O IMPARTE CU hasSheetOptions. Aceea raspunde despre
// 0046. 0048 este un fisier separat si ajunge in productie pe fuziune, prin
// aplicatia GitHub a Supabase, in aproximativ doua minute, iar codul pleaca din
// acelasi push si NU aterizeaza in aceeasi secunda.
//
// FARA EA, FEREASTRA ACEEA ESTE INC-05 DIN NOU. Pagina de inventar ar cere
// retired_at, PostgREST ar raspunde 42703, lista de combinatii ar iesi goala si
// alegerea de model ar disparea din formular.
//
// COMPORTAMENTUL DINAINTE DE APLICARE ESTE CEL DE ASTAZI: formularul ofera toate
// combinatiile, iar ecranul din Setari arata lista fara butoanele de scriere,
// fiindca politicile de scriere sosesc in aceeasi tranzactie cu coloana. O singura
// sonda, pe coloana, ajunge.
// ---------------------------------------------------------------------------

let cachedSheetOptionRetirement: { value: boolean; at: number } | null = null;

/**
 * @param client clientul CU CARE VA CITI SAU VA SCRIE APELANTUL, din acelasi
 *   motiv ca la celelalte porti.
 */
export async function hasSheetOptionRetirement(client: ColumnProbe): Promise<boolean> {
  const now = Date.now();
  if (cachedSheetOptionRetirement && now - cachedSheetOptionRetirement.at < TTL_MS) {
    return cachedSheetOptionRetirement.value;
  }
  try {
    const { error } = await client.from("sheet_options").select("retired_at").limit(1);
    cachedSheetOptionRetirement = { value: !error, at: now };
  } catch {
    // "Nu se stie" se trateaza ca "nu": formularul ofera tot, ca azi, in loc sa cada.
    cachedSheetOptionRetirement = { value: false, at: now };
  }
  return cachedSheetOptionRetirement.value;
}


// ---------------------------------------------------------------------------
// P3-69. Exista migratia 0049: coloana products.source_note?
//
// DE CE ARE POARTA EI SI NU O IMPARTE CU hasProductImage SAU hasSheetOptions.
// Acelea raspund despre 0045 si 0046. 0049 este un fisier separat si ajunge in
// productie pe fuziune, prin aplicatia GitHub a Supabase, in aproximativ doua
// minute, iar codul pleaca din acelasi push si NU aterizeaza in aceeasi secunda.
//
// FARA EA, FEREASTRA ACEEA ESTE INC-05 DIN NOU. listProducts ar cere source_note,
// PostgREST ar raspunde 42703, iar tabloul de bord, inventarul si fiecare formular
// care alege un produs ar raspunde 500 pana cand migratia ateriza.
//
// COMPORTAMENTUL DINAINTE DE APLICARE ESTE CEL DE ASTAZI: panoul produsului nu
// arata sursa. Coloana si cele 80 de produse sosesc in aceeasi tranzactie, deci o
// singura sonda, pe coloana, ajunge.
// ---------------------------------------------------------------------------

let cachedProductSourceNote: { value: boolean; at: number } | null = null;

/**
 * @param client clientul CU CARE VA CITI APELANTUL, din acelasi motiv ca la
 *   celelalte porti.
 */
export async function hasProductSourceNote(client: ColumnProbe): Promise<boolean> {
  const now = Date.now();
  if (cachedProductSourceNote && now - cachedProductSourceNote.at < TTL_MS) {
    return cachedProductSourceNote.value;
  }
  try {
    const { error } = await client.from("products").select("source_note").limit(1);
    cachedProductSourceNote = { value: !error, at: now };
  } catch {
    // "Nu se stie" se trateaza ca "nu": panoul arata ce exista azi, in loc sa cada.
    cachedProductSourceNote = { value: false, at: now };
  }
  return cachedProductSourceNote.value;
}
