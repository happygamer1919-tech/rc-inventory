/**
 * Un numar scris in fisier de import, adus la text simplu (cifre si, eventual,
 * `.` zecimal), sau null cand nu se poate citi fara ghicit.
 *
 * Regula (P3-137): spatiile se scot (si cele fixe, U+00A0 si U+202F, pe care le
 * cuprinde si \s din JavaScript).
 * - Si punct, si virgula: ULTIMUL semn este cel zecimal, celalalt separa miile
 *   ("1.234,56" si "1,234.56" dau 1234.56); grupele de mii au exact 3 cifre.
 * - Numai virgule: una singura este zecimala ("12,5"), mai multe separa miile.
 * - Numai puncte: mai multe separa miile ("1.250.000"); UNUL singur urmat de
 *   exact 3 cifre separa tot miile ("250.000" este 250000, asa se scrie in
 *   romana), altfel este zecimal ("12.5", "99.99").
 * - Orice altceva (litere, minus, grupe de mii gresite) este null.
 *
 * `maxIntDigits` este limita coloanei numeric din baza de date.
 */
export function parseImportNumber(raw: string, maxIntDigits: number): string | null {
  const value = raw.replace(/\s+/g, "");
  if (!/^[\d.,]+$/.test(value)) return null;

  const dots = value.split(".").length - 1;
  const commas = value.split(",").length - 1;

  let integerPart: string;
  let fraction = "";

  if (dots > 0 && commas > 0) {
    const lastDot = value.lastIndexOf(".");
    const lastComma = value.lastIndexOf(",");
    const decimalMark = lastDot > lastComma ? "." : ",";
    const thousandsMark = decimalMark === "." ? "," : ".";
    const cut = Math.max(lastDot, lastComma);
    const grouped = readThousands(value.slice(0, cut), thousandsMark);
    fraction = value.slice(cut + 1);
    if (grouped === null || !/^\d+$/.test(fraction)) return null;
    integerPart = grouped;
  } else if (commas > 0) {
    if (commas === 1) {
      [integerPart, fraction] = value.split(",") as [string, string];
      if (!/^\d+$/.test(integerPart) || !/^\d+$/.test(fraction)) return null;
    } else {
      const grouped = readThousands(value, ",");
      if (grouped === null) return null;
      integerPart = grouped;
    }
  } else if (dots > 1) {
    const grouped = readThousands(value, ".");
    if (grouped === null) return null;
    integerPart = grouped;
  } else if (dots === 1) {
    const [before, after] = value.split(".") as [string, string];
    if (/^[1-9]\d{0,2}$/.test(before) && /^\d{3}$/.test(after)) {
      integerPart = before + after;
    } else {
      if (!/^\d+$/.test(before) || !/^\d+$/.test(after)) return null;
      integerPart = before;
      fraction = after;
    }
  } else {
    integerPart = value;
  }

  if (integerPart.length < 1 || integerPart.length > maxIntDigits) return null;
  return fraction === "" ? integerPart : `${integerPart}.${fraction}`;
}

/** "1.250.000" cu `mark` ".": cifrele lipite, sau null cand grupele nu sunt 1 pana la 3 cifre
 *  la inceput (fara 0 in fata) si exact 3 dupa aceea. */
function readThousands(text: string, mark: string): string | null {
  const groups = text.split(mark);
  if (groups.length < 2) return null;
  const [first, ...rest] = groups as [string, ...string[]];
  if (!/^[1-9]\d{0,2}$/.test(first)) return null;
  if (!rest.every((group) => /^\d{3}$/.test(group))) return null;
  return groups.join("");
}
