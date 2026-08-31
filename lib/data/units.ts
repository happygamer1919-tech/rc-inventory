// Unitatile de masura: valoarea stocata si eticheta afisata.
//
// Enumul unit_code din migratia 0001 pastreaza tokenuri englezesti (m2, lm, pcs,
// bag, kg, roll, m3). Interfata este romaneasca. Traducerea traieste aici, in
// stratul de prezentare, exact cum spune defaults-ul cardului P2-01: o valoare
// de enum nu este text de interfata.
//
// Etichetele sunt identice cu cele din faza 1, ca ecranele sa arate la fel.

export type UnitCode = "m2" | "lm" | "pcs" | "bag" | "kg" | "roll" | "m3";

const UNIT_LABEL: Record<UnitCode, string> = {
  m2: "m²",
  lm: "ml",
  pcs: "buc",
  bag: "sac",
  kg: "kg",
  roll: "rolă",
  m3: "m³",
};

/** Ordinea de afisare, aceeasi cu sort_order din tabela units. */
export const ALL_UNITS: UnitCode[] = ["m2", "lm", "pcs", "bag", "kg", "roll", "m3"];

export function unitLabel(unit: UnitCode): string {
  return UNIT_LABEL[unit] ?? unit;
}

export function isUnitCode(value: unknown): value is UnitCode {
  return typeof value === "string" && (ALL_UNITS as string[]).includes(value);
}
