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

// P3-90. Momentul unei note, in ora Chisinaului. Partile sunt cifre si se lipesc
// aici, nu se ia sirul formatat intreg: separatorii din ICU pot diferi intre Node
// si browser, iar ecranul este randat in amandoua.
const DATE_TIME_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Chisinau",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Un moment `timestamptz` in forma zi.luna.an, ora:minut, ora Chisinaului. */
export function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return formatDate(iso);
  const parts = DATE_TIME_PARTS.formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("day")}.${part("month")}.${part("year")}, ${part("hour")}:${part("minute")}`;
}

// Locale-ul este ro-MD, acelasi ca la numere, ca fisierul sa aiba unul singur.
// Pentru o data scrisa in cuvinte scrie identic cu ro-RO, cu t si s cu virgula
// (verificat in Node si in Chromium). Fusul este UTC la construire si la
// formatare, deci nicio ora locala nu poate muta ziua.
const DATE_WORDS = new Intl.DateTimeFormat("ro-MD", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Data scrisa in cuvinte, in romana: "marti, 1 decembrie 2026".
 *
 *  Primeste sirul YYYY-MM-DD al unui camp de data si intoarce "" cand campul
 *  este gol sau cand ziua nu exista. Nu schimba ce se salveaza: doar il arata.
 *
 *  P3-41. Campul nativ de data aseaza ziua si luna dupa limba browserului, nu
 *  dupa pagina. Pe un browser in engleza, tastele 01122026 pastreaza 12
 *  ianuarie. Textul acesta spune ziua care chiar se salveaza, inainte de
 *  salvare. */
export function formatDateWords(iso: string | null): string {
  if (!iso) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  // setUTCFullYear, nu Date.UTC: Date.UTC muta anii 0-99 in 1900-1999.
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) {
    return "";
  }
  return DATE_WORDS.format(date);
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
