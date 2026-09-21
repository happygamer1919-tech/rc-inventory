// Tipurile si constantele extragerii, fara nimic de server.
//
// Forma vine INTEGRAL din docs/contracts/extraction-v2.md, inghetat prin
// hotararea R-014. Un camp care apare intr-un payload si nu este in documentul
// acela este IGNORAT, niciodata ghicit.
//
// Acelasi motiv de separare ca la inbound-types.ts: un fisier "use server" nu
// are voie sa exporte decat functii async, iar un fisier cu "server-only" nu
// poate fi atins de un component de client nici macar pentru o constanta.

export const EXTRACTION_STATUSES = ["extracted", "partial", "failed"] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

/** Multimea inchisa din sectiunea 5.2 a contractului. Orice altceva este 400. */
export const EXTRACTION_ERROR_CODES = [
  "download_failed",
  "url_expired",
  "unsupported_format",
  "unreadable_document",
  "extraction_failed",
  "invalid_output",
  "timeout",
  // EXT-16, ruling R-098. THE FIRST MEMBER OF THE THIRD SURFACE, and it is OURS
  // to emit rather than Make's. The other seven describe a download that failed
  // or an extraction that failed; this one describes a payload that ARRIVED
  // WELL-FORMED and that our own arithmetic refused. Contract section 5.2a names
  // the three groups so the ninth code joins a stated set rather than a guessed
  // one.
  "reconciliation_failed",
  // EXT-28. THE SECOND MEMBER OF THE THIRD SURFACE, and ours to emit like the one
  // above: an upload whose page count WE measured at 100 or more, refused BEFORE
  // it was sent, so nothing was downloaded and no model ran. Being in this set
  // also means a callback carrying it is accepted rather than answered 400; the
  // owner's dispatch of 2026-09-14 states the counterparty's size guard emits it.
  "document_too_large",
] as const;
export type ExtractionErrorCode = (typeof EXTRACTION_ERROR_CODES)[number];

/** P3-71, Ivan's finding F3. CODURILE PE CARE LE SCRIEM NOI SI CARE NU CIRCULA
 *  NICIODATA PE SARMA.
 *
 *  DE CE UN AL DOILEA SET SI NU INCA O LINIE IN CEL DE SUS. Multimea de mai sus
 *  este multimea inchisa a sectiunii 5.2 din contract, si este exact multimea pe
 *  care app/api/extraction/callback/route.ts o verifica prin
 *  isExtractionErrorCode: un cod din afara ei primeste 400. Ruta aceea este
 *  INGHETATA prin hotararea R-202 cat timp legatura cu Andre este deschisa, si
 *  nimic nu are voie sa schimbe ce accepta, ce refuza sau ce raspunde. A pune
 *  `config_error` in multimea de sus ar fi transformat un callback care il poarta
 *  dintr-un 400 intr-un payload acceptat, adica exact schimbarea pe care R-202 o
 *  interzice. Deci sta aici, separat, si ruta ramane neatinsa la litera.
 *
 *  SI ASTA ESTE OPUSUL UNEI PORTITE. Codul acesta descrie o configurare de-a
 *  NOASTRA care lipseste, pentru un document care nu a plecat nicaieri. Cealalta
 *  parte nu are cum sa il trimita, fiindca nu are cum sa il afle, iar noi nu i-l
 *  trimitem niciodata. Conditia hotararii R-098, ca expeditorul sa cunoasca un
 *  cod inainte ca noi sa il emitem, nu se aplica din acelasi motiv: nimic nu il
 *  emite pe sarma.
 *
 *  ESTE TOTUSI O ETICHETA REALA DE ENUM, adaugata de migratia 0051, fiindca el se
 *  scrie pe randul nostru de ciorna, iar constrangerea
 *  extraction_drafts_error_code_matches_status cere un error_code ne-null ori de
 *  cate ori status este 'failed'. */
export const LOCAL_ERROR_CODES = ["config_error"] as const;
export type LocalErrorCode = (typeof LOCAL_ERROR_CODES)[number];

/** Ce poate purta coloana extraction_drafts.error_code: un cod de pe sarma sau
 *  unul dintre ale noastre. Ecranul le arata pe amandoua; ruta de callback
 *  accepta numai primul fel, si aceea este toata distinctia. */
export type StoredErrorCode = ExtractionErrorCode | LocalErrorCode;

/** EXT-19. CELE DOUA INSTRUCTIUNI, FIINDCA ELE SUNT DIFERENTA CARE CONTEAZA.
 *
 *  Un document respins il trimite pe operator sa faca CEVA, iar cele doua coduri
 *  il trimit sa faca lucruri diferite:
 *
 *    unreadable_document      documentul nu s-a putut citi   -> alta scanare
 *    reconciliation_failed    cifrele nu se potrivesc        -> batut de mana
 *
 *  A-i spune omului pe cel gresit ii pierde timpul: retrimite la nesfarsit o
 *  scanare perfect lizibila ale carei numere nu se aduna, sau bate de mana un
 *  document pe care o poza mai buna l-ar fi rezolvat.
 *
 *  FIECARE ESTE UN SIR NUMIT, folosit si de eticheta de mai jos si de proba din
 *  review.spec. Doua copii ale unei propozitii pot ajunge sa nu fie de acord, si
 *  dezacordul care conteaza este exact cel dintre ce scrie pe ecran si ce
 *  verifica testul. */
export const ACTION_RESCAN = "Încarcă o scanare mai bună.";
export const ACTION_ENTER_BY_HAND = "Documentul trebuie introdus manual.";

/** EXT-23. CELE DOUA REMEDII, NUMITE SEPARAT, fiindca propozitia lui
 *  `unreadable_document` le poarta acum pe amandoua si o proba trebuie sa poata
 *  arata catre fiecare in parte.
 *
 *  Litera mica si fara punct: ele sunt CLAUZE intr-o fraza, nu propozitii. Asa
 *  raman distincte de ACTION_RESCAN, care este instructiunea NECONDITIONATA de
 *  rescanare si care nu mai este ce spune acest cod. */
export const REMEDY_RESCAN = "încarcă o scanare mai bună";
export const REMEDY_SUPPLIER = "cere furnizorului un document corectat";

/** EXT-23. INSTRUCTIUNEA PENTRU UN DOCUMENT CARE NU POATE FI FOLOSIT ASA CUM A
 *  FOST CITIT, si fiecare remediu este CONDITIONAT de situatia care il cere.
 *
 *  DE CE NU MAI ESTE ACTION_RESCAN. `unreadable_document` acopera de la EXT-23
 *  si un document PERFECT LIZIBIL ale carui totaluri tiparite se contrazic intre
 *  ele. Acolo nicio scanare nu schimba nimic: hartia este gresita, iar omul are
 *  de vorbit cu furnizorul. A-l trimite la scanner il pune sa retrimita la
 *  nesfarsit o poza buna a unui document stricat.
 *
 *  TENSIUNEA CU EXT-19 ESTE REALA SI ESTE REZOLVATA, NU IGNORATA. EXT-19 cere ca
 *  fiecare cod sa poarte O SINGURA instructiune, fiindca a-i da omului pe cea
 *  gresita ii pierde timpul. Un cod care acopera doua situatii cu doua actiuni
 *  nu poate pastra forma aceea neschimbata. Forma aleasa este a treia din
 *  `defaults`-ul cardului: O SINGURA propozitie care NUMESTE amandoua situatiile
 *  si da actiunea corecta pentru fiecare. Nimeni nu primeste instructiunea
 *  celuilalt caz ca ordin; fiecare isi gaseste situatia in ea. */
export const ACTION_CHECK_DOCUMENT =
  `Verifică documentul pe hârtie: dacă textul nu se poate citi, ${REMEDY_RESCAN}; ` +
  `dacă totalurile lui nu se potrivesc între ele, ${REMEDY_SUPPLIER}.`;

/** Propozitia romaneasca a fiecarui cod. Un token brut pe ecran ar fi un sir
 *  englezesc ajuns in interfata, ceea ce sectiunea 11 din CLAUDE.md interzice.
 *  Ecranul apartine lui P2-09; textele stau aici ca sa existe un singur loc. */
export const EXTRACTION_ERROR_LABEL: Record<StoredErrorCode, string> = {
  download_failed: "Documentul nu a putut fi descărcat de serviciul de extragere.",
  url_expired: "Legătura semnată a expirat înainte să fie folosită. Retrimite documentul.",
  unsupported_format: "Formatul fișierului nu poate fi citit de serviciul de extragere.",
  // EXT-19. PROPOZITIA ISI POARTA INSTRUCTIUNEA, si pana la acel card nu o purta
  // pe niciuna: spunea ce s-a intamplat si il lasa pe operator sa ghiceasca ce
  // sa faca. Instructiunea este COMPUSA din constanta de mai sus, nu copiata, ca
  // proba sa verifice exact sirul care ajunge pe ecran.
  //
  // EXT-23 A LARGIT-O, SI PROPOZITIA DINAINTE ESTE PASTRATA MAI JOS, NU STEARSA,
  // dupa CLAUDE.md sectiunea 9c. Ea citea:
  //
  //   "Documentul este intr-un format acceptat, dar continutul nu este lizibil.
  //    Incarca o scanare mai buna."
  //
  // Era adevarata cat timp singurul emitent al codului era Make si codul insemna
  // "extractorul nu a putut citi". De la EXT-23 validatorul NOSTRU il emite si
  // pentru un document PERFECT LIZIBIL care nu are niciun reper de incredere:
  // zero linii, niciun total tiparit fata de care sa se reconcilieze, sau un
  // antet care nu se aduna cu el insusi. Pe acela din urma o scanare mai buna nu
  // schimba nimic, si a-l trimite pe om la scanner il pune sa retrimita la
  // nesfarsit o poza buna a unui document stricat.
  unreadable_document: `Documentul nu poate fi folosit așa cum a fost citit: fie conținutul nu se poate citi, fie cifrele tipărite pe el nu se potrivesc între ele. ${ACTION_CHECK_DOCUMENT}`,
  extraction_failed: "Extragerea a rulat și nu a produs nimic utilizabil.",
  invalid_output: "Serviciul a răspuns cu date care nu respectă contractul.",
  timeout: "Extragerea a depășit timpul maxim al serviciului.",
  // Fara jargon si fara numere: operatorul vede ce nu se potriveste si ce are de
  // facut, nu formula. Sectiunea 11 din CLAUDE.md cere romana cu diacritice pe
  // fiecare sir care ajunge pe ecran.
  // EXT-19. Aceeasi compunere, cu CEALALTA instructiune. Textul este neschimbat
  // fata de EXT-16; ce s-a schimbat este ca a doua propozitie vine acum din
  // constanta pe care proba o citeste.
  reconciliation_failed: `Suma liniilor citite nu se potrivește cu totalul tipărit pe document. ${ACTION_ENTER_BY_HAND}`,
  // EXT-28. Textul propus in `defaults`-ul cardului EXT-27, luat ca atare. Spune
  // ce s-a intamplat si ce are omul de facut, iar instructiunea lui nu este a
  // niciunui alt cod: nu cere o scanare, nu cere o retrimitere si nu cere
  // introducere manuala.
  document_too_large:
    "Documentul are prea multe pagini pentru serviciul de extragere. Împarte-l în părți mai mici și încarcă-le pe rând.",
  // P3-71. SINGURA PROPOZITIE DE AICI CARE NU ESTE DESPRE DOCUMENT, si tocmai de
  // aceea instructiunea ei nu seamana cu a niciunui alt cod: nu cere o scanare
  // mai buna, nu cere un document mai mic, nu cere introducere manuala si nu cere
  // o retrimitere imediata, fiindca o retrimitere ar cadea exact la fel pana cand
  // setarea este pusa la loc.
  //
  // SPUNE CA DOCUMENTUL NU S-A PIERDUT, si asta nu este politete. Incarcarea a
  // reusit: fisierul este stocat si comanda este actualizata. Fara propozitia
  // aceea, un operator care vede un esec presupune ca trebuie sa o ia de la capat
  // si incarca acelasi document de cinci ori.
  //
  // NU NUMESTE VARIABILA. Numele ei sta in `reason`, pe rand, pentru cine repara;
  // pe ecran ar fi un sir englezesc, pe care sectiunea 11 din CLAUDE.md il
  // interzice, si nu i-ar spune nimic omului care il citeste.
  config_error:
    "Documentul a fost încărcat și păstrat, dar nu a putut fi trimis la citirea automată: o setare a sistemului lipsește. Anunță administratorul, apoi retrimite documentul.",
};

/** Codurile de raspuns ale callback-ului, sectiunea 6. Fixate prin contract:
 *  Make reincearca pe 5xx si NU reincearca pe 4xx, deci impartirea aceasta
 *  decide daca un payload gresit este reincercat la nesfarsit sau abandonat. */
export const CALLBACK_CODES = {
  accepted: 202,
  duplicate: 200,
  rejected: 400,
  badSecret: 401,
} as const;

export type ExtractionLine = {
  lineNo: number;
  productName: string;
  quantity: number | null;
  unit: string | null;
  unitRaw: string | null;
  unitPrice: number | null;
  lineTotal: number | null;
  currency: string | null;
  currencyRaw: string | null;
  category: string | null;
  categoryRaw: string | null;
  /** EXT-34. Codul produsului LA FURNIZOR, asa cum l-a trimis expeditorul. Nu
   *  se foloseste la potrivirea produselor. null inseamna ca nu s-a trimis, sau
   *  ca 0053 nu este inca aplicata. */
  supplierCode: string | null;
  /** EXT-34. Descrierea liniei, asa cum a trimis-o expeditorul, alaturi de
   *  denumire. Numele are prefixul `line` fiindca cuvantul simplu este si cheia
   *  de metadate a lui Next si campul unui element de meniu, iar
   *  check:pending-schema-reads cauta numele coloanei ca pe un cuvant. */
  lineDescription: string | null;
  /** EXT-34. `printed` daca totalul liniei a fost citit de pe pagina, `derived`
   *  daca a fost calculat. Stocat asa cum a sosit, fara verificare, si citit de
   *  nicio regula de reconciliere. */
  lineTotalSource: string | null;
};

/** EXT-34. Etichetele celor cinci campuri primite de la expeditor.
 *
 *  AICI SI NU IN COMPONENT, din acelasi motiv ca la `EXTRACTION_META_LABEL`:
 *  textul de pe ecran si textul pe care il cauta o proba sunt acelasi sir. */
export const EXTRACTION_INBOUND_LABEL = {
  documentType: "Tipul documentului",
  clientRef: "Referința clientului",
  supplierCode: "Cod furnizor",
  lineDescription: "Descriere",
  lineTotalSource: "Totalul liniei",
} as const;

/** EXT-34. Sursa totalului liniei, in cuvinte. O valoare pe care nu o
 *  cunoastem se arata asa cum a sosit: campul este stocat, nu interpretat. */
/** P3-80, constatarea F6. De ce un document citit complet sta in `Parțial`.
 *
 *  AICI SI NU IN COMPONENT, din acelasi motiv ca etichetele de mai sus: textul
 *  de pe ecran si textul pe care il cauta proba sunt acelasi sir. Linia anume se
 *  vede sub fiecare pozitie, prin eticheta `Totalul liniei: calculat`. */
export const DERIVED_PARTIAL_NOTICE =
  "Marcat parțial de platformă: totalul cel puțin unei poziții a fost calculat la citire, nu tipărit pe document. Comparați acea poziție cu hârtia.";

/** P3-82, constatarea F17, hotararea R-208. Nota unui aviz fara preturi, in
 *  cuvintele lui Max, VERBATIM. Aici si nu in component, din acelasi motiv ca
 *  DERIVED_PARTIAL_NOTICE: textul de pe ecran si textul pe care il cauta proba
 *  sunt acelasi sir. */
export const QUANTITIES_ONLY_NOTICE =
  "Document fără prețuri: cantitățile sunt citite, prețurile se completează din factură";

/** P3-82. Este documentul un aviz FARA PRETURI, prin constructie?
 *
 *  FORMA ESTE INGUSTA SI ESTE A LUI F17: cel putin o linie, FIECARE linie fara
 *  total, SI niciun total in antet (nici subtotal, nici total document). Un
 *  document caruia ii lipsesc NUMAI UNELE totaluri este o citire incompleta, nu un
 *  aviz, si ramane refuzat ca pana acum (`line_total_missing`). Unul care tipareste
 *  un total in antet dar nu are totaluri pe linii ramane si el refuzat.
 *
 *  O SINGURA DEFINITIE, CU DOI CITITORI. reconcile() o cheama ca sa sara
 *  comparatia, iar ecranul de verificare o cheama ca sa arate nota. Acest fisier
 *  poate fi importat de client; reconciliation.ts este server-only. Doua copii ale
 *  conditiei ar putea sa nu fie de acord, iar dezacordul care conteaza este un
 *  document acceptat fara nota, sau o nota pe unul care a fost refuzat. */
export function isQuantitiesOnly(input: {
  lineTotals: readonly (number | null)[];
  subtotal: number | null;
  documentTotal: number | null;
}): boolean {
  return (
    input.lineTotals.length > 0 &&
    input.lineTotals.every((t) => t === null) &&
    input.subtotal === null &&
    input.documentTotal === null
  );
}

export function lineTotalSourceLabel(v: string): string {
  if (v === "printed") return "tipărit pe document";
  if (v === "derived") return "calculat";
  return v;
}

/** EXT-15. Unde a gasit extractorul textul: pe pagina, sau intr-o imagine.
 *
 *  DECLARAT DE EXTRACTOR, fiindca numai el stie. mime_type nu raspunde la
 *  intrebare: unul dintre cele patru documente de proba este un PDF fara strat
 *  de text, deci application/pdf acopera amandoua cazurile.
 *
 *  NOTA 2026-09-15, cardul EXT-33: setul de proba de sub _samples/andre are sase
 *  documente de la 2026-09-15, iar R-096, amendata in aceeasi zi, acopera fiecare
 *  document de sub acel prefix, nu un numar fix de patru. Cele patru numite aici
 *  sunt setul initial; nimic de mai sus nu s-a schimbat.
 *
 *  null INSEAMNA "nu a spus", si se citeste ca `scan`. Vezi SAFE_DOCUMENT_SOURCE. */
export const DOCUMENT_SOURCES = ["scan", "digital"] as const;
export type DocumentSource = (typeof DOCUMENT_SOURCES)[number];

/** Ce se presupune cand payload-ul nu declara sursa.
 *
 *  `scan`, SI ASTA NU ESTE PRUDENTA GENERICA, ESTE ASIMETRIA COSTURILOR. A ghici
 *  `digital` pe un document scanat inseamna stoc inventat intr-un depozit real.
 *  A ghici `scan` pe unul digital inseamna ca cineva bate un document de mana. */
export const SAFE_DOCUMENT_SOURCE: DocumentSource = "scan";

export function isDocumentSource(v: unknown): v is DocumentSource {
  return typeof v === "string" && (DOCUMENT_SOURCES as readonly string[]).includes(v);
}

/** Sursa efectiva a unei ciorne: ce a declarat, sau valoarea sigura. */
export function effectiveSource(v: unknown): DocumentSource {
  return isDocumentSource(v) ? v : SAFE_DOCUMENT_SOURCE;
}

/** EXT-17. CE SCRIE PE O LINIE CITITA DINTR-O IMAGINE.
 *
 *  UN SINGUR LOC. Ecranul o randeaza si specul o citeste de aici, ca textul pe
 *  care il vede operatorul si textul pe care il verifica proba sa nu poata fi
 *  doua siruri diferite. Aceeasi doctrina ca la EXTRACTION_ERROR_LABEL.
 *
 *  SPUNE CE S-A INTAMPLAT, NU CAT DE GRAV ESTE. Cuvintele sunt ale
 *  proprietarului: "Citit de masina dintr-o imagine" ii spune celui care verifica
 *  ce sa faca altfel. "Atentie" nu ii spune nimic. */
export const SCAN_LINE_NOTICE = "Citită de mașină dintr-o imagine.";

/** EXT-17. Se marcheaza liniile acestei ciorne?
 *
 *  O SINGURA DEFINITIE, folosita si de formular si de proba. Regula este SURSA,
 *  nu rezultatul reconcilierii: un document care se aduna corect este exact cazul
 *  pentru care cardul exista, fiindca un set de linii fabricate care se intampla
 *  sa dea totalul tiparit trece de aritmetica si nu trece de un om.
 *
 *  NU SE INTREABA DE STATUS. O scanare `partial` isi pastreaza liniile citite si
 *  ele sunt tot linii citite dintr-o imagine. Una `failed` nu are linii deloc,
 *  prin EXT-15, deci nu are ce marca si conditia nu o exclude degeaba. */
export function scanReadLines(draft: { documentSource: unknown }): boolean {
  return effectiveSource(draft.documentSource) === "scan";
}

/** P3-72, constatarea F5 a lui Ivan. BLOCUL DE DIAGNOSTIC AL MODELULUI.
 *
 *  CE ESTE. Sectiunea 4.3 din contract: `_meta` poarta `model`,
 *  `prompt_version`, `page_count` si `duration_ms`. Ruta de callback il scrie
 *  VERBATIM in coloana `extraction_drafts.meta`, care este `jsonb`, de la
 *  migratia 0008 incoace. Pana la acest card nimic nu il citea inapoi.
 *
 *  `partial_cause` NU ESTE IN CONTRACT SI SOSESTE ORICUM, inauntrul aceluiasi
 *  bloc. Hotararea din `decisions/inbox.md` o spune in termeni: o linie fara
 *  total tiparit ruteaza la `partial` cu cauza `lines` pe partea expeditorului,
 *  iar cauza calatoreste in `_meta`, pe care ruta noastra o stocheaza si nu o
 *  citeste. Se citeste aici fiindca este exact propozitia care explica un
 *  `partial`, si fiindca constatarea F5 o numeste.
 *
 *  `page_count` NU ESTE AICI, DELIBERAT. Are coloana lui, adaugata de migratia
 *  0032 tocmai fiindca o cheie intr-un blob nevalidat nu este ceva ce poate
 *  intreba o interogare. Vezi `ExtractionDraft.modelPageCount`.
 *
 *  FIECARE CAMP SE CITESTE APARTE SI NECREZUT. Nimic, nici la scriere nici la
 *  citire, nu verifica forma acestui obiect: este `jsonb` nevalidat scris
 *  verbatim dintr-un payload al altcuiva. Un camp care nu are tipul asteptat
 *  devine null, adica exact ce inseamna si un camp care nu a sosit, si nimic
 *  aici nu arunca si nu poate strica ecranul. */
export type ExtractionMeta = {
  model: string | null;
  promptVersion: string | null;
  durationMs: number | null;
  partialCause: string | null;
};

/** Un camp de text din `_meta`.
 *
 *  UN NUMAR SE ACCEPTA SI SE SCRIE CA TEXT. `prompt_version` este un sir prin
 *  contract, si un expeditor care trimite `2` in loc de `"v2"` a raportat
 *  totusi ceva; a-l arunca ar ascunde exact informatia pentru care exista
 *  blocul. Sirul gol si cel format numai din spatii sunt null: un camp gol nu
 *  este un raport. */
function metaText(v: unknown): string | null {
  if (typeof v === "string") {
    const trimmed = v.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/** Durata citirii, in milisecunde.
 *
 *  UN RAPORT STRICAT ESTE null, NICIODATA ZERO, din acelasi motiv pentru care
 *  migratia 0032 refuza un default pe numarul de pagini: zero ar fi o afirmatie
 *  ca citirea a durat instantaneu, iar absenta nu afirma nimic. Un sir numeric
 *  se accepta fiindca `_meta` nu este validat de nimeni si un numar trimis ca
 *  text este acelasi numar. */
function metaDuration(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/** S-a citit macar un camp? Un bloc din care nu s-a citit nimic se raporteaza
 *  ca absent, ca ecranul sa nu deschida o sectiune goala. */
export function hasExtractionMeta(m: ExtractionMeta | null): m is ExtractionMeta {
  return (
    m !== null &&
    (m.model !== null || m.promptVersion !== null || m.durationMs !== null || m.partialCause !== null)
  );
}

/** Citeste coloana `meta` intr-o forma tipizata, sau null.
 *
 *  O SINGURA DEFINITIE, folosita si de stratul de date si de proba, din acelasi
 *  motiv ca la `scanReadLines`: ce se arata pe ecran si ce verifica proba nu au
 *  voie sa fie doua citiri diferite ale aceluiasi blob. */
export function readExtractionMeta(raw: unknown): ExtractionMeta | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const meta: ExtractionMeta = {
    model: metaText(o.model),
    promptVersion: metaText(o.prompt_version),
    durationMs: metaDuration(o.duration_ms),
    partialCause: metaText(o.partial_cause),
  };
  return hasExtractionMeta(meta) ? meta : null;
}

/** P3-72. Titlul sectiunii de diagnostic, si etichetele ei.
 *
 *  AICI SI NU IN COMPONENT, din acelasi motiv ca la `EXTRACTION_ERROR_LABEL` si
 *  `SCAN_LINE_NOTICE`: textul pe care il vede operatorul si textul pe care il
 *  cauta proba sunt acelasi sir, nu doua siruri care se pot desparti. */
export const EXTRACTION_META_TITLE = "Detalii tehnice ale citirii";

export const EXTRACTION_META_LABEL = {
  model: "Model",
  promptVersion: "Versiunea promptului",
  durationMs: "Durata citirii",
  partialCause: "Cauza citirii parțiale",
  /** Numarul RAPORTAT DE MODEL, din `_meta.page_count`, prin coloana 0032. */
  modelPageCount: "Pagini raportate de model",
  /** Numarul NUMARAT DE NOI din bytes la incarcare, coloana 0043. Acelasi sir
   *  ca in antetul scanarii necitite, si de aceea este o constanta: doua numere
   *  care stau unul langa altul pe ecran se deosebesc numai prin eticheta. */
  uploadPageCount: "Pagini numărate la încărcare",
} as const;

/** Ce se scrie cand campul nu a sosit sau a sosit stricat. */
export const EXTRACTION_META_ABSENT = "Nu s-a raportat";

/** Durata in cuvinte, cu virgula zecimala romaneasca.
 *
 *  FORMATARE EXPLICITA SI NU `Intl`, fiindca proba compara sirul exact si un
 *  separator care depinde de datele de locale instalate pe masina de integrare
 *  ar face din asta un test care pica in alta parte decat in cod. */
export function formatExtractionDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
}

export type ExtractionDraft = {
  orderId: string;
  documentPath: string;
  documentFilename: string;
  mimeType: string;
  sizeBytes: number;
  /** null inseamna "trimis, fara raspuns inca". Vezi antetul migratiei 0008. */
  status: ExtractionStatus | null;
  /** P3-71. `StoredErrorCode` si nu `ExtractionErrorCode`: coloana poate purta si
   *  un cod de-al nostru, care nu circula niciodata pe sarma. Vezi
   *  LOCAL_ERROR_CODES. */
  errorCode: StoredErrorCode | null;
  reason: string | null;
  supplierName: string | null;
  orderDate: string | null;
  subtotal: number | null;
  vatAmount: number | null;
  documentTotal: number | null;
  pricesIncludeVat: boolean | null;
  vatRate: number | null;
  currency: string | null;
  currencyRaw: string | null;
  /** EXT-15. null inseamna "extractorul nu a spus", citit ca `scan`. */
  documentSource: DocumentSource | null;
  /** EXT-11. NUMARUL documentului furnizorului. A noastra este referinta
   *  comenzii si este alt lucru. null inseamna ca nu s-a raportat unul, sau ca
   *  randul este de dinaintea migratiei 0036. */
  orderRef: string | null;
  /** EXT-11. SERIA documentului furnizorului: codul de litere tiparit inaintea
   *  numarului. In facturarea moldoveneasca face parte din identificator, fiindca
   *  doi furnizori pot emite amandoi 0009312. null este legal: nu orice document
   *  poarta o serie. */
  orderRefSeries: string | null;
  /** EXT-34. Tipul documentului, asa cum l-a trimis expeditorul (de exemplu
   *  `invoice`). Nicio multime de valori. null inseamna ca nu s-a trimis, sau ca
   *  0053 nu este inca aplicata. */
  documentType: string | null;
  /** EXT-34. Referinta CLIENTULUI tiparita pe document, verbatim. Nu se
   *  potriveste cu niciun client. Nu este `orderRef`, care este a furnizorului. */
  clientRef: string | null;
  /** P3-80, constatarea F6. true EXACT cand regula NOASTRA a mutat documentul
   *  din `extracted` in `partial` fiindca o linie are totalul calculat, nu
   *  tiparit. false cand regula a rulat si nu a mutat nimic. null cand nu a
   *  rulat, sau cand 0054 nu este inca aplicata. */
  derivedPartial: boolean | null;
  /** EXT-28. Paginile NUMARATE DE NOI la incarcare, din bytes. null inseamna ca
   *  nu am putut numara cu siguranta, sau ca randul este de dinaintea migratiei
   *  0043. Nu este numarul raportat de model, care ramane in `_meta`. */
  uploadPageCount: number | null;
  /** P3-72, constatarea F5. Paginile RAPORTATE DE MODEL, din coloana pe care
   *  migratia 0032 o adauga, umpluta din `_meta.page_count`. null inseamna ca
   *  modelul nu a raportat niciun numar, ca a raportat unul stricat, sau ca 0032
   *  nu este inca aplicata pe baza catre care arata aplicatia. Nu este
   *  `uploadPageCount`, care vine din bytes si este numarul nostru. */
  modelPageCount: number | null;
  /** P3-72, constatarea F5. Blocul de diagnostic al modelului, citit din
   *  coloana `meta`. null inseamna ca nu a sosit sau ca nu s-a putut citi niciun
   *  camp din el. Vezi `readExtractionMeta`. */
  meta: ExtractionMeta | null;
  firedAt: string | null;
  callbackAt: string | null;
  /** P3-84, constatarea F20. Cand s-a renuntat la document. Lipseste pe
   *  ciornele din coada, care prin definitie nu sunt renuntate; il poarta
   *  numai randurile citite de listCancelledDrafts. */
  cancelledAt?: string | null;
  /** P3-84. Numele celui care a renuntat, rezolvat din profiles. null cand
   *  profilul nu se poate citi cu sesiunea curenta. */
  cancelledBy?: string | null;
  /** P3-84. Motivul scris la renuntare, sau null cand nu s-a dat unul. */
  cancelReason?: string | null;
  /** P3-84. Cand s-a incarcat documentul, din created_at. Il poarta numai
   *  randurile citite de listCancelledDrafts, unde ecranul il arata. */
  uploadedAt?: string | null;
  lines: ExtractionLine[];
};

export function isExtractionStatus(v: unknown): v is ExtractionStatus {
  return typeof v === "string" && (EXTRACTION_STATUSES as readonly string[]).includes(v);
}

export function isExtractionErrorCode(v: unknown): v is ExtractionErrorCode {
  return typeof v === "string" && (EXTRACTION_ERROR_CODES as readonly string[]).includes(v);
}
