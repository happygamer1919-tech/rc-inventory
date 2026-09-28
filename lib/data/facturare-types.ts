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
  return `${series}-${String(number).padStart(NUMBER_WIDTH, "0")}`;
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
  const series = numberIncludesYear ? `${seriesPrefix}${year}` : seriesPrefix;
  return `${series}-${String(1).padStart(NUMBER_WIDTH, "0")}`;
}
