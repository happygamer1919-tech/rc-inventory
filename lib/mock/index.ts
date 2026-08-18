// Punctul unic de acces la datele demonstrative.
// Ecranele nu importa niciodata data.ts direct: importa de aici, ca cifrele sa
// fie calculate intr-un singur loc si sa nu se contrazica intre ecrane.

import {
  BATCHES,
  DISPLAY_CURRENCY,
  FIRED_ALERTS,
  INBOUND_ORDERS,
  MOVEMENTS,
  OUTBOUND_ISSUES,
  PRODUCTS,
  SUPPLIERS,
} from "./data";
import type {
  Batch,
  Category,
  FiredAlert,
  InboundOrder,
  Movement,
  OutboundIssue,
  Product,
  Supplier,
  Unit,
} from "./types";

export * from "./types";
export {
  BATCHES,
  DISPLAY_CURRENCY,
  FIRED_ALERTS,
  INBOUND_ORDERS,
  MOVEMENTS,
  OUTBOUND_ISSUES,
  PRODUCTS,
  SUPPLIERS,
};

/* ---------------------------------------------------------------- unitati -- */

/** Eticheta afisata pentru fiecare unitate. Unitatea este fixata de produs si
 *  nu poate fi schimbata la introducere: aceasta este regula demonstrata. */
export const UNIT_LABEL: Record<Unit, string> = {
  m2: "m²",
  lm: "ml",
  buc: "buc",
  sac: "sac",
  kg: "kg",
  rola: "rolă",
  m3: "m³",
};

export const ALL_UNITS: Unit[] = ["m2", "lm", "buc", "sac", "kg", "rola", "m3"];

export function unitLabel(unit: Unit): string {
  return UNIT_LABEL[unit];
}

/* ------------------------------------------------------------- formatare -- */

const NF = new Intl.NumberFormat("ro-MD", { maximumFractionDigits: 0 });
const NF2 = new Intl.NumberFormat("ro-MD", { maximumFractionDigits: 2 });

/** Valoare in moneda unica de afisare. Nu se converteste nimic la rulare. */
export function formatMoney(value: number): string {
  return `${NF.format(Math.round(value))} ${DISPLAY_CURRENCY}`;
}

export function formatQty(value: number, unit: Unit): string {
  return `${NF2.format(value)} ${unitLabel(unit)}`;
}

export function formatNumber(value: number): string {
  return NF.format(value);
}

/** Data in forma zi luna an, pentru afisare in tabele. */
export function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const [datePart] = iso.split(" ");
  const [y, m, d] = datePart.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

/* ------------------------------------------------------------- cautari -- */

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

export function getProductBySku(sku: string): Product | undefined {
  return PRODUCTS.find((p) => p.sku === sku);
}

export function getSupplier(id: string): Supplier | undefined {
  return SUPPLIERS.find((s) => s.id === id);
}

export function supplierName(id: string): string {
  return getSupplier(id)?.name ?? "Furnizor necunoscut";
}

export function productName(id: string): string {
  return getProduct(id)?.name ?? "Produs necunoscut";
}

/* ------------------------------------------------------------ categorii -- */

export const CATEGORIES: Category[] = Array.from(
  new Set(PRODUCTS.map((p) => p.category)),
) as Category[];

/* --------------------------------------------------------------- stocuri -- */

/** Stoc redus inseamna stoc curent sub sau egal cu pragul produsului. */
export function isLowStock(p: Product): boolean {
  return p.stock <= p.threshold;
}

export function isOutOfStock(p: Product): boolean {
  return p.stock === 0;
}

export type StockLevel = "toate" | "redus" | "epuizat" | "suficient";

export function matchesStockLevel(p: Product, level: StockLevel): boolean {
  switch (level) {
    case "redus":
      return isLowStock(p) && !isOutOfStock(p);
    case "epuizat":
      return isOutOfStock(p);
    case "suficient":
      return !isLowStock(p);
    default:
      return true;
  }
}

export function lowStockProducts(): Product[] {
  return PRODUCTS.filter(isLowStock);
}

/** Valoarea totala a stocului, in moneda unica de afisare. */
export function totalStockValue(): number {
  return PRODUCTS.reduce((sum, p) => sum + p.stock * p.unitValueMdl, 0);
}

export function productStockValue(p: Product): number {
  return p.stock * p.unitValueMdl;
}

/* --------------------------------------------------------------- comenzi -- */

export function pendingInbound(): InboundOrder[] {
  return INBOUND_ORDERS.filter((o) => o.status === "În așteptare");
}

export function arrivedInbound(): InboundOrder[] {
  return INBOUND_ORDERS.filter((o) => o.status === "Recepționată");
}

export function pendingOutbound(): OutboundIssue[] {
  return OUTBOUND_ISSUES.filter((o) => o.status === "În așteptare expediere");
}

export function shippedOutbound(): OutboundIssue[] {
  return OUTBOUND_ISSUES.filter((o) => o.status === "Expediată");
}

export function getInbound(id: string): InboundOrder | undefined {
  return INBOUND_ORDERS.find((o) => o.id === id);
}

export function getOutbound(id: string): OutboundIssue | undefined {
  return OUTBOUND_ISSUES.find((o) => o.id === id);
}

/** Valoarea unei iesiri, insumand doar liniile care au pret. */
export function outboundValue(issue: OutboundIssue): number | null {
  const priced = issue.lines.filter((l) => l.salePriceMdl !== null);
  if (priced.length === 0) return null;
  return priced.reduce((s, l) => s + l.quantity * (l.salePriceMdl ?? 0), 0);
}

/* ----------------------------------------------------------- per produs -- */

export function batchesForProduct(productId: string): Batch[] {
  return BATCHES.filter((b) => b.productId === productId).sort((a, b) =>
    b.arrivedAt.localeCompare(a.arrivedAt),
  );
}

export function movementsForProduct(productId: string): Movement[] {
  return MOVEMENTS.filter((m) => m.productId === productId).sort((a, b) =>
    b.at.localeCompare(a.at),
  );
}

export function alertsForProduct(productId: string): FiredAlert[] {
  return FIRED_ALERTS.filter((a) => a.productId === productId);
}

/* ----------------------------------------------------- activitate recenta -- */

export type Activity = {
  id: string;
  at: string;
  kind: "intrare" | "ieșire";
  title: string;
  detail: string;
  reference: string;
};

/** Fluxul de activitate al tabloului de bord: receptii si expedieri, cele mai
 *  recente primele. Derivat din aceleasi comenzi pe care le arata si celelalte
 *  ecrane, ca sa nu spuna doua povesti diferite. */
export function recentActivity(limit = 8): Activity[] {
  const items: Activity[] = [];

  for (const o of INBOUND_ORDERS) {
    if (o.arrivedAt) {
      items.push({
        id: `act-in-${o.id}`,
        at: o.arrivedAt,
        kind: "intrare",
        title: `Recepție de la ${supplierName(o.supplierId)}`,
        detail: `${o.lines.length} ${o.lines.length === 1 ? "poziție" : "poziții"}, ${formatMoney(o.totalMdl)}`,
        reference: o.reference,
      });
    }
  }

  for (const o of OUTBOUND_ISSUES) {
    const when = o.shippedAt ?? o.issuedAt;
    items.push({
      id: `act-out-${o.id}`,
      at: when,
      kind: "ieșire",
      title: `${o.status === "Expediată" ? "Expediere" : "Bon de eliberare"} către ${o.projectName}`,
      detail: `${o.clientName}, ${o.lines.length} ${o.lines.length === 1 ? "poziție" : "poziții"}`,
      reference: o.reference,
    });
  }

  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/* ------------------------------------------------------------- proiecte -- */

/** Perechile client si proiect deja existente, folosite ca sugestii in formularul
 *  de iesire. Un proiect apartine unui client. */
export function knownProjects(): Array<{ client: string; project: string }> {
  const seen = new Set<string>();
  const out: Array<{ client: string; project: string }> = [];
  for (const o of OUTBOUND_ISSUES) {
    const key = `${o.clientName}|${o.projectName}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ client: o.clientName, project: o.projectName });
    }
  }
  return out;
}

export function knownClients(): string[] {
  return Array.from(new Set(OUTBOUND_ISSUES.map((o) => o.clientName)));
}

export * from "./fixtures";
