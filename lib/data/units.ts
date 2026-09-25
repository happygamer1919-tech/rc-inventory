// Unitatile de masura: valoarea stocata si eticheta afisata.
//
// Enumul unit_code din migratia 0001 pastreaza tokenuri englezesti (m2, lm, pcs,
// bag, kg, roll, m3). Interfata este romaneasca. Traducerea traieste aici, in
// stratul de prezentare, exact cum spune defaults-ul cardului P2-01: o valoare
// de enum nu este text de interfata.
//
// Etichetele sunt identice cu cele din faza 1, ca ecranele sa arate la fel.

export type UnitCode = "m2" | "lm" | "pcs" | "bag" | "kg" | "roll" | "m3" | "t" | "l" | "set";

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
  // P3-102, constatarea F23 a lui Ivan. Setul, adaugat de migratiile 0061 si 0062.
  //
  // ETICHETA ESTE set, acelasi cuvant pe care il scrie furnizorul pe document.
  // Acelasi motiv ca la t si l de mai sus: acolo il citeste operatorul mai intai,
  // iar un cuvant inventat aici l-ar pune sa traduca inapoi.
  //
  // SI AICI NICIO CONVERSIE. Un set nu este invatat ca ar fi o mie de bucati,
  // oricat de des ar scrie "cutie 1000 buc" pe langa el pe hartie. Cantitatea
  // salvata este cantitatea de pe document, numarata in seturi.
  set: "set",
};

/** Ordinea de afisare, aceeasi cu sort_order din tabela units. */
export const ALL_UNITS: UnitCode[] = ["m2", "lm", "pcs", "bag", "kg", "roll", "m3", "t", "l", "set"];

export function unitLabel(unit: UnitCode): string {
  return UNIT_LABEL[unit] ?? unit;
}

export function isUnitCode(value: unknown): value is UnitCode {
  return typeof value === "string" && (ALL_UNITS as string[]).includes(value);
}
