import "server-only";

// P3-13c. Devizul fata de realitate: Estimat contra Emis, pe produs, in
// cantitate SI in bani.
//
// ESTE UN FULL OUTER JOIN, SI ASTA ESTE TOT CARDUL. Trei feluri de rand:
// estimat si emis, estimat si neemis, emis fara sa fi fost estimat. Al treilea
// se numeste Neprevazut si este, in cuvintele addendumului, scurgerea pe care
// afacerea nu o vede astazi. A-l scapa ar face comparatia magulitoare si
// inutila.
//
// CELE DOUA COLOANE DE BANI AU BAZE DE PRET DIFERITE, DELIBERAT, SI UN CITITOR
// DE MAINE NU TREBUIE SA "REPARE" ASTA:
//
//   Estimat in MDL   cantitate ori deviz_lines.unit_price_mdl, pretul INGHETAT.
//                    O estimare este o promisiune facuta la un pret cotat
//                    intr-o zi anume.
//   Emis in MDL      cantitate emisa ori products.unit_value_mdl, valoarea de
//                    AZI din catalog, pentru ca raportul de cost masoara
//                    realitatea si P3-11 citeste valoarea curenta.
//
// Sunt doua intrebari diferite si o singura baza de pret nu ar raspunde la
// niciuna.
//
// NU SE CALCULEAZA NIMIC A DOUA OARA. Estimatul vine din getProjectDevizView,
// emisul din getProjectMaterialCost. Doua sume ale aceluiasi lucru sunt felul in
// care doua ecrane ajung sa nu fie de acord, iar cardul cere explicit ca P3-18 sa
// citeasca de aici si nu dintr-o a doua suma.
//
// TOTAL DEVIZ INSEAMNA AICI SUBTOTALUL DE MATERIAL, ADAOSUL EXCLUS, si motivul
// este ca subsolul trebuie sa se adune. Coloana Estimat insumeaza liniile la
// pretul ofertat; totalul devizului de pe fila Deviz adauga adaosul, care nu este
// material si nu are corespondent in coloana Emis. Daca subsolul ar purta totalul
// cu adaos, coloana afisata nu s-ar aduna la el, iar un tabel care nu se aduna
// este un tabel pe care nimeni nu il crede. Ecranul spune pe fata ca adaosul este
// in afara, si arata cat este, ca cele doua file sa poata fi reconciliate.

import { getProjectDevizView, type Deviz, type DevizSummary } from "@/lib/data/deviz";
import { getProjectMaterialCost } from "@/lib/reporting/material-cost";
import type { UnitCode } from "@/lib/data/units";

/** Ce fel de rand este, si de ce apare in tabel. */
export type ComparisonKind =
  /** Estimat si emis. */
  | "both"
  /** Estimat si neemis inca: emis zero, si randul NU se omite. */
  | "estimated_only"
  /** Emis fara sa fi fost estimat. Neprevazut. */
  | "unplanned";

export type ComparisonRow = {
  productId: string;
  sku: string;
  productName: string;
  unit: UnitCode | null;
  kind: ComparisonKind;

  estimatedQty: number;
  issuedQty: number;
  /** emis minus estimat. Pozitiv inseamna ca s-a consumat peste estimare. */
  qtyDifference: number;

  /** cantitate estimata ori pretul INGHETAT de pe linie. */
  estimatedMdl: number;
  /** cantitate emisa ori valoarea CURENTA din catalog. */
  issuedMdl: number;
  /** emis minus estimat, in bani. */
  differenceMdl: number;

  /** Emis peste Estimat. Se semnaleaza, nu se blocheaza. */
  overIssued: boolean;
};

export type ComparisonTotals = {
  /** Suma coloanei Estimat: subtotalul de material la pret ofertat, fara adaos. */
  devizTotalMdl: number;
  /** Suma coloanei Emis. */
  issuedTotalMdl: number;
  /** Emis minus deviz. Negativ inseamna ca s-a consumat sub estimare. */
  varianceMdl: number;
  /** Abaterea ca procent din totalul devizului, sau null cand acesta este zero. */
  variancePercent: number | null;
  /** Adaosul devizului, ARATAT ca subsolul sa poata fi reconciliat cu fila Deviz. */
  adaosMdl: number;
};

export type DevizComparison = {
  /** Versiunile proiectului, ca cititorul sa poata compara una mai veche. */
  versions: DevizSummary[];
  /** Versiunea comparata. null cand proiectul nu are niciun deviz. */
  deviz: Deviz | null;
  rows: ComparisonRow[];
  totals: ComparisonTotals;
  /**
   * Randurile de produs citite din raportul de cost NU s-au adunat la totalul
   * lui. Inseamna ca defalcarea a fost taiata si comparatia ar ascunde un
   * Neprevazut. Ecranul spune asta in loc sa afiseze un tabel incomplet.
   */
  truncated: boolean;
};

/** Rotunjire la ban, aplicata O SINGURA DATA per marime afisata. */
function toBani(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * CAT DE MULTE RANDURI DE PRODUS SE CER DE LA project_material_cost.
 *
 * Functia din 0024 taie defalcarea pe produs la p_limit randuri, cele mai
 * scumpe primele, DAR calculeaza totalul din toate liniile. O taiere ar da deci
 * un tabel scurt cu un subsol corect, adica exact randul Neprevazut lipsa pe
 * care cardul il numeste scurgerea. Se cere mult mai mult decat orice proiect
 * real are, si daca totusi se taie, `truncated` o spune si ecranul refuza sa
 * pretinda ca tabelul este intreg.
 */
const PRODUCT_ROW_CEILING = 2000;

export async function getDevizComparison(
  projectId: string,
  requestedDevizId: string | null,
): Promise<DevizComparison> {
  const [devizView, cost] = await Promise.all([
    getProjectDevizView(projectId, requestedDevizId),
    getProjectMaterialCost(projectId, { limit: PRODUCT_ROW_CEILING }),
  ]);

  const deviz = devizView.open;

  // Emisul, indexat pe produs. Randurile fara product_id nu pot fi comparate cu
  // o linie de deviz si nu exista in defalcarea pe produs a lui 0024, care
  // grupeaza dupa product_id.
  const issued = new Map<string, { qty: number; mdl: number; sku: string | null; unit: string | null; label: string }>();
  for (const r of cost.byProduct) {
    if (!r.productId) continue;
    issued.set(r.productId, {
      qty: r.quantity,
      mdl: r.valueMdl,
      sku: r.sku,
      unit: r.unit,
      label: r.label,
    });
  }

  const rows: ComparisonRow[] = [];

  // 1. Fiecare linie de deviz, EMISA SAU NU. Un produs estimat si neemis apare
  //    cu emis zero si nu se omite.
  for (const line of deviz?.lines ?? []) {
    const hit = issued.get(line.productId);
    const issuedQty = hit ? hit.qty : 0;
    const issuedMdl = hit ? hit.mdl : 0;
    rows.push({
      productId: line.productId,
      sku: line.sku,
      productName: line.productName,
      unit: line.unit,
      kind: hit ? "both" : "estimated_only",
      estimatedQty: line.quantity,
      issuedQty,
      qtyDifference: toBani(issuedQty - line.quantity),
      estimatedMdl: toBani(line.lineTotalMdl),
      issuedMdl: toBani(issuedMdl),
      differenceMdl: toBani(issuedMdl - line.lineTotalMdl),
      overIssued: issuedQty > line.quantity,
    });
    issued.delete(line.productId);
  }

  // 2. CE A RAMAS ESTE NEPREVAZUT: emis fara sa fi fost estimat. Estimatul este
  //    zero, deci orice cantitate emisa este o depasire.
  for (const [productId, hit] of issued) {
    rows.push({
      productId,
      sku: hit.sku ?? "-",
      productName: hit.label,
      unit: (hit.unit as UnitCode | null) ?? null,
      kind: "unplanned",
      estimatedQty: 0,
      issuedQty: hit.qty,
      qtyDifference: toBani(hit.qty),
      estimatedMdl: 0,
      issuedMdl: toBani(hit.mdl),
      differenceMdl: toBani(hit.mdl),
      overIssued: hit.qty > 0,
    });
  }

  // ORDINEA: intai ce s-a estimat, in ordinea devizului, apoi Neprevazutul, cel
  // mai scump primul. Cititorul citeste devizul lui si abia apoi ce nu a
  // planificat nimeni.
  const planned = rows.filter((r) => r.kind !== "unplanned");
  const unplanned = rows
    .filter((r) => r.kind === "unplanned")
    .sort((a, b) => b.issuedMdl - a.issuedMdl || a.sku.localeCompare(b.sku));
  const ordered = planned.concat(unplanned);

  const devizTotalMdl = toBani(ordered.reduce((sum, r) => sum + r.estimatedMdl, 0));
  const issuedTotalMdl = toBani(ordered.reduce((sum, r) => sum + r.issuedMdl, 0));
  const varianceMdl = toBani(issuedTotalMdl - devizTotalMdl);

  // TOTALUL RAPORTULUI DE COST ESTE CALCULAT DIN TOATE LINIILE, defalcarea nu.
  // Daca cele doua nu se potrivesc, defalcarea a fost taiata.
  const issuedFromBreakdown = toBani(cost.byProduct.reduce((sum, r) => sum + r.valueMdl, 0));
  const truncated = toBani(cost.totalValueMdl) !== issuedFromBreakdown;

  return {
    versions: devizView.list,
    deviz,
    rows: ordered,
    totals: {
      devizTotalMdl,
      issuedTotalMdl,
      varianceMdl,
      // IMPARTIREA LA ZERO NU SE INTAMPLA: un deviz de zero arata o liniuta.
      variancePercent: devizTotalMdl === 0 ? null : toBani((varianceMdl / devizTotalMdl) * 100),
      adaosMdl: deviz ? toBani(deviz.adaosMdl) : 0,
    },
    truncated,
  };
}
