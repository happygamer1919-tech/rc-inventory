/**
 * P3-209: pretul tastat de operator in casuta de pe iesirea pentru client direct.
 *
 * Casuta era <input type="number">. Pe un browser a carui limba nu este romana,
 * "12,50" lasa valoarea goala desi textul ramane vizibil, iar pozitia se salva
 * fara pret. Acum casuta este text, iar sirul se citeste aici: "12,50" si "12.50"
 * dau acelasi 12.5, spatiile se ignora, orice altceva este refuzat cu glas tare.
 */
export type PriceInput =
  | { kind: "empty" }
  | { kind: "ok"; value: number; text: string }
  | { kind: "invalid" };

export const PRICE_INVALID_MESSAGE = "Preț invalid. Exemplu: 12,50";

export function parsePriceText(raw: string): PriceInput {
  // \s acopera si spatiul fix (U+00A0), deci un numar lipit din alta aplicatie merge.
  const compact = raw.replace(/\s/g, "");
  if (compact === "") return { kind: "empty" };
  if (!/^\d+([.,]\d+)?$/.test(compact)) return { kind: "invalid" };
  const text = compact.replace(",", ".");
  const value = Number(text);
  if (!Number.isFinite(value)) return { kind: "invalid" };
  return { kind: "ok", value, text };
}
