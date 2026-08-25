// Formatarea numerelor, banilor si datelor pentru ecranele reale.
//
// Copiate ca fapt din lib/mock/index.ts, ca ecranele sa arate identic dupa ce
// stratul demonstrativ dispare la P2-06. Aceleasi locale, aceleasi cifre
// zecimale, aceeasi moneda de afisare.

import { unitLabel, type UnitCode } from "./units";

/** Moneda unica in care se afiseaza valoarea stocului. Nimic nu se converteste. */
export const DISPLAY_CURRENCY = "MDL";

const NF = new Intl.NumberFormat("ro-MD", { maximumFractionDigits: 0 });
const NF2 = new Intl.NumberFormat("ro-MD", { maximumFractionDigits: 2 });

export function formatMoney(value: number): string {
  return `${NF.format(Math.round(value))} ${DISPLAY_CURRENCY}`;
}

export function formatQty(value: number, unit: UnitCode): string {
  return `${NF2.format(value)} ${unitLabel(unit)}`;
}

export function formatNumber(value: number): string {
  return NF.format(value);
}

/** Pluralul romanesc pentru un substantiv numarat.
 *
 *  Romana are trei forme, nu doua: 1 cere singularul, numerele al caror rest la
 *  100 este intre 1 si 19 cer pluralul simplu, iar restul cer "de" plus plural.
 *  Asa se ajunge la "1 categorie", "3 categorii" si "20 de categorii", si tot
 *  asa la "119 categorii" dar "120 de categorii".
 *
 *  Zero ia pluralul simplu, "0 categorii", nu "0 de categorii". In practica
 *  ecranele arata starea goala inainte sa ajunga la numarator, dar functia nu
 *  se bazeaza pe asta.
 *
 *  DEFECT REPARAT LA CRIT-12: ecranul de setari scria `{n} categorii` direct,
 *  deci cu o singura categorie afisa "1 categorii", iar o singura categorie
 *  este exact ce are productia. */
export function plural(count: number, one: string, many: string): string {
  const n = Math.abs(Math.trunc(count));
  const shown = formatNumber(count);
  if (n === 1) return `${shown} ${one}`;
  const lastTwo = n % 100;
  if (n === 0 || (lastTwo >= 1 && lastTwo <= 19)) return `${shown} ${many}`;
  return `${shown} de ${many}`;
}

/** Data in forma zi.luna.an. */
export function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const datePart = iso.split("T")[0]!.split(" ")[0]!;
  const [y, m, d] = datePart.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

/** Cautare fara diacritice si fara majuscule.
 *
 *  Operatorul scrie repede si aproape niciodata cu diacritice, asa ca o cautare
 *  dupa "tigla" trebuie sa gaseasca "Țiglă". Descompunerea NFD desparte si
 *  s-virgula si t-virgula, nu doar accentele latine uzuale. Defectul acesta a
 *  fost gasit pe ecran in faza 1 si este scris in docs/LEARNINGS.md. */
export function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
