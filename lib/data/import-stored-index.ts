// P3-307. CLIENTII ACTIVI CASTIGA MEREU, nu cel care se nimereste primul.
//
// Planurile de import (lead-import-plan.ts, client-import-plan.ts) isi fac harti "cheie ->
// client stocat" in ordinea citirii, iar clientii se citesc ordonati dupa uuid. "Primul
// castiga" insemna ca un client dezactivat si unul activ cu acelasi telefon se potriveau
// dupa cum cadea uuid-ul: randul era sarit cu "reactivati-l" desi exista un client activ
// la care se potrivea fara probleme.
//
// Regula: intr-o harta, un client activ nu este niciodata inlocuit de unul dezactivat, iar
// un client activ ia locul unui client dezactivat. Intre doi clienti de acelasi fel ramane
// primul din lista. Mesajul "Există deja ca client dezactivat" apare numai cand nu exista
// niciun client activ cu aceeasi cheie.
//
// Pur, fara React si fara server.

/** Un client stocat, redus la ce trebuie ca sa se aleaga intre doi: lipsa lui `active` inseamna activ. */
export type StoredClientLike = { active?: boolean };

/** Adaug `client` sub `key`: ocupa locul gol, sau locul unui client dezactivat daca el este activ. */
export function setActiveFirst<C extends StoredClientLike>(
  map: Map<string, C>,
  key: string,
  client: C,
): void {
  const held = map.get(key);
  if (held === undefined || (held.active === false && client.active !== false)) map.set(key, client);
}

/** Alege dintre mai multe potriviri ale aceluiasi rand: primul client activ, altfel primul gasit. */
export function pickActiveMatch<C extends StoredClientLike>(
  candidates: readonly (C | undefined)[],
): C | undefined {
  let first: C | undefined;
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate.active !== false) return candidate;
    first ??= candidate;
  }
  return first;
}
