// P3-332: UN SINGUR CITITOR DE NUMERE PE FIECARE FORMULAR, ecran si server.
//
// Produsul (prag, valoare unitara, factor de ambalaj), bugetul proiectului, comanda de
// intrare, devizul si factura citeau fiecare textul cu Number(text.replace(",", ".")). Acolo
// "1.250" era 1,25, iar "1 250" si "1.200,50" erau refuzate, in timp ce la tejghea (P3-311,
// P3-314) "1.250" este 1250. Mai grav, banii sunt numeric(14,2) si cantitatile numeric(14,3),
// dar ecranul primea mai multe zecimale si arata totalul din valoarea nerotunjita, iar baza
// salva alta. Fiecare camp de aici trece prin cititorul din price-input.ts, care este cel din
// lib/data/import-number.ts (virgula este zecimala, un punct urmat de trei cifre separa
// miile) si refuza peste 2 zecimale la bani, peste 3 la cantitati.
//
// Fisierul nu are "use server", ca sa poata fi testat fara baza de date. Mesajele sunt cele
// pe care le arata si serverul, deci ecranul si serverul spun acelasi lucru.

import { readMoneyField, readQuantityField } from "./price-input";
import type { NumberField } from "./price-input";

export type FieldValue<T> = { ok: true; value: T } | { ok: false; message: string };

/** Citit cu `empty` pentru o casuta goala. */
function orEmpty(field: NumberField, empty: number | null): FieldValue<number | null> {
  if (field.kind === "error") return { ok: false, message: field.message };
  return { ok: true, value: field.kind === "ok" ? field.value : empty };
}

function positive(field: NumberField, message: string): FieldValue<number> {
  if (field.kind === "error") return { ok: false, message: field.message };
  if (field.kind !== "ok" || field.value <= 0) return { ok: false, message };
  return { ok: true, value: field.value };
}

/* ----------------------------------------------------------------- produs -- */

export const THRESHOLD_INVALID_MESSAGE = "Pragul trebuie să fie un număr pozitiv.";
export const UNIT_VALUE_INVALID_MESSAGE = "Valoarea unitară trebuie să fie un număr pozitiv.";
export const PACKAGE_FACTOR_INVALID_MESSAGE =
  "Factorul de ambalaj trebuie să fie un număr mai mare decât zero.";

/** Pragul de reaprovizionare, numeric(14,3). Gol este 0, ca inainte. */
export function readThreshold(raw: string): FieldValue<number> {
  const r = orEmpty(readQuantityField(raw, { noun: "Pragul", invalid: THRESHOLD_INVALID_MESSAGE }), 0);
  return r.ok ? { ok: true, value: r.value ?? 0 } : r;
}

/** Valoarea unitara din catalog, numeric(14,2). Goala este 0, ca inainte. */
export function readUnitValue(raw: string): FieldValue<number> {
  const r = orEmpty(
    readMoneyField(raw, { noun: "Valoarea unitară", invalid: UNIT_VALUE_INVALID_MESSAGE }),
    0,
  );
  return r.ok ? { ok: true, value: r.value ?? 0 } : r;
}

/** Cate unitati de stoc incap intr-un ambalaj, numeric(14,3), strict peste zero. */
export function readPackageFactor(raw: string): FieldValue<number> {
  return positive(
    readQuantityField(raw, { noun: "Factorul de ambalaj", invalid: PACKAGE_FACTOR_INVALID_MESSAGE }),
    PACKAGE_FACTOR_INVALID_MESSAGE,
  );
}

/* ---------------------------------------------------------------- proiect -- */

export const BUDGET_INVALID_MESSAGE = "Bugetul trebuie să fie un număr pozitiv.";

/** Bugetul proiectului, numeric(14,2). Gol este null (fara buget), zero este un buget. */
export function readBudget(raw: string): FieldValue<number | null> {
  return orEmpty(readMoneyField(raw, { noun: "Bugetul", invalid: BUDGET_INVALID_MESSAGE }), null);
}

/* --------------------------------------------------------- comanda de intrare -- */

export const ORDER_QUANTITY_INVALID_MESSAGE = "Cantitatea trebuie să fie un număr pozitiv.";
export const ORDER_PRICE_INVALID_MESSAGE = "Prețul unitar trebuie să fie un număr pozitiv.";

/** Cantitatea unei pozitii de comanda, numeric(14,3). Goala este null: pozitia se omite. */
export function readOrderQuantity(raw: string): FieldValue<number | null> {
  return orEmpty(
    readQuantityField(raw, { noun: "Cantitatea", invalid: ORDER_QUANTITY_INVALID_MESSAGE }),
    null,
  );
}

/** Pretul unitar al unei pozitii de comanda, numeric(14,2). Gol este null (fara pret). */
export function readOrderUnitPrice(raw: string): FieldValue<number | null> {
  return orEmpty(
    readMoneyField(raw, { noun: "Prețul unitar", invalid: ORDER_PRICE_INVALID_MESSAGE }),
    null,
  );
}

/* ------------------------------------------------------------------ deviz -- */

export const DEVIZ_QUANTITY_INVALID_MESSAGE = "Cantitatea trebuie să fie mai mare decât zero.";

/** Cantitatea unei linii de deviz, numeric(14,3), strict peste zero. */
export function readDevizQuantity(raw: string): FieldValue<number> {
  return positive(
    readQuantityField(raw, { noun: "Cantitatea", invalid: DEVIZ_QUANTITY_INVALID_MESSAGE }),
    DEVIZ_QUANTITY_INVALID_MESSAGE,
  );
}

/* ---------------------------------------------------------------- factura -- */

/** Mesajele de pe o linie de factura incep cu "Poziția N: " si apoi o propozitie cu litera mica;
 *  mesajele cititorului comun incep cu litera mare ("Cantitatea are cel mult 3 zecimale."). */
export function lowerFirst(message: string): string {
  return message.charAt(0).toLowerCase() + message.slice(1);
}

/** Cantitatea unei linii de factura, numeric(14,3), strict peste zero. `invalid` este mesajul
 *  pentru un text care nu este numar (ecranul si serverul isi au fiecare propozitia lor). */
export function readInvoiceQuantity(raw: string, invalid: string): FieldValue<number> {
  return positive(readQuantityField(raw, { noun: "Cantitatea", invalid }), invalid);
}

/** Pretul unitar al unei linii de factura, numeric(14,2). Zero este permis (o pozitie oferita),
 *  un camp gol nu (constrangerea invoice_lines_unit_price_non_negative din 0063). */
export function readInvoiceUnitPrice(raw: string, invalid: string): FieldValue<number> {
  const field = readMoneyField(raw, { noun: "Prețul unitar", invalid });
  if (field.kind === "error") return { ok: false, message: field.message };
  if (field.kind !== "ok") return { ok: false, message: invalid };
  return { ok: true, value: field.value };
}
