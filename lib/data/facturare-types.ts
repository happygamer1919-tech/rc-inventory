// Facturare: tipurile si etichetele romanesti. Cardul P3-108, goal G65 partea 1.
//
// VALOAREA STOCATA ESTE ENGLEZEASCA, ETICHETA ESTE ROMANEASCA, si traducerea
// traieste aici, in stratul de prezentare. Enumul public.invoice_status din
// migratia 0063 pastreaza tokenuri englezesti exact cum fac deja
// public.deviz_status (0025) si public.project_status (0016). Asa spune
// defaults-ul cardului P2-01, citat in lib/data/units.ts: "o valoare de enum nu
// este text de interfata".
//
// De aceea in schema nu exista nicio diacritica, iar cele patru cuvinte pe care
// le vede operatorul sunt mai jos si numai aici.
//
// FISIER FARA "server-only", ca sheet-options-types.ts si clients-types.ts:
// etichetele se citesc si dintr-un component de browser.

export type InvoiceStatus = "draft" | "issued" | "paid" | "cancelled";

const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Ciornă",
  issued: "Emisă",
  paid: "Plătită",
  cancelled: "Anulată",
};

/** Ordinea este chiar fluxul unei facturi, nu alfabetul. */
export const ALL_INVOICE_STATUSES: InvoiceStatus[] = ["draft", "issued", "paid", "cancelled"];

export function invoiceStatusLabel(status: InvoiceStatus): string {
  return INVOICE_STATUS_LABEL[status] ?? status;
}

export function isInvoiceStatus(value: unknown): value is InvoiceStatus {
  return typeof value === "string" && (ALL_INVOICE_STATUSES as string[]).includes(value);
}

/** Setarile de facturare: randul unic din public.invoice_settings. */
export type InvoiceSettings = {
  /** Prefixul seriei. Implicit "RC-". */
  seriesPrefix: string;
  /** Anul intra in numar, deci seria unei facturi din 2026 este "RC-2026". */
  numberIncludesYear: boolean;
  /** Procent. Implicit 20, NECONFIRMAT de un contabil: vezi VAT_NOTE. */
  defaultVatRate: number;
  issuerName: string;
  issuerFiscalCode: string;
  issuerAddress: string;
  issuerBank: string;
  issuerIban: string;

  // P3-116, goal G69 partea 4. CELE TREI CAMPURI ADAUGATE DE MIGRATIA 0066, pe
  // ACELASI RAND si nu pe o a doua tabela. Raportul de proiectare
  // docs/reports/2026-09-30-author-setari-design.md spune de ce, intr-o propoziție
  // care merita tinuta minte: doua locuri care tin IDNO-ul aceleiasi firme este
  // exact felul in care ajung sa se contrazica, iar cel greșit este intotdeauna cel
  // care s-a tiparit.
  /** Codul de inregistrare ca platitor de TVA. ALT NUMAR DECAT IDNO (issuerFiscalCode)
   *  si ALT LUCRU DECAT defaultVatRate, care este un procent pe o linie de factura. */
  issuerVatCode: string;
  issuerPhone: string;
  issuerEmail: string;

  /** Este aplicata migratia 0066 pe baza catre care arata aplicatia?
   *
   *  NU ESTE O SETARE, ESTE STAREA SCHEMEI, si sta pe acelasi obiect fiindca
   *  ecranul care deseneaza cele opt campuri este exact cel care trebuie sa stie
   *  daca ultimele trei pot fi scrise. Cand este false, secțiunea Date firmă arata
   *  cele cinci campuri de la 0063 si spune romaneste despre celelalte trei ca nu
   *  sunt inca active, in loc sa arate casete care nu pot salva.
   *
   *  MERGE IS APPLY: 0066 ajunge in productie pe fuziune, in aproximativ doua
   *  minute, iar codul pleaca din acelasi push si nu aterizeaza in aceeasi secunda.
   *  Fereastra dintre cele doua este singurul motiv pentru care acest camp exista. */
  companyContactReady: boolean;
};

/** CE SCRIE ECRANUL LANGA COTA IMPLICITA, si scrie asta pentru ca nimeni din
 *  echipa de construit nu are raspunsul unui contabil despre ce cota se aplica
 *  materialelor de construcție in Moldova. Intrebarea 3 din
 *  docs/reports/2026-09-24-author-facturare-design.md este cea care il obtine.
 *  Un numar pe care ecranul l-ar prezenta ca stabilit ar fi o presupunere
 *  imbracata in fapt. */
export const VAT_NOTE = "De confirmat cu contabilul.";

/** Cate cifre are numarul in seria lui: RC-2026-0001. */
const NUMBER_WIDTH = 4;

/**
 * Cum arata scris numarul unei facturi emise, din seria si numarul lui.
 *
 * NU ESTE STOCAT NICAIERI, si nici nu trebuie: seria si numarul sunt cele doua
 * coloane, iar asta este a treia copie a aceleiasi informatii. Se compune la
 * afisare, dintr-un singur loc, ca doua ecrane sa nu il scrie altfel.
 */
export function invoiceNumberText(series: string | null, number: number | null): string | null {
  if (!series || number === null || number === undefined) return null;
  return joinSeriesAndNumber(series, number);
}

/** Ce sta intre serie si numar.
 *
 *  CARDUL P3-115, CONSTATAREA G15 a raportului
 *  docs/reports/2026-09-29-critic-bug-sweep-2.md: prefixul implicit este `RC-` si
 *  `invoice_series_for` adauga anul NUMAI cand anul intra in numar, deci cu anul stins
 *  seria este chiar `RC-`, iar lipirea de aici mai punea o cratima: `RC--0001`, pe
 *  fiecare numar. Singura constrangere pe prefix este ca nu este gol.
 *
 *  SEPARATORUL SE PUNE O SINGURA DATA, si asta se decide AICI, in singurul loc care
 *  compune un numar scris: si numarul real si exemplul de pe ecranul de setari trec
 *  prin functiile de mai jos, deci nu exista o a doua regula de pus de acord.
 *
 *  PREFIXUL NU SE SCHIMBA SI NU SE CURATA. O factură deja emisă poartă seria si
 *  numarul ei ingheţate (0064), deci a rescrie prefixul ar fi o coloana ingheţata
 *  atinsa; si oricum prefixul este alegerea proprietarului, iar o cratima la capat este
 *  o alegere rezonabila cand anul intra in numar. Ce se repara este LIPIREA. */
const SERIES_SEPARATOR = "-";

/**
 * Seria si numarul lipite, cu separatorul o singura data.
 *
 * O SERIE CARE SE TERMINA DEJA IN CRATIMA NU MAI PRIMESTE UNA. Aceasta este toata
 * repararea lui G15, si este scrisa aici fiindca aici este singurul loc care lipeste
 * cele doua: `invoiceNumberText`, pentru numarul real, si `invoiceNumberExample`,
 * pentru exemplul de pe ecranul de setari, trec amandoua prin ea. Cu prefixul implicit
 * `RC-` si anul stins, seria ESTE `RC-` si numarul scris era `RC--0001`.
 */
function joinSeriesAndNumber(series: string, number: number): string {
  const separator = series.endsWith(SERIES_SEPARATOR) ? "" : SERIES_SEPARATOR;
  return `${series}${separator}${String(number).padStart(NUMBER_WIDTH, "0")}`;
}

/**
 * Seria in care cade o zi, pe partea de TypeScript.
 *
 * ACEEASI REGULA PE CARE O APLICA public.invoice_series_for DIN BAZA: prefixul, plus
 * anul cand anul intra in numar. Regula este scrisa in doua locuri si asta se vede si
 * se spune: baza este cea care decide seria unei facturi in momentul emiterii, iar
 * aceasta functie exista ca ecranul sa poata spune, INAINTE, daca numarul pe care il
 * arata mai este din seria in care va cadea documentul.
 *
 * CARDUL P3-115, CONSTATAREA G8, jumatatea mai tacuta: numarul aratat in confirmarea de
 * la Emite era prezis intotdeauna pentru seria de AZI, iar operatorul poate pune orice
 * zi de emitere, deci o factură antedatata in decembrie arata un numar din contorul
 * anului curent si primea unul din contorul anului trecut.
 */
export function invoiceSeriesFor(
  seriesPrefix: string,
  numberIncludesYear: boolean,
  day: string,
): string {
  return numberIncludesYear ? `${seriesPrefix}${day.slice(0, 4)}` : seriesPrefix;
}

/**
 * Cum va arata urmatorul numar, pentru exemplul de pe ecranul de setari.
 *
 * Aceeasi regula pe care o aplica public.invoice_series_for in migratia 0063:
 * prefixul, plus anul cand anul intra in numar. Regula este scrisa in doua
 * locuri si asta se vede: aici este un EXEMPLU pe ecran, iar seria reala a unei
 * facturi este intotdeauna cea calculata de baza de date in momentul emiterii.
 * Ecranul nu decide niciodata seria.
 */
export function invoiceNumberExample(
  seriesPrefix: string,
  numberIncludesYear: boolean,
  year: number,
): string {
  // PRIN ACELEASI DOUA FUNCTII PE CARE LE FOLOSESTE NUMARUL REAL, si asta este chiar
  // reparatia lui G15: aici era scrisa a doua copie a regulii seriei si a doua lipire
  // cu cratima, deci exemplul si numarul real puteau sa se deosebeasca, iar cu prefixul
  // implicit `RC-` si anul stins se deosebeau amandoua in acelasi fel, `RC--0001`.
  return joinSeriesAndNumber(invoiceSeriesFor(seriesPrefix, numberIncludesYear, String(year)), 1);
}
