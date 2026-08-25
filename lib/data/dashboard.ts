import "server-only";

// Cifrele tabloului de bord, toate dintr-o singura citire.
//
// NIMIC NU ESTE SCRIS DE MANA. In faza 1 numarul de produse a fost o data
// literalul 26, corect in acea clipa si gresit pentru totdeauna dupa aceea. Este
// scris in docs/LEARNINGS.md si este exact ce interzice acest card.
//
// UN SINGUR SET DE INTEROGARI pentru toate blocurile, ca doua blocuri de pe
// acelasi ecran sa nu poata spune numere diferite despre acelasi lucru.
//
// BAZA GOALA NU ESTE O EROARE. Faza 2 porneste fara niciun rand si fara migrare
// din vreun sistem vechi, deci fiecare cifra de aici trebuie sa aiba un raspuns
// corect pentru zero: valoarea stocului este 0, nu gol, si nicio impartire nu
// se face la un numar care poate fi zero.

import { listProducts, type CatalogProduct } from "./products";
import { listInboundOrders } from "./inbound";
import { listOutboundIssues } from "./outbound";
import type { InboundOrder } from "./inbound-types";
import type { OutboundIssue } from "./outbound-types";

export type ActivityItem = {
  id: string;
  at: string;
  kind: "intrare" | "ieșire";
  title: string;
  detail: string;
  reference: string;
};

export type DashboardData = {
  products: CatalogProduct[];
  inbound: InboundOrder[];
  outbound: OutboundIssue[];
  stockValue: number;
  productCount: number;
  lowStock: CatalogProduct[];
  outOfStock: CatalogProduct[];
  pendingInbound: InboundOrder[];
  pendingOutbound: OutboundIssue[];
  activity: ActivityItem[];
};

export async function loadDashboard(): Promise<DashboardData> {
  const [products, inbound, outbound] = await Promise.all([
    listProducts(),
    listInboundOrders(),
    listOutboundIssues(),
  ]);

  const active = products.filter((p) => p.active);

  // Stoc redus inseamna stoc la sau sub prag, definitia fazei 1, neschimbata.
  const lowStock = active.filter((p) => p.stock <= p.threshold);
  const outOfStock = active.filter((p) => p.stock === 0);

  const stockValue = active.reduce((s, p) => s + p.stock * p.unitValueMdl, 0);

  const pendingInbound = inbound.filter((o) => o.status === "pending_arrival");
  const pendingOutbound = outbound.filter((o) => o.status === "awaiting_shipment");

  return {
    products,
    inbound,
    outbound,
    stockValue,
    productCount: active.length,
    lowStock,
    outOfStock,
    pendingInbound,
    pendingOutbound,
    activity: buildActivity(inbound, outbound, 8),
  };
}

/**
 * Fluxul de activitate: receptiile si iesirile, imbinate, cele mai noi primele.
 *
 * O comanda nereceptionata nu este activitate: nu s-a intamplat inca nimic cu
 * marfa. O iesire apare de la creare, pentru ca atunci pleaca stocul.
 */
function buildActivity(
  inbound: InboundOrder[],
  outbound: OutboundIssue[],
  limit: number,
): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const o of inbound) {
    if (!o.arrivedAt) continue;
    items.push({
      id: `act-in-${o.id}`,
      at: o.arrivedAt,
      kind: "intrare",
      title: `Recepție de la ${o.supplierName ?? "furnizor"}`,
      detail: `${o.lines.length} ${o.lines.length === 1 ? "poziție" : "poziții"}`,
      reference: o.reference,
    });
  }

  for (const o of outbound) {
    items.push({
      id: `act-out-${o.id}`,
      at: o.shippedAt ?? o.issuedAt,
      kind: "ieșire",
      title: `${o.status === "shipped" ? "Expediere" : "Bon de eliberare"} către ${o.projectName}`,
      detail: `${o.clientName}, ${o.lines.length} ${o.lines.length === 1 ? "poziție" : "poziții"}`,
      reference: o.reference,
    });
  }

  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/** Pragurile si stocul curent, pentru ecranul de memento. */
export async function loadThresholds(): Promise<CatalogProduct[]> {
  const products = await listProducts();
  return products.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name, "ro"));
}
