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
  // Primul grup are 1 pana la 3 cifre si nu incepe cu 0, ca "0.500" sa ramana 0,5.
  const thousands = /^[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(compact);
  if (!thousands && !/^\d+([.,]\d+)?$/.test(compact)) return { kind: "invalid" };
  const text = thousands ? compact.replace(/\./g, "").replace(",", ".") : compact.replace(",", ".");
  const value = Number(text);
  if (!Number.isFinite(value)) return { kind: "invalid" };
  return { kind: "ok", value, text };
}
