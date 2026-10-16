/**
 * P3-209: pretul tastat de operator in casuta de pe iesirea pentru client direct.
 *
 * Casuta era <input type="number">. Pe un browser a carui limba nu este romana,
 * "12,50" lasa valoarea goala desi textul ramane vizibil, iar pozitia se salva
 * fara pret. Acum casuta este text, iar sirul se citeste aici: "12,50" si "12.50"
 * dau acelasi 12.5, spatiile se ignora, orice altceva este refuzat cu glas tare.
 *
 * P3-253: un punct urmat de exact trei cifre este separator de mii (notatia
 * romaneasca): "1.200" este 1200, "1.200.000" este 1200000, "1.200,50" este
 * 1200.5. Un punct cu una sau doua cifre ramane zecimal ("12.5", "12.50").
 *
 * P3-311: UN SINGUR CITITOR. Regulile de mai sus nu mai sunt scrise aici: cantitatea si
 * pretul, pe ecran (tejghea si proiect) si pe server, se citesc cu parseImportNumber din
 * lib/data/import-number.ts, cel din import (P3-310). Un numar scris la tejghea se citeste
 * deci exact ca acelasi numar scris intr-un fisier. Aici raman doar limitele coloanelor si
 * felul in care se spune rezultatul.
 */
import { isUnclearQuantity, parseImportNumber } from "./import-number";
import type { ImportNumberMode } from "./import-number";

export type PriceInput =
  | { kind: "empty" }
  | { kind: "ok"; value: number; text: string }
  | { kind: "invalid" };

export const PRICE_INVALID_MESSAGE = "Preț invalid. Exemplu: 12,50";

export type QuantityInput =
  | { kind: "empty" }
  | { kind: "ok"; value: number; text: string }
  | { kind: "invalid" }
  | { kind: "ambiguous" };

export const QUANTITY_INVALID_MESSAGE = "Cantitate invalidă. Exemplu: 2,5";

// P3-275: "2.500" poate fi 2,5 sau 2500; cantitatea nu ghicește, operatorul scrie clar.
export const QUANTITY_AMBIGUOUS_MESSAGE =
  "Cantitate neclară: scrieți 2,5 pentru zecimale sau 2500 fără punct.";

/** Mesajul de afisat pentru o cantitate refuzata, sau null cand textul se citeste. */
export function quantityProblem(raw: string): string | null {
  const q = parseQuantityText(raw);
  if (q.kind === "invalid") return QUANTITY_INVALID_MESSAGE;
  if (q.kind === "ambiguous") return QUANTITY_AMBIGUOUS_MESSAGE;
  return null;
}

/**
 * Limitele coloanelor din baza: pretul este numeric(14,2) (12 cifre intregi), cantitatea
 * numeric(14,3) (11 cifre intregi).
 * - Pret (mod "money"): un singur separator urmat de exact trei cifre separa miile
 *   ("1.200" si "1,200" sunt 1200); "1.200,50" si "1,200.50" sunt 1200,5.
 * - Cantitate (mod "quantity"): un singur separator urmat de exact trei cifre este neclar
 *   ("2,500" poate fi 2,5 sau 2500) si e refuzat; "1.200.000" este 1200000.
 */
const PRICE_INT_DIGITS = 12;
const QUANTITY_INT_DIGITS = 11;

function readNumberText(raw: string, mode: ImportNumberMode): PriceInput {
  // \s acopera si spatiul fix (U+00A0), deci un numar lipit din alta aplicatie merge.
  const compact = raw.replace(/\s/g, "");
  if (compact === "") return { kind: "empty" };
  const text = parseImportNumber(compact, mode === "quantity" ? QUANTITY_INT_DIGITS : PRICE_INT_DIGITS, mode);
  if (text === null) return { kind: "invalid" };
  const value = Number(text);
  if (!Number.isFinite(value)) return { kind: "invalid" };
  return { kind: "ok", value, text };
}

export function parseQuantityText(raw: string): QuantityInput {
  if (isUnclearQuantity(raw)) return { kind: "ambiguous" };
  const r = readNumberText(raw, "quantity");
  if (r.kind === "ok" && r.value <= 0) return { kind: "invalid" };
  return r;
}

export function parsePriceText(raw: string): PriceInput {
  return readNumberText(raw, "money");
}

/**
 * P3-303: pretul unei pozitii ca numar pentru totalul de pe ecran: 0 cand casuta este
 * goala sau textul nu se citeste. Ecranul si serverul trec prin aceeasi parsePriceText,
 * deci "1.250" arata 1250 pe ecran si se salveaza 1250.
 */
export function priceAmount(raw: string): number {
  const p = parsePriceText(raw);
  return p.kind === "ok" ? p.value : 0;
}

/**
 * P3-311: cantitatea unei pozitii ca numar pentru totalul de pe ecran: 0 cand casuta este
 * goala sau textul nu se citeste. Ca priceAmount, trece prin acelasi cititor ca serverul.
 */
export function quantityAmount(raw: string): number {
  const q = parseQuantityText(raw);
  return q.kind === "ok" ? q.value : 0;
}
