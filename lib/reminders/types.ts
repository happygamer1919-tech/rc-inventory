// Tipurile mementourilor, fara nimic de server.
//
// Acelasi motiv ca la lib/data/inbound-types.ts: un fisier care importa
// "server-only" nu poate fi atins de un component de client nici macar pentru o
// constanta, iar un fisier "use server" nu are voie sa exporte decat functii
// async. Tot ce este comun si nu este functie traieste aici.

/** Alerta trimisa, asa cum o afiseaza ecranul de memento. */
export type FiredAlert = {
  id: string;
  productId: string;
  sku: string;
  name: string;
  unit: import("@/lib/data/units").UnitCode;
  /** Momentul incercarii de trimitere, nu al livrarii. */
  firedAt: string;
  stockAtFire: number;
  thresholdAtFire: number;
  /** null cand trimiterea a reusit; motivul, cand a esuat. */
  sendError: string | null;
};

/** Rezultatul unei incercari de trimitere. Nu arunca niciodata. */
export type SendResult = { ok: true; id: string } | { ok: false; reason: string };
