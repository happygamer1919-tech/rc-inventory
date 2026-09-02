// P3-12. Buget, deviz acceptat si cost real: trei numere, nu doua.
//
// SUNT TREI INTREBARI DIFERITE, si de aceea toate trei stau pe fisa
// neascunse, cum cere R-058 delta 12:
//
//   budget_mdl               ce a decis afacerea sa cheltuie
//   totalul devizului acceptat  ce a fost de acord clientul sa plateasca
//   costul real              ce a plecat din depozit
//
// Oricare doua dintre ele spun o poveste incompleta. Fara totalul devizului nu
// se poate deosebi o lucrare peste buget de una sub-cotata, si aceea este chiar
// deosebirea pe care un om o cauta cand deschide fisa.
//
// ABATEREA SI CONSUMATUL SUNT CONTRA BUGETULUI, si sunt etichetate ca atare pe
// ecran. O a doua abatere contra devizului este un lucru rezonabil de dorit si
// NU este in acest card.
//
// NU RECALCULEAZA NIMIC. Costul vine din lib/reporting/material-cost.ts si
// totalul devizului din lista pe care lib/data/deviz.ts o construieste deja cu
// devizTotals, adaosul inclus. Daca acest fisier ar ajunge sa insumeze el linii
// de deviz sau de iesire, acela ar fi defectul: doua ecrane care calculeaza
// acelasi numar in doua locuri sunt doua ecrane care intr-o zi nu vor fi de
// acord.

import type { DevizSummary } from "@/lib/data/deviz";

export type ProjectBudgetSummary = {
  /** Ce a decis afacerea sa cheltuie. null este NORMAL: un lead nu are buget. */
  budgetMdl: number | null;
  /** Totalul versiunii acceptate curente, adaosul inclus. null cand nu exista. */
  acceptedDevizTotalMdl: number | null;
  /** Versiunea careia ii apartine totalul de mai sus, pentru eticheta. */
  acceptedDevizVersion: number | null;
  /** Ce a plecat din depozit. Intotdeauna un numar: zero iesiri este zero. */
  actualCostMdl: number;
  /** buget minus real. null cand nu exista buget de comparat. */
  varianceMdl: number | null;
  /** real / buget * 100. null cand bugetul lipseste SAU este zero. */
  consumedPercent: number | null;
};

/**
 * Totalul devizului ACCEPTAT curent.
 *
 * Lista vine deja ordonata descrescator dupa versiune din
 * getProjectDevizView, deci prima intrare acceptata ESTE cea curenta. Ordinea
 * se re-impune aici oricum, cu o copie, fiindca a te baza pe ordinea in care
 * ti-a fost dat un tablou este a te baza pe o proprietate a apelantului.
 */
function currentAccepted(list: DevizSummary[]): DevizSummary | null {
  const accepted = list.filter((d) => d.status === "accepted");
  if (accepted.length === 0) return null;
  return [...accepted].sort((a, b) => b.version - a.version)[0];
}

export function projectBudgetSummary(
  budgetMdl: number | null,
  devizList: DevizSummary[],
  actualCostMdl: number,
): ProjectBudgetSummary {
  const accepted = currentAccepted(devizList);

  // UN BUGET ZERO NU IMPARTE. Bugetul este nullable prin 0021 fiindca un lead
  // nu are inca unul, dar zero este si el o valoare pe care cineva o poate
  // salva, si impartirea la ea da Infinity, care pe ecran arata ca un procent
  // enorm si real. Amandoua cazurile dau null, si null se randeaza ca o liniuta.
  const divisible = budgetMdl !== null && budgetMdl !== 0;

  return {
    budgetMdl,
    acceptedDevizTotalMdl: accepted ? accepted.totalMdl : null,
    acceptedDevizVersion: accepted ? accepted.version : null,
    actualCostMdl,
    varianceMdl: budgetMdl === null ? null : budgetMdl - actualCostMdl,
    consumedPercent: divisible ? (actualCostMdl / (budgetMdl as number)) * 100 : null,
  };
}
