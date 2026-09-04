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
] as const;
export type ExtractionErrorCode = (typeof EXTRACTION_ERROR_CODES)[number];

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

/** Propozitia romaneasca a fiecarui cod. Un token brut pe ecran ar fi un sir
 *  englezesc ajuns in interfata, ceea ce sectiunea 11 din CLAUDE.md interzice.
 *  Ecranul apartine lui P2-09; textele stau aici ca sa existe un singur loc. */
export const EXTRACTION_ERROR_LABEL: Record<ExtractionErrorCode, string> = {
  download_failed: "Documentul nu a putut fi descărcat de serviciul de extragere.",
  url_expired: "Legătura semnată a expirat înainte să fie folosită. Retrimite documentul.",
  unsupported_format: "Formatul fișierului nu poate fi citit de serviciul de extragere.",
  // EXT-19. PROPOZITIA ISI POARTA INSTRUCTIUNEA, si pana la acest card nu o
  // purta pe niciuna: spunea ce s-a intamplat si il lasa pe operator sa
  // ghiceasca ce sa faca. Instructiunea este COMPUSA din constanta de mai sus,
  // nu copiata, ca proba sa verifice exact sirul care ajunge pe ecran.
  unreadable_document: `Documentul este într-un format acceptat, dar conținutul nu este lizibil. ${ACTION_RESCAN}`,
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
};

/** EXT-15. Unde a gasit extractorul textul: pe pagina, sau intr-o imagine.
 *
 *  DECLARAT DE EXTRACTOR, fiindca numai el stie. mime_type nu raspunde la
 *  intrebare: unul dintre cele patru documente de proba este un PDF fara strat
 *  de text, deci application/pdf acopera amandoua cazurile.
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

export type ExtractionDraft = {
  orderId: string;
  documentPath: string;
  documentFilename: string;
  mimeType: string;
  sizeBytes: number;
  /** null inseamna "trimis, fara raspuns inca". Vezi antetul migratiei 0008. */
  status: ExtractionStatus | null;
  errorCode: ExtractionErrorCode | null;
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
  firedAt: string | null;
  callbackAt: string | null;
  lines: ExtractionLine[];
};

export function isExtractionStatus(v: unknown): v is ExtractionStatus {
  return typeof v === "string" && (EXTRACTION_STATUSES as readonly string[]).includes(v);
}

export function isExtractionErrorCode(v: unknown): v is ExtractionErrorCode {
  return typeof v === "string" && (EXTRACTION_ERROR_CODES as readonly string[]).includes(v);
}
