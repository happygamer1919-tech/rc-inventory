// P3-76, constatarea F9 a lui Ivan. LISTA CHEILOR PE CARE CALLBACK-UL DE
// EXTRAGERE LE CUNOASTE, SI AVERTISMENTUL PENTRU ORICE ALTA CHEIE.
//
// AVERTIZEAZA, NU REFUZA NICIODATA. Asa a decis F9: "we take warn, never refuse,
// so nothing Andre sends today starts failing". O cheie necunoscuta produce o
// linie in jurnalul serverului si atat: nu schimba un cod HTTP, nu intra in
// raspuns, nu se stocheaza nicaieri si nu muta nimic din ce ruta decide.
//
// DE CE EXISTA. Pana la acest card o cheie pe care nu o citim era acceptata si
// ignorata in tacere. Asa s-au pierdut `supplier` si `pages`: expeditorul le
// trimite, ruta citeste `supplier_name` si `_meta.page_count`, si nimic nu a
// spus-o pana cand cineva a comparat listele de mana
// (docs/reports/2026-09-15-executor-orange-sample-count-notes-callback-keys.md).
//
// CE SE VERIFICA: cheile de la nivelul de sus si cheile fiecarei linii. Interiorul
// lui `_meta` NU se verifica: este blocul de diagnostic al expeditorului, stocat
// verbatim prin EXT-09, si fiecare cheie din el este pastrata.
//
// CELE CINCI CHEI ALE CARDULUI EXT-34 SUNT CUNOSCUTE, desi nimic nu le citeste
// inca. Expeditorul le trimite deja pe toate cinci, deci fara ele fiecare
// callback real ar produce un avertisment din prima zi, iar un avertisment care
// apare mereu este un avertisment pe care nu il mai citeste nimeni. Stau intr-o
// lista proprie, ca ziua in care EXT-34 le citeste sa nu mute nimic.
//
// DE CE .mjs SI NU .ts: acelasi motiv ca numeric-field.mjs.
// scripts/poc-free/check-callback-keys.mjs il importa sub node 20 in `quality`,
// fara baza de date si fara browser.
//
// NU ARUNCA NICIODATA, NU CITESTE RETEAUA SI NU CITESTE MEDIUL.

/** Cheile de la nivelul de sus pe care ruta le citeste astazi. */
export const ROUTE_TOP_LEVEL_KEYS = Object.freeze([
  "order_id",
  "status",
  "error_code",
  "document_source",
  "supplier_name",
  "order_date",
  "subtotal",
  "vat_amount",
  "document_total",
  "prices_include_vat",
  "vat_rate",
  "currency",
  "currency_raw",
  "order_ref",
  "order_ref_series",
  "reason",
  "lines",
  "_meta",
]);

/** Cheile unei linii pe care ruta le citeste astazi. */
export const ROUTE_LINE_KEYS = Object.freeze([
  "product_name",
  "quantity",
  "unit",
  "unit_raw",
  "unit_price",
  "line_total",
  "currency",
  "currency_raw",
  "category",
  "category_raw",
]);

/** EXT-34: trimise deja de expeditor, citite de nimic pana cand cardul acela
 *  livreaza. Cunoscute, ca sa nu avertizeze. */
export const EXT34_TOP_LEVEL_KEYS = Object.freeze(["document_type", "client_ref"]);
export const EXT34_LINE_KEYS = Object.freeze(["supplier_code", "description", "line_total_source"]);

const TOP_LEVEL = new Set([...ROUTE_TOP_LEVEL_KEYS, ...EXT34_TOP_LEVEL_KEYS]);
const LINE = new Set([...ROUTE_LINE_KEYS, ...EXT34_LINE_KEYS]);

/** Cel mult atatea chei numite intr-un avertisment, si atatea caractere dintr-o
 *  cheie. Numele cheilor vin de la expeditor, deci nu au voie sa umple jurnalul. */
export const MAX_KEYS_NAMED = 20;
export const MAX_KEY_LENGTH = 64;

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Cheile necunoscute, pe nivelul de sus si pe fiecare linie.
 *
 * Un corp care nu este obiect, un `lines` care nu este tablou si o linie care nu
 * este obiect nu dau nimic: pe acelea le refuza sau le accepta ruta, dupa
 * regulile ei, si aceasta functie nu are ce spune despre ele.
 *
 * `line` este numarul liniei, de la 1, acelasi cu line_no din
 * extraction_draft_lines.
 */
export function unknownCallbackKeys(body) {
  const topLevel = [];
  const lines = [];
  if (!isPlainObject(body)) return { topLevel, lines };
  for (const k of Object.keys(body)) {
    if (!TOP_LEVEL.has(k)) topLevel.push(k);
  }
  if (Array.isArray(body.lines)) {
    body.lines.forEach((l, i) => {
      if (!isPlainObject(l)) return;
      const keys = Object.keys(l).filter((k) => !LINE.has(k));
      if (keys.length > 0) lines.push({ line: i + 1, keys });
    });
  }
  return { topLevel, lines };
}

/** O cheie, citata JSON si scurtata, ca un nume trimis de altcineva sa nu poata
 *  rupe linia de jurnal sau sa se dea drept alta linie. */
function quote(k) {
  const s = String(k);
  return JSON.stringify(s.length > MAX_KEY_LENGTH ? `${s.slice(0, MAX_KEY_LENGTH)}...` : s);
}

/**
 * Textul avertismentului, sau null cand nu exista nicio cheie necunoscuta.
 *
 * O SINGURA LINIE PE CALLBACK. order_id-ul este cel trimis, citat, sau `?` cand
 * lipseste: avertismentul se scrie inaintea validarii, deci si pe un payload
 * care va fi refuzat.
 */
export function unknownKeysWarning(body) {
  const { topLevel, lines } = unknownCallbackKeys(body);
  const named = [
    ...topLevel.map((k) => quote(k)),
    ...lines.flatMap(({ line, keys }) => keys.map((k) => `linia ${line} ${quote(k)}`)),
  ];
  if (named.length === 0) return null;
  const orderId = isPlainObject(body) && typeof body.order_id === "string" ? quote(body.order_id) : "?";
  const shown = named.slice(0, MAX_KEYS_NAMED).join(", ");
  const more = named.length > MAX_KEYS_NAMED ? ` si inca ${named.length - MAX_KEYS_NAMED}` : "";
  return (
    `[extraction-callback] chei necunoscute, acceptate si ignorate (P3-76, F9), ` +
    `order_id ${orderId}: ${shown}${more}`
  );
}

/**
 * Scrie avertismentul, o data, daca exista chei necunoscute. Intoarce textul
 * scris sau null.
 *
 * NU ARUNCA, NICI CAND JURNALUL ARUNCA. O cheie necunoscuta nu are voie sa
 * schimbe raspunsul, iar o exceptie de aici l-ar schimba intr-un 500.
 */
export function warnUnknownCallbackKeys(body, warn = console.warn) {
  try {
    const message = unknownKeysWarning(body);
    if (message !== null) warn(message);
    return message;
  } catch {
    return null;
  }
}
