// Unitatile de masura: valoarea stocata si eticheta afisata.
//
// Enumul unit_code din migratia 0001 pastreaza tokenuri englezesti (m2, lm, pcs,
// bag, kg, roll, m3). Interfata este romaneasca. Traducerea traieste aici, in
// stratul de prezentare, exact cum spune defaults-ul cardului P2-01: o valoare
// de enum nu este text de interfata.
//
// Etichetele sunt identice cu cele din faza 1, ca ecranele sa arate la fel.

export type UnitCode = "m2" | "lm" | "pcs" | "bag" | "kg" | "roll" | "m3" | "t" | "l";

const UNIT_LABEL: Record<UnitCode, string> = {
  m2: "m²",
  lm: "ml",
  pcs: "buc",
  bag: "sac",
  kg: "kg",
  roll: "rolă",
  m3: "m³",
  // P3-33. Tona si litrul, adaugate de migratia 0030.
  //
  // ETICHETA ESTE t SI NU "tona", si l si nu "litru", fiindca asa se scriu pe un
  // document de furnizor si acolo le citeste operatorul mai intai. Tiparul
  // fisierului este ca tokenul stocat sa fie englezesc si eticheta romaneasca;
  // aici cele doua coincid, ceea ce nu este o scapare, este alfabetul.
  //
  // NICIO CONVERSIE NU ESTE INTRODUSA AICI SAU ORIUNDE. O tona nu este invatata
  // sa fie o mie de kilograme, fiindca inmultirea tacuta cu o mie este CHIAR
  // defectul pe care acest card il repara. Cine adauga vreodata un factor de
  // conversie il adauga cu un card care spune ce se intampla cu istoricul.
  t: "t",
  l: "l",
};

// P3-102, constatarea F23 a lui Ivan. `set` A FOST INCERCAT AICI SI NU ARE VOIE
// SA FIE O UNITATE, si se scrie, ca urmatorul card sa nu o mai incerce.
//
// Tinta G59 cerea o unitate `set`, fiindca documentul MPC din 2026-09-24 scrie UM
// `set` pe "Șurub autoforant, cutie 1000 buc". Cardul EXT-10 a hotarat contrariul
// si l-a si inchis cu o aserttiune, scripts/poc-free/local-db/assertions/
// 0035_products_package.sql, care refuza pe nume etichetele `palet`, `cutie`,
// `set` si `bax` pe unit_code: "products.unit still means what a stored quantity
// is counted in, and no packaging label reached it".
//
// MOTIVUL, PE SCURT: un set nu spune CAT, spune in ce a venit. O cantitate de
// sase seturi si o cantitate de sase bucati ar sta in aceeasi coloana insemnand
// lucruri diferite, si nimeni nu ar mai putea citi un stoc. Ambalajul are
// coloanele lui, products.package_unit si products.package_factor, legate de o
// restrictie care le cere pe amandoua sau pe niciuna.
//
// CE FACE ACEST CARD IN SCHIMB: `set` ramane un cuvant NEMAPAT, ca `cutie`.
// Operatorul alege o data o unitate care exista, iar alegerea se tine minte pe
// furnizor prin migratia 0061. Cuvantul ramane scris pe ecran.

/** Ordinea de afisare, aceeasi cu sort_order din tabela units. */
export const ALL_UNITS: UnitCode[] = ["m2", "lm", "pcs", "bag", "kg", "roll", "m3", "t", "l"];

export function unitLabel(unit: UnitCode): string {
  return UNIT_LABEL[unit] ?? unit;
}

export function isUnitCode(value: unknown): value is UnitCode {
  return typeof value === "string" && (ALL_UNITS as string[]).includes(value);
}
