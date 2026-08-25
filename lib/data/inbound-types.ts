// Tipurile si constantele comenzilor de intrare, fara nimic de server.
//
// DE CE EXISTA ACEST FISIER SEPARAT, si nu este o preferinta de organizare:
//
// 1. lib/data/inbound.ts importa "server-only", deci orice component de client
//    care ia din el o VALOARE (nu doar un tip) trage tot modulul in bundle si
//    compilarea cade. Un `import type` se sterge la compilare si nu are aceasta
//    problema; INBOUND_STATUS_LABEL este o valoare si o are.
//
// 2. Un fisier marcat "use server" are voie sa exporte NUMAI functii async.
//    O constanta exportata dintr-un astfel de fisier este o eroare de build, nu
//    un avertisment, pentru ca fiecare export devine un capat de retea.
//
// Deci tot ce este comun si nu este functie async traieste aici.

export type InboundStatus = "pending_arrival" | "arrived";

/** Etichetele romanesti din faza 1, cu diacriticele lor. */
export const INBOUND_STATUS_LABEL: Record<InboundStatus, string> = {
  pending_arrival: "În așteptare",
  arrived: "Recepționată",
};

export type Currency = "EUR" | "RON" | "MDL";

export const CURRENCIES: Currency[] = ["EUR", "RON", "MDL"];

/** Bucketul privat al documentelor. Numele apare o singura data in cod. */
export const DOCS_BUCKET = "rc-docs";

/** Tipurile acceptate, aceleasi ca in constrangerea bucketului din 0002. */
export const ACCEPTED_MIME = ["application/pdf", "image/png", "image/jpeg"] as const;
export const MAX_DOC_BYTES = 10 * 1024 * 1024;

export type InboundLine = {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  unit: import("./units").UnitCode;
  quantity: number;
  unitPrice: number | null;
};

export type StatusEvent = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  at: string;
};

export type InboundOrder = {
  id: string;
  reference: string;
  supplierName: string | null;
  currency: Currency;
  totalMdl: number;
  orderedAt: string | null;
  expectedAt: string | null;
  arrivedAt: string | null;
  status: InboundStatus;
  documentPath: string | null;
  documentUploadedAt: string | null;
  lines: InboundLine[];
  history: StatusEvent[];
};

export type ActionResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; message: string; field?: string };

export type NewOrderLine = {
  productId: string;
  quantity: string;
  unitPrice: string;
};

export type NewOrderInput = {
  supplierName: string;
  currency: string;
  orderedAt: string;
  expectedAt: string;
  lines: NewOrderLine[];
};

export type InboundBatch = {
  id: string;
  productSku: string;
  productName: string;
  quantity: number;
  arrivedAt: string;
};

export type InboundDetail = {
  order: InboundOrder | null;
  batches: InboundBatch[];
};
