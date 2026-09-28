// Facturare: forma unei facturi citite. Cardul P3-110, goal G65 partea 3.
//
// FISIER FARA "server-only", ca facturare-types.ts si facturare-list-types.ts:
// ecranul facturii este un component de browser si are nevoie de tipuri.
//
// CE NU ESTE AICI: niciun total calculat si niciun numar compus. Totalurile sunt
// cele pe care le-au scris declansatoarele din migratia 0063, iar numarul scris se
// compune cu invoiceNumberText din facturare-types.ts, care este singurul loc care
// stie cum arata el. Doua locuri care ar compune acelasi sir sunt doua locuri care
// pot ajunge sa il scrie altfel.

import type { UnitCode } from "./units";
import type { InvoiceStatus } from "./facturare-types";

/** O linie de factura, exact cum este stocata, plus numele produsului ei. */
export type InvoiceLineView = {
  id: string;
  /** Null pentru o linie care nu este un produs din catalog: un transport, de exemplu. */
  productId: string | null;
  productSku: string | null;
  productName: string | null;
  description: string | null;
  unit: UnitCode;
  quantity: number;
  /** INGHETAT la scrierea liniei. Nimic nu il reia din catalog (migratia 0063). */
  unitPriceMdl: number;
  /** Procent, PE LINIE. Ecranul arata o cota pentru toata factura. */
  vatRate: number;
  lineSubtotalMdl: number;
  lineVatMdl: number;
  lineTotalMdl: number;
  sortOrder: number;
};

/** Ce se scrie pe o linie: descrierea cand exista, altfel numele produsului.
 *
 *  UN SINGUR LOC DECIDE, fiindca ecranul facturii, ecranul de creare si fila de pe
 *  fisa clientului scriu toate trei acelasi lucru. Constrangerea
 *  invoice_lines_product_or_description din 0063 garanteaza ca una din cele doua
 *  exista, deci ultima ramura este pentru un rand pe care politicile de citire l-ar
 *  ascunde si nu pentru o linie fara nimic pe ea. */
export function invoiceLineLabel(line: {
  description: string | null;
  productName: string | null;
}): string {
  const description = (line.description ?? "").trim();
  if (description !== "") return description;
  const name = (line.productName ?? "").trim();
  return name === "" ? "Poziție fără denumire" : name;
}

/** Cine emite: Rapid Construct, din randul unic de setari. Sirurile goale sunt
 *  goale pe ecran si nu inventate: jumatatea necompletata a unui document trebuie
 *  sa se vada ca necompletata (migratia 0063, sectiunea 2). */
export type InvoiceIssuerParty = {
  name: string;
  fiscalCode: string;
  address: string;
  bank: string;
  iban: string;
};

/** Catre cine: clientul, cu IDNO-ul si adresa lui, si o legatura catre fisa. */
export type InvoiceClientParty = {
  id: string;
  name: string;
  fiscalCode: string;
  address: string;
};

/** Ce s-a intamplat cu factura si cand.
 *
 *  DIN CELE SASE COLOANE DE STAMPILA ALE MIGRATIEI 0063, nu din
 *  public.status_history. Antetul acelei migratii spune de ce in terminii ei:
 *  public.status_entity nu poarta eticheta 'invoice', iar adaugarea unei etichete
 *  de enum este o migratie de sine statatoare, pe care cardul acesta nu are voie sa
 *  o scrie. Cele sase coloane sunt chiar mecanismul pus acolo pentru asta. */
export type InvoiceEventKind = "created" | "issued" | "paid" | "cancelled";

export type InvoiceEvent = {
  kind: InvoiceEventKind;
  /** Momentul, ISO. */
  at: string;
  /** Numele celui care a facut-o, sau null cand nu se poate citi. */
  by: string | null;
};

const EVENT_LABEL: Record<InvoiceEventKind, string> = {
  created: "Ciornă creată",
  issued: "Factură emisă",
  paid: "Marcată plătită",
  cancelled: "Anulată",
};

export function invoiceEventLabel(kind: InvoiceEventKind): string {
  return EVENT_LABEL[kind];
}

/** O factura intreaga, pentru ecranul ei. */
export type InvoiceDetail = {
  id: string;
  series: string | null;
  number: number | null;
  status: InvoiceStatus;
  /** Ziua emiterii, `YYYY-MM-DD`, sau null cat timp este ciorna. */
  issueDate: string | null;
  dueDate: string | null;
  notes: string | null;
  /** Motivul anularii. Prezent exact cand starea este `cancelled` (0063). */
  cancelReason: string | null;
  subtotalMdl: number;
  vatTotalMdl: number;
  totalMdl: number;
  issuer: InvoiceIssuerParty;
  client: InvoiceClientParty;
  project: { id: string; name: string } | null;
  /** Iesirea din care a fost facuta, cand a fost facuta din una. */
  outboundIssue: { id: string; reference: string } | null;
  lines: InvoiceLineView[];
  events: InvoiceEvent[];
};

/** Cota de TVA aratata pentru toata factura.
 *
 *  DATELE O STOCHEAZA PE LINIE si ecranul arata una, cat timp Rapid Construct
 *  vinde un singur fel de lucru (0063, comentariul de pe invoice_lines.vat_rate).
 *  Cand liniile nu sunt de acord intre ele, se intoarce null si ecranul nu scrie
 *  nicio cota pentru intreg: o singura cota pe o factura cu doua cote ar fi un
 *  numar fals, iar liniile isi poarta oricum fiecare cota. */
export function invoiceSingleVatRate(lines: InvoiceLineView[]): number | null {
  if (lines.length === 0) return null;
  const first = lines[0]!.vatRate;
  return lines.every((l) => l.vatRate === first) ? first : null;
}

/** Ce poate face operatorul, pe stare, si nimic mai mult.
 *
 *  O SINGURA SURSA, citita si de ecran si de specificatie, ca tabelul din card sa
 *  nu fie scris a doua oara si sa se poata desincroniza. Un control care exista
 *  numai ca sa refuze este defectul pentru care au fost ridicate cardurile P3-61 si
 *  P3-98, deci ce nu este permis nu se deseneaza deloc. */
export type InvoiceAction = "edit" | "issue" | "markPaid" | "cancel";

const ACTIONS: Record<InvoiceStatus, InvoiceAction[]> = {
  draft: ["edit", "issue", "cancel"],
  issued: ["markPaid", "cancel"],
  paid: [],
  cancelled: [],
};

export function invoiceActionsFor(status: InvoiceStatus): InvoiceAction[] {
  return ACTIONS[status];
}
