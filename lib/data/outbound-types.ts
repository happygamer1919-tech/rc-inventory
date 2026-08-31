// Tipurile si constantele iesirilor, fara nimic de server.
//
// Acelasi motiv ca la inbound-types: un component de client care ia de aici o
// valoare nu trebuie sa traga in bundle un modul marcat "server-only", iar un
// fisier "use server" nu are voie sa exporte decat functii async.

export type OutboundStatus = "awaiting_shipment" | "shipped";

/** Etichetele romanesti din faza 1, cu diacriticele lor. */
export const OUTBOUND_STATUS_LABEL: Record<OutboundStatus, string> = {
  awaiting_shipment: "În așteptare expediere",
  shipped: "Expediată",
};

export type OutboundLine = {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  unit: import("./units").UnitCode;
  quantity: number;
  salePriceMdl: number | null;
};

export type OutboundIssue = {
  id: string;
  reference: string;
  /** P3-10: destinatia ca inregistrare, pentru legaturi. Null cat timp randul
   *  istoric nu a fost reconciliat de P3-04. */
  projectId: string | null;
  clientId: string | null;
  clientName: string;
  projectName: string;
  issuedAt: string;
  shippedAt: string | null;
  status: OutboundStatus;
  lines: OutboundLine[];
  history: import("./inbound-types").StatusEvent[];
};

export type NewIssueLine = {
  productId: string;
  quantity: string;
  salePriceMdl: string;
};

export type NewIssueInput = {
  /** P3-04: destinatia este un proiect, nu doua siruri. Numele de client si de
   *  proiect se citesc de pe proiect in migratia 0018, nu se trimit de aici,
   *  ca cele doua reprezentari sa nu poata descrie destinatii diferite cat timp
   *  exista amandoua. */
  projectId: string;
  /** Calea de rezerva, folosita numai cat timp migratiile fazei 3 nu sunt
   *  aplicate si nu exista niciun proiect de ales. Vezi lib/data/outbound.ts. */
  clientName?: string;
  projectName?: string;
  lines: NewIssueLine[];
};

export type OutboundDetail = {
  issue: OutboundIssue | null;
};
