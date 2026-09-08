import "server-only";

// P3-18. Necesar de materiale: ce mai trebuie cumparat pentru santierele vii.
//
// FORMULA, SI FIECARE TERMEN AL EI ESTE O DECIZIE A ADDENDUMULUI:
//
//   necesar(produs) = suma pe proiecte de
//                       max(0, cantitate din devizul ACCEPTAT
//                              minus cantitate DEJA EMISA acelui proiect)
//   deficit(produs) = max(0, necesar minus stocul curent)
//
// PATRU STARI INTRA: lead, offer, contract SI active. Cardul autorat excludea
// active, addendumul il include, iar R-058 a decis in favoarea addendumului.
// Motivul este scaderea de mai jos: necesarul ramas al unui santier in lucru
// este exact ce ii mai trebuie, iar excluderea lui ar ascunde cea mai mare
// cerere angajata de pe tabla. suspended si closed nu cumpara nimic si raman
// afara.
//
// SCADEREA SE PODESTE LA ZERO PE PROIECT SI PE PRODUS, INAINTE DE AGREGARE,
// NICIODATA DUPA. Un proiect care a emis peste estimare contribuie ZERO pentru
// produsul acela, nu un numar negativ care ar anula in liniste necesarul real al
// altui proiect.
//
// NUMAI UN DEVIZ ACCEPTAT CONTEAZA, si anume CEL MAI MARE numar de versiune
// aflat in starea accepted. Insumarea tuturor versiunilor ar inmulti necesarul cu
// numarul de revizuiri. Un proiect poate purta deasupra o versiune trimisa sau o
// ciorna; ele nu conteaza, pentru ca o oferta pe care nimeni nu a acceptat-o nu
// este un angajament.
//
// CANTITATEA EMISA SE CITESTE DIN CALCULUL LUI P3-13c, niciodata resumata aici.
// STOCUL SE CITESTE DIN CALCULUL EXISTENT, acelasi pe care il foloseste ecranul
// de inventar. Doua sume ale aceluiasi lucru sunt felul in care doua ecrane ajung
// sa nu fie de acord.
//
// NU SE PONDEREAZA DUPA PROBABILITATE. Un prospect si un contract semnat cantaresc
// la fel. O pondere pe stare este o judecata comerciala pe care nu a facut-o
// nimeni si ar cere un factor pe care numai Mihai il poate stabili; inventarea
// unuia ar produce un numar gresit rostit cu incredere. Ecranul arata in schimb
// DEFALCAREA PE STARE, ca cititorul sa vada cat din total este doar un prospect si
// sa decida singur.
//
// UN PROIECT FARA DEVIZ ACCEPTAT ESTE EXCLUS SI NUMARAT. Un numar orientat spre
// viitor care omite in tacere santierele pe care nimeni nu le-a estimat este un
// numar care produce o comanda prea mica.

import { listProjects } from "@/lib/data/projects-list";
import { LIVE_STATUSES } from "@/lib/data/projects-list-types";
import type { ProjectRow } from "@/lib/data/projects-list-types";
import type { ProjectStatus } from "@/lib/data/projects-types";
import { getProjectDevizView } from "@/lib/data/deviz";
import { getDevizComparison } from "@/lib/reporting/deviz-comparison";
import { listProducts } from "@/lib/data/products";
import type { UnitCode } from "@/lib/data/units";

/** Cat cere un singur proiect dintr-un singur produs, dupa scadere. */
export type ProcurementContribution = {
  projectId: string;
  projectName: string;
  status: ProjectStatus;
  requiredQty: number;
};

export type ProcurementRow = {
  productId: string;
  sku: string;
  productName: string;
  unit: UnitCode | null;
  requiredQty: number;
  stockQty: number;
  /** necesar minus stoc, podit la zero. Un surplus NU se arata ca deficit negativ. */
  shortfallQty: number;
  /** Necesarul defalcat pe starea proiectului care il cere. Neponderat. */
  byStatus: Record<ProjectStatus, number>;
  /** Proiectele care contribuie, ca randul sa poata fi explicat. */
  projects: ProcurementContribution[];
};

/** Un proiect viu care NU are deviz acceptat, deci nu este reprezentat. */
export type ExcludedProject = {
  id: string;
  name: string;
  status: ProjectStatus;
  /** De ce nu intra, in romana, gata de afisat. */
  reason: string;
};

export type ProcurementNeed = {
  rows: ProcurementRow[];
  includedProjects: number;
  excluded: ExcludedProject[];
};

const ZERO_BY_STATUS = (): Record<ProjectStatus, number> => ({
  lead: 0,
  offer: 0,
  contract: 0,
  active: 0,
  suspended: 0,
  closed: 0,
});

/** Rotunjire la a treia zecimala: cantitatile sunt zecimale, banii nu intra aici. */
function toQty(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Toate proiectele din cele patru stari vii.
 *
 * SE PAGINEAZA PRIN INTEROGAREA EXISTENTA, nu se scrie o a doua. listProjects
 * pagineaza la PROJECTS_PAGE_SIZE si un raport care ar citi doar prima pagina ar
 * raporta un necesar prea mic fara sa spuna. Bucla se opreste pe pageCount, pe
 * care aceeasi interogare il intoarce.
 */
async function allLiveProjects(): Promise<ProjectRow[]> {
  const out: ProjectRow[] = [];
  let page = 1;
  let pageCount = 1;
  do {
    const result = await listProjects({
      q: "",
      statuses: LIVE_STATUSES,
      allStatuses: false,
      clientId: "",
      page,
    });
    out.push(...result.rows);
    pageCount = result.pageCount;
    page += 1;
    // O plasa, ca o interogare care nu avanseaza sa nu invarta la nesfarsit.
  } while (page <= pageCount && page <= 200);
  return out;
}

export async function getProcurementNeed(): Promise<ProcurementNeed> {
  const [projects, products] = await Promise.all([allLiveProjects(), listProducts()]);

  const stock = new Map(products.map((p) => [p.id, p.stock]));
  const catalogue = new Map(products.map((p) => [p.id, p]));

  const byProduct = new Map<string, ProcurementRow>();
  const excluded: ExcludedProject[] = [];
  let includedProjects = 0;

  for (const project of projects) {
    const view = await getProjectDevizView(project.id, null);
    // CEL MAI MARE NUMAR DE VERSIUNE AFLAT IN accepted. Lista vine deja ordonata
    // descrescator dupa versiune, deci prima potrivire este cea mai mare.
    const acceptedVersion = view.list.find((v) => v.status === "accepted");

    if (!acceptedVersion) {
      excluded.push({
        id: project.id,
        name: project.name,
        status: project.status,
        reason:
          view.list.length === 0
            ? "Nu are niciun deviz"
            : "Are devize, dar niciunul acceptat",
      });
      continue;
    }

    // CALCULUL LUI P3-13c, nu o a doua suma. Randurile lui poarta deja estimatul
    // devizului cerut si cantitatea emisa proiectului, pe produs.
    const comparison = await getDevizComparison(project.id, acceptedVersion.id);
    includedProjects += 1;

    for (const line of comparison.rows) {
      // NEPREVAZUTUL NU ESTE UN NECESAR. Este material deja emis pe care nimeni
      // nu l-a estimat, deci estimatul lui este zero si scaderea ar da zero
      // oricum; se sare explicit ca sa fie citit de ce.
      if (line.kind === "unplanned") continue;

      const required = toQty(Math.max(0, line.estimatedQty - line.issuedQty));
      if (required === 0) continue;

      let row = byProduct.get(line.productId);
      if (!row) {
        const product = catalogue.get(line.productId);
        row = {
          productId: line.productId,
          sku: line.sku,
          productName: line.productName,
          unit: line.unit,
          requiredQty: 0,
          stockQty: product ? product.stock : (stock.get(line.productId) ?? 0),
          shortfallQty: 0,
          byStatus: ZERO_BY_STATUS(),
          projects: [],
        };
        byProduct.set(line.productId, row);
      }

      row.requiredQty = toQty(row.requiredQty + required);
      row.byStatus[project.status] = toQty(row.byStatus[project.status] + required);
      row.projects.push({
        projectId: project.id,
        projectName: project.name,
        status: project.status,
        requiredQty: required,
      });
    }
  }

  const rows = [...byProduct.values()].map((row) => ({
    ...row,
    // DEFICITUL SE PODESTE LA ZERO. Un produs cu stoc suficient nu are deficit,
    // si un surplus nu se arata ca un deficit negativ.
    shortfallQty: toQty(Math.max(0, row.requiredQty - row.stockQty)),
    projects: row.projects.sort((a, b) => b.requiredQty - a.requiredQty || a.projectName.localeCompare(b.projectName)),
  }));

  // Cel mai mare deficit primul: asta este intrebarea ecranului. La deficit egal,
  // dupa necesar, si apoi dupa cod, ca ordinea sa fie stabila intre rulari.
  rows.sort(
    (a, b) => b.shortfallQty - a.shortfallQty || b.requiredQty - a.requiredQty || a.sku.localeCompare(b.sku),
  );

  return { rows, includedProjects, excluded };
}
