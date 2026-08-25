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
  clientName: string;
  projectName: string;
  lines: NewIssueLine[];
};

export type OutboundDetail = {
  issue: OutboundIssue | null;
};
