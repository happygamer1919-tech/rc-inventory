// P3-268: citirea pozitiilor unei iesiri, pe server, cu ACELEASI functii ca ecranul
// (lib/data/price-input.ts). Inainte, serverul inlocuia doar virgula cu punct, deci
// "1.200" ajungea 1,2 pe server desi ecranul il citea 1200. Fisierul nu are
// "use server", ca sa poata fi testat fara baza de date.

import {
  PRICE_DECIMALS_MESSAGE,
  PRICE_INVALID_MESSAGE,
  QUANTITY_AMBIGUOUS_MESSAGE,
  QUANTITY_DECIMALS_MESSAGE,
  QUANTITY_INVALID_MESSAGE,
  parsePriceText,
  parseQuantityText,
} from "./price-input";
import type { NewIssueLine } from "./outbound-types";

export type ProcessedIssueLine = {
  product_id: string;
  quantity: number;
  sale_price_mdl: number | null;
};

export type ProcessedIssueLines =
  | { ok: true; lines: ProcessedIssueLine[] }
  | { ok: false; message: string };

export function processIssueLines(input: NewIssueLine[]): ProcessedIssueLines {
  const lines: ProcessedIssueLine[] = [];
  for (const l of input) {
    const q = parseQuantityText(String(l.quantity));
    if (q.kind === "invalid") return { ok: false, message: QUANTITY_INVALID_MESSAGE };
    if (q.kind === "ambiguous") return { ok: false, message: QUANTITY_AMBIGUOUS_MESSAGE };
    // P3-332: mai mult de 3 zecimale la cantitate, mai mult de 2 la pret: refuzat, nu rotunjit de baza.
    if (q.kind === "tooManyDecimals") return { ok: false, message: QUANTITY_DECIMALS_MESSAGE };
    const p = parsePriceText(String(l.salePriceMdl));
    if (p.kind === "invalid") return { ok: false, message: PRICE_INVALID_MESSAGE };
    if (p.kind === "tooManyDecimals") return { ok: false, message: PRICE_DECIMALS_MESSAGE };
    lines.push({
      product_id: l.productId.trim(),
      // Cantitate goala ramane 0, ca verificarea pozitiei umplute pe jumatate sa o prinda.
      quantity: q.kind === "ok" ? q.value : 0,
      sale_price_mdl: p.kind === "ok" ? p.value : null,
    });
  }
  return { ok: true, lines };
}
