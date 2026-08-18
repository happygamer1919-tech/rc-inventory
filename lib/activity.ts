// Fluxul de activitate, construit din orice pereche de liste de comenzi.
// Extras din modulul de date ca sa poata fi calculat si peste starea vie a
// sesiunii, nu doar peste fotografia initiala.

import { formatMoney, supplierName } from "@/lib/mock";
import type { InboundOrder, OutboundIssue } from "@/lib/mock";

export type Activity = {
  id: string;
  at: string;
  kind: "intrare" | "ieșire";
  title: string;
  detail: string;
  reference: string;
};

export function buildActivity(
  inbound: InboundOrder[],
  outbound: OutboundIssue[],
  limit = 8,
): Activity[] {
  const items: Activity[] = [];

  for (const o of inbound) {
    if (!o.arrivedAt) continue;
    items.push({
      id: `act-in-${o.id}`,
      at: o.arrivedAt,
      kind: "intrare",
      title: `Recepție de la ${supplierName(o.supplierId)}`,
      detail: `${o.lines.length} ${o.lines.length === 1 ? "poziție" : "poziții"}, ${formatMoney(o.totalMdl)}`,
      reference: o.reference,
    });
  }

  for (const o of outbound) {
    items.push({
      id: `act-out-${o.id}`,
      at: o.shippedAt ?? o.issuedAt,
      kind: "ieșire",
      title: `${o.status === "Expediată" ? "Expediere" : "Bon de eliberare"} către ${o.projectName}`,
      detail: `${o.clientName}, ${o.lines.length} ${o.lines.length === 1 ? "poziție" : "poziții"}`,
      reference: o.reference,
    });
  }

  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
