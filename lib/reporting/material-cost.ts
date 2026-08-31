import "server-only";

// P3-11. Costul materialului pe proiect, intr-un singur loc.
//
// CARDUL CERE UN SINGUR MODUL, iar motivul este scris in el: doua implementari
// ale aceluiasi numar sunt felul in care doua ecrane ajung sa nu fie de acord in
// fata clientului. Fila Cost de pe fisa proiectului si cardul de buget care vine
// mai tarziu citesc amandoua de aici.
//
// FORMULA ESTE CANTITATE ORI VALOAREA DIN CATALOG, nu pretul de vanzare.
// sale_price_mdl raspunde la "cat s-a facturat" si este de cele mai multe ori
// gol, pentru ca Rapid Construct elibereaza material catre santierele proprii
// fara sa il factureze.
//
// LIMITARE REALA, SCRISA PE ECRAN SI NU ASCUNSA: unit_value_mdl este valoarea
// CURENTA din catalog. Nu exista o valoare inregistrata la momentul iesirii, deci
// editarea pretului unui produs schimba retroactiv fiecare total istoric care il
// contine. Nota din josul filei spune exact asta. Remediul adevarat este o
// coloana unit_value_at_issue_mdl pe outbound_lines, iar acela este alt card.

import { createClient } from "@/lib/supabase/server";

/** O linie de defalcare, pe produs sau pe luna. */
export type CostBreakdownRow = {
  /** Eticheta gata de afisat: numele produsului sau luna in romana. */
  label: string;
  productId: string | null;
  sku: string | null;
  unit: string | null;
  /** Prima zi a lunii, in Europe/Chisinau, doar pentru defalcarea lunara. */
  monthStart: string | null;
  quantity: number;
  valueMdl: number;
};

export type ProjectMaterialCost = {
  /** Totalul pe tot proiectul, si el exista si cand nu este nicio iesire. */
  totalQuantity: number;
  totalValueMdl: number;
  byProduct: CostBreakdownRow[];
  byMonth: CostBreakdownRow[];
  /** Cate iesiri nu au inca un proiect. Excluse din total, raportate separat. */
  unassignedIssues: number;
  /** Filtrul cu care s-a calculat, ca ecranul sa nu il deduca a doua oara. */
  shippedOnly: boolean;
};

const MONTHS_RO = [
  "ianuarie",
  "februarie",
  "martie",
  "aprilie",
  "mai",
  "iunie",
  "iulie",
  "august",
  "septembrie",
  "octombrie",
  "noiembrie",
  "decembrie",
] as const;

/** "2026-08-01" devine "august 2026".
 *
 *  Etichetele de luna sunt romanesti si intregi, nu numerice: cardul cere asta,
 *  si "08/2026" pe un ecran romanesc este o scapare in engleza deghizata in
 *  cifre. Gruparea in Europe/Chisinau s-a facut deja in SQL, asa ca aici se
 *  citeste sirul de date fara sa se construiasca un Date, care ar reintroduce
 *  fusul orar al serverului exact acolo unde tocmai a fost scos. */
function monthLabelRo(monthStart: string | null): string {
  if (!monthStart) return "-";
  const [y, m] = monthStart.split("T")[0]!.split("-");
  const index = Number(m) - 1;
  if (!y || Number.isNaN(index) || index < 0 || index > 11) return monthStart;
  return `${MONTHS_RO[index]} ${y}`;
}

type CostRpcRow = {
  row_kind: string;
  label: string | null;
  product_id: string | null;
  sku: string | null;
  unit: string | null;
  month_start: string | null;
  quantity: number | string | null;
  value_mdl: number | string | null;
};

const EMPTY = (shippedOnly: boolean): ProjectMaterialCost => ({
  totalQuantity: 0,
  totalValueMdl: 0,
  byProduct: [],
  byMonth: [],
  unassignedIssues: 0,
  shippedOnly,
});

/**
 * Costul materialului consumat de un proiect, cu defalcarile lui.
 *
 * ESTE O INTEROGARE, NU UN TOTAL STOCAT. Fara coloana materializata, fara job de
 * noapte, fara cache. Volumul este de ordinul miilor de randuri, iar un total
 * cached gresit este mai rau decat unul corect calculat incet.
 */
export async function getProjectMaterialCost(
  projectId: string,
  options: { shippedOnly?: boolean; limit?: number } = {},
): Promise<ProjectMaterialCost> {
  const shippedOnly = options.shippedOnly ?? false;
  const supabase = await createClient();

  const [cost, unassigned] = await Promise.all([
    supabase.rpc("project_material_cost", {
      p_project_id: projectId,
      p_shipped_only: shippedOnly,
      p_limit: options.limit ?? 5,
    }),
    supabase.rpc("unassigned_outbound_count"),
  ]);

  if (cost.error || !cost.data) return EMPTY(shippedOnly);

  const rows = cost.data as CostRpcRow[];
  const num = (v: number | string | null) => Number(v ?? 0) || 0;

  const map = (r: CostRpcRow): CostBreakdownRow => ({
    label: r.row_kind === "month" ? monthLabelRo(r.month_start) : r.label ?? "-",
    productId: r.product_id,
    sku: r.sku,
    unit: r.unit,
    monthStart: r.month_start,
    quantity: num(r.quantity),
    valueMdl: num(r.value_mdl),
  });

  const total = rows.find((r) => r.row_kind === "total");

  return {
    totalQuantity: total ? num(total.quantity) : 0,
    totalValueMdl: total ? num(total.value_mdl) : 0,
    byProduct: rows.filter((r) => r.row_kind === "product").map(map),
    byMonth: rows.filter((r) => r.row_kind === "month").map(map),
    // Numaratorul este un scalar, deci vine ca numar si nu ca tablou de randuri.
    unassignedIssues: unassigned.error ? 0 : Number(unassigned.data ?? 0) || 0,
    shippedOnly,
  };
}
