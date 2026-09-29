// Aritmetica unei facturi, pe numere INTREGI. Cardul P3-111, goal G67, finding G4
// din docs/reports/2026-09-29-critic-bug-sweep-2.md.
//
// DE CE EXISTA ACEST FISIER. Ecranul de compunere a facturii isi calcula
// previzualizarea cu
//
//   Math.round((value + Number.EPSILON) * 100) / 100
//
// peste numere binare, in timp ce baza scrie figura cu `round(numeric, 2)` peste
// zecimale exacte, care rotunjeste jumatatea DEPARTE DE ZERO. Antetul ecranului
// promitea, si promite in continuare, ca cele doua se potrivesc. ORDINEA se
// potrivea; ARITMETICA nu putea: o cantitate si un pret exacte in zecimal nu sunt
// exacte in binar. Masurat in raport:
//
//   cantitate   pret unitar   pe ecran   in baza
//   0,333       1000,00        333,00     333,00
//   1,005           1,00         1,01       1,01
//   8,165           1,00         8,16       8,17    <- defectul
//   1234,565        1,00      1234,57    1234,57
//
// `8.165` se pastreaza in binar putin SUB 8,165, deci `Math.round(816.4999...)`
// este 816, in timp ce PostgreSQL rotunjeste zecimalul exact 8,165 in sus la 8,17.
// `Number.EPSILON` nu salveaza nimic: este aproximativ 2,2e-16, se adauga INAINTE
// de inmultirea cu 100, si pentru orice valoare peste 1 este cu ordine de marime
// sub propriul pas de virgula mobila al acelei valori.
//
// CE FACE ACEST FISIER IN SCHIMB. Nicio valoare nu trece prin virgula mobila. O
// cantitate devine un intreg in MIIMI, fiindca public.invoice_lines.quantity este
// `numeric(14,3)`; un pret si o suma devin intregi in BANI, fiindca coloanele de
// bani sunt `numeric(14,2)`; o cota devine un intreg in SUTIMI, fiindca vat_rate
// este `numeric(5,2)`. Intregul se citeste DIN SIRUL TASTAT, cifra cu cifra, si nu
// prin `Number(...)`, deci nu exista niciun moment in care valoarea sa fie
// aproximata.
//
// BIGINT SI NU NUMBER, si nu este exces de zel: `numeric(14,3)` inmultit cu
// `numeric(14,2)` poate depasi `Number.MAX_SAFE_INTEGER`, iar o previzualizare
// exacta pentru figuri obisnuite si greșită in liniste pentru figuri mari ar fi
// exact clasa de defect pe care acest card o inchide.
//
// ORDINEA ESTE A DECLANSATORULUI, NESCHIMBATA. `invoice_lines_compute_totals` din
// migratia 0063 face, in aceasta ordine:
//
//   line_subtotal_mdl := round(quantity * unit_price_mdl, 2)
//   line_vat_mdl      := round(line_subtotal_mdl * vat_rate / 100, 2)
//   line_total_mdl    := line_subtotal_mdl + line_vat_mdl
//
// iar `invoice_lines_sync_invoice_totals` aduna pe factura figuri care sunt DEJA
// rotunjite. Functiile de mai jos fac exact asta, o data pe figura, in aceeasi
// secventa. Rotunjirea numai la final da alt numar si o coloana care nu se adună.
//
// NIMIC DE AICI NU AJUNGE IN BAZA. Cele trei figuri ale unei linii si cele trei ale
// facturii sunt scrise numai de declansatoarele din 0063 si nu sunt acceptate
// niciodata de la un apelant. Acest fisier calculeaza ce se ARATA.

/** Zecimalele coloanei `quantity`, `numeric(14,3)`. */
export const QUANTITY_DECIMALS = 3;

/** Zecimalele coloanelor de bani, `numeric(14,2)`. */
export const MONEY_DECIMALS = 2;

/** Zecimalele coloanei `vat_rate`, `numeric(5,2)`. */
export const RATE_DECIMALS = 2;

/**
 * Un numar tastat, devenit intregul scalat pe care coloana il stocheaza, EXACT.
 *
 * Null cand campul nu este un numar pozitiv scris zecimal. Virgula zecimala este
 * acceptata, fiindca asa se scriu numerele pe un document romanesc, exact cum o
 * accepta deja `parseRate` din facturare-actions.ts.
 *
 * ZECIMALELE DE PESTE SCARA COLOANEI SE ROTUNJESC DEPARTE DE ZERO, care este ce ar
 * face si coloana la scriere: `numeric(14,3)` care primeste 1,0005 stocheaza 1,001.
 * Se citeste prima cifra aruncata si nimic mai mult, fiindca pentru jumatatea exacta
 * regula este "in sus" si pentru orice altceva prima cifra decide singura.
 */
export function scaledFromInput(raw: string, decimals: number): bigint | null {
  const clean = raw.trim().replace(",", ".");
  if (clean === "") return null;
  const parts = /^(\d*)(?:\.(\d*))?$/.exec(clean);
  if (!parts) return null;
  const whole = parts[1] ?? "";
  const fraction = parts[2] ?? "";
  // "." singur, sau sir gol dupa curatare, nu este un numar.
  if (whole === "" && fraction === "") return null;

  const kept = fraction.slice(0, decimals).padEnd(decimals, "0");
  const dropped = fraction.slice(decimals);
  let value = BigInt((whole === "" ? "0" : whole) + kept);
  if (dropped !== "" && dropped.charCodeAt(0) >= /* "5" */ 53) value += 1n;
  return value;
}

/** Acelasi lucru, dar un camp care nu este un numar devine zero, ca previzualizarea
 *  sa arate ceva cat timp operatorul tasteaza. Refuzurile de pe ecran sunt scrise
 *  separat si nu depind de functia asta. */
export function scaledOrZero(raw: string, decimals: number): bigint {
  return scaledFromInput(raw, decimals) ?? 0n;
}

/** Impartire cu rotunjire DEPARTE DE ZERO, ca `round(numeric, n)` din PostgreSQL.
 *  Divizorul este intotdeauna o putere a zecei si este par, deci `d / 2n` este exact. */
function roundedDiv(value: bigint, divisor: bigint): bigint {
  const half = divisor / 2n;
  return value < 0n ? -((-value + half) / divisor) : (value + half) / divisor;
}

export type LineFigures = {
  /** Subtotalul liniei, in bani. */
  subtotal: bigint;
  /** TVA-ul liniei, in bani, calculat din subtotalul DEJA rotunjit. */
  vat: bigint;
  /** Totalul liniei, in bani: suma celor doua de mai sus, fara o a treia rotunjire. */
  total: bigint;
};

/**
 * Cele trei figuri ale unei linii, in bani, exact ca `invoice_lines_compute_totals`.
 *
 *   subtotal = round(miimi/1000 * bani/100, 2)  ->  round(miimi * bani / 1000) bani
 *   TVA      = round(subtotal * sutimi/10000, 2) -> round(subtotal * sutimi / 10000) bani
 *   total    = subtotal + TVA
 */
export function lineFigures(
  quantityThousandths: bigint,
  priceBani: bigint,
  rateHundredths: bigint,
): LineFigures {
  const subtotal = roundedDiv(quantityThousandths * priceBani, 1000n);
  const vat = roundedDiv(subtotal * rateHundredths, 10_000n);
  return { subtotal, vat, total: subtotal + vat };
}

/** Subsolul facturii: suma unor figuri care sunt DEJA rotunjite, ca
 *  `invoice_lines_sync_invoice_totals`. Nu se mai rotunjeste nimic aici. */
export function invoiceFigures(lines: LineFigures[]): LineFigures {
  let subtotal = 0n;
  let vat = 0n;
  let total = 0n;
  for (const line of lines) {
    subtotal += line.subtotal;
    vat += line.vat;
    total += line.total;
  }
  return { subtotal, vat, total };
}

/** Banii ca lei, pentru `formatMoneyExact`, care formateaza cu exact doua zecimale.
 *  Intregul de bani este exact pana peste orice suma reala, iar impartirea la 100 se
 *  face o singura data, la afisare, dupa ce toata aritmetica s-a terminat. */
export function leiFromBani(bani: bigint): number {
  return Number(bani) / 100;
}
