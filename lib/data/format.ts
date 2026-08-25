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
