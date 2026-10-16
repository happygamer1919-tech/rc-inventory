/**
 * Un numar scris in fisier de import, adus la text simplu (cifre si, eventual,
 * `.` zecimal), sau null cand nu se poate citi fara ghicit.
 *
 * Regula (P3-137 si P3-286): spatiile se scot (si cele fixe, U+00A0 si U+202F, pe care le
 * cuprinde si \s din JavaScript).
 * - Si punct, si virgula: ULTIMUL semn este cel zecimal, celalalt separa miile
 *   ("1.234,56" si "1,234.56" dau 1234.56); grupele de mii au exact 3 cifre.
 * - Numai virgule: una singura este zecimala ("12,5", "0,125"); UNA SINGURA urmata de
 *   exact trei cifre, dupa 1 pana la 3 cifre fara 0 in fata, separa miile ("1,200" este
 *   1200, "100,000" este 100000). Mai multe separa miile.
 * - Numai puncte: mai multe separa miile ("1.250.000"); UNUL singur urmat de
 *   exact 3 cifre separa tot miile ("250.000" este 250000, asa se scrie in
 *   romana), altfel este zecimal ("12.5", "99.99").
 * - Orice altceva (litere, minus, grupe de mii gresite) este null.
 *
 * Doua moduri (P3-310):
 * - "money" (implicit, coloane cu 2 zecimale): regulile de mai sus.
 * - "quantity" (coloane cu 3 zecimale: pragul, orice cantitate): UN singur separator urmat
 *   de exact trei cifre, dupa 1 pana la 3 cifre fara 0 in fata, este NECLAR ("2,500" poate fi
 *   2,5 sau 2500) si da null, ca pe ecranul de iesire pentru client direct (P3-275). Randul
 *   merge la "Rânduri cu erori" cu `unclearQuantityHint`. Mai multe separatoare
 *   ("1.250.000") si orice alta forma se citesc ca mai sus.
 *
 * `maxIntDigits` este limita coloanei numeric din baza de date.
 */
export type ImportNumberMode = "money" | "quantity";

/** Un singur separator urmat de exact trei cifre, dupa 1 pana la 3 cifre fara 0 in fata. */
const SINGLE_SEPARATOR_THREE = /^([1-9]\d{0,2})[.,](\d{3})$/;

/** Adevarat cand `raw` este o cantitate neclara in modul "quantity" ("2,500", "1.125"). */
export function isUnclearQuantity(raw: string): boolean {
  return SINGLE_SEPARATOR_THREE.test(raw.replace(/\s+/g, ""));
}

/** "Scrie 2,5 sau 2500, nu 2,500." pentru o cantitate neclara, cu valoarea din fisier. */
export function unclearQuantityHint(raw: string): string {
  const match = SINGLE_SEPARATOR_THREE.exec(raw.replace(/\s+/g, ""));
  if (!match) return `Scrie o cantitate clară, nu ${raw.trim()}.`;
  const before = match[1] as string;
  const after = match[2] as string;
  const trimmed = after.replace(/0+$/, "");
  // "1,125" nu are un zero de taiat: se scrie "1,1250", care se citeste la fel.
  const decimal = trimmed === after ? `${before},${after}0` : trimmed === "" ? before : `${before},${trimmed}`;
  return `Scrie ${decimal} sau ${before}${after}, nu ${raw.trim()}.`;
}

export function parseImportNumber(
  raw: string,
  maxIntDigits: number,
  mode: ImportNumberMode = "money",
): string | null {
  const value = raw.replace(/\s+/g, "");
  if (!/^[\d.,]+$/.test(value)) return null;
  if (mode === "quantity" && isUnclearQuantity(value)) return null;

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
      const [before, after] = value.split(",") as [string, string];
      // O virgula urmata de exact trei cifre, dupa 1 pana la 3 cifre fara 0 in fata, separa
      // miile ("1,200"); "0,125" si "1234,567" raman zecimale, ca punctul de mai jos.
      if (/^[1-9]\d{0,2}$/.test(before) && /^\d{3}$/.test(after)) {
        integerPart = before + after;
      } else {
        if (!/^\d+$/.test(before) || !/^\d+$/.test(after)) return null;
        integerPart = before;
        fraction = after;
      }
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
