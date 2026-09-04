import "server-only";

// EXT-16. RECONCILIEREA UNUI PAYLOAD DE SCANARE, PE PARTEA NOASTRA.
//
// DE CE EXISTA, IN CUVINTELE PROPRIETARULUI: "un control care traieste numai in
// Make este ocolit de o reconstruire a scenariului, de o a doua cale de ingestie
// sau de o incarcare manuala, si el este acum singurul lucru dintre o scanare si
// un stoc inventat."
//
// CE A PRODUS SCANAREA LUI ANDRE, SI DE CE UN CONTROL DE MODEL NU AJUTA. Acelasi
// document de 7 linii, cu totalul tiparit 50336.40 fara TVA, a intors trei sume
// diferite in trei rulari: 49035.40, 39242.00 si 38429.40. TOATE TREI au sosit cu
// status extracted si reason null, adica forma care inseamna "citit curat, nimic
// de raportat". Cele trei rulari difera INTRE ELE cu pana la 10606.00 pe aceeasi
// pagina neschimbata, la o toleranta de 0.07. O citire care ar fi derapat s-ar fi
// grupat; trei care se contrazic atat de mult sunt trei fabricatii separate.
//
// UN CONTROL CARE DEPINDE DE MODEL SA OBSERVE CA A CITIT GRESIT NU ESTE UN
// STRAT. Este a doua oara cand un control de forma aceasta cade: confidence a
// intors 1.0 pe un document cu patru linii inventate. Aritmetica de aici nu
// intreaba modelul nimic.

/** Toleranta lui Andre, VERBATIM, si singurul loc unde este scrisa.
 *
 *  DOUA VERIFICARI CARE NU SUNT DE ACORD PE CAZURILE INTERESANTE SUNT MAI RELE
 *  DECAT UNA SINGURA. Acesta este motivul proprietarului pentru care nu ne alegem
 *  un al doilea numar, si de aceea formula este COPIATA, nu re-derivata: la
 *  granita, singurul loc unde o toleranta este vreodata consultata, cea mai
 *  slaba dintre doua castiga din intamplare. */
export function toleranceFor(lineCount: number): number {
  return round2(Math.max(0.05, 0.01 * lineCount));
}

/** Doua zecimale, si rotunjirea se face INAINTE de scadere.
 *
 *  NU ESTE UN DETALIU. A rotunji dupa ce ai scazut da alt raspuns exact la
 *  granita, iar granita este singurul loc unde intrebarea conteaza. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type ReconcileInput = {
  lineTotals: readonly (number | null)[];
  subtotal: number | null;
  documentTotal: number | null;
  pricesIncludeVat: boolean | null;
};

export type ReconcileVerdict =
  | { ok: true; reason: "matched"; target: number; sum: number; tolerance: number }
  | { ok: false; reason: "target_missing" | "line_total_missing" | "out_of_tolerance" };

/**
 * Se potriveste suma liniilor cu totalul tiparit?
 *
 * CELE TREI CONDITII IN CARE VERIFICAREA NU POATE RULA, SI NICIUNA NU ESTE O
 * TRECERE GRATUITA. Cardul le enumera si le da fiecareia raspunsul ei:
 *
 *   1. tinta este null, fiindca documentul nu o tipareste  -> REFUZ
 *   2. prices_include_vat este null -> se reconciliaza fata de AMANDOUA si se
 *      accepta numai daca UNA se potriveste
 *   3. orice linie are line_total null -> REFUZ, suma este incompleta prin
 *      constructie
 *
 * NOTA DE CITIRE, scrisa fiindca dispecerul se poate citi in doua feluri. El
 * pune cele trei sub "toate trei CAD, niciuna nu trece" si apoi da regulii 2
 * procedura ei proprie. Citirea implementata aici este ca NICIUNA DINTRE CELE
 * TREI NU ESTE O TRECERE AUTOMATA si ca regula 2 poarta procedura care o decide.
 * Cealalta citire, in care regula 2 cade neconditionat, ar face din propria ei
 * instructiune un text inaccesibil. Daca acea citire este cea corecta, corectia
 * este o ramura si un caz.
 */
export function reconcile(input: ReconcileInput): ReconcileVerdict {
  // Regula 3 se evalueaza prima: o suma incompleta nu poate fi comparata cu
  // nimic, oricare ar fi tinta.
  if (input.lineTotals.some((t) => t === null || !Number.isFinite(t))) {
    return { ok: false, reason: "line_total_missing" };
  }

  const sum = round2((input.lineTotals as readonly number[]).reduce((a, b) => a + b, 0));
  const tolerance = toleranceFor(input.lineTotals.length);

  // Care total reconciliaza este RASPUNSUL PE CARE CONTRACTUL IL DA DEJA.
  // prices_include_vat il decide, iar acest card foloseste campul si nu il
  // redeschide.
  const targets: number[] =
    input.pricesIncludeVat === false
      ? input.subtotal === null ? [] : [input.subtotal]
      : input.pricesIncludeVat === true
        ? input.documentTotal === null ? [] : [input.documentTotal]
        // Regula 2. Nu se stie care total poarta TVA, deci amandoua sunt
        // candidate si UNA care se potriveste este de ajuns. Nu este o relaxare
        // a tolerantei, este o singura necunoscuta in plus.
        : [input.subtotal, input.documentTotal].filter((t): t is number => t !== null);

  if (targets.length === 0) return { ok: false, reason: "target_missing" };

  for (const raw of targets) {
    const target = round2(raw);
    if (Math.abs(sum - target) <= tolerance) {
      return { ok: true, reason: "matched", target, sum, tolerance };
    }
  }
  return { ok: false, reason: "out_of_tolerance" };
}
