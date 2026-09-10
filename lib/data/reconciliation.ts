import "server-only";

// EXT-16. RECONCILIEREA UNUI PAYLOAD DE SCANARE, PE PARTEA NOASTRA.
//
// DE CE EXISTA, IN CUVINTELE PROPRIETARULUI: "un control care traieste numai in
// Make este ocolit de o reconstruire a scenariului, de o a doua cale de ingestie
// sau de o incarcare manuala, si el este acum singurul lucru dintre o scanare si
// un stoc inventat."
//
// CE A PRODUS SCANAREA LUI ANDRE, SI DE CE UN CONTROL DE MODEL NU AJUTA. Acelasi
// document de 7 linii, cu totalul tiparit 50336.40 fara TVA, a intors patru sume
// diferite in patru rulari: 49035.40, 48060.40, 39242.00 si 38429.40. TOATE au
// sosit cu status extracted si reason null, adica forma care inseamna "citit
// curat, nimic de raportat".
//
// AMENDAT 2026-09-09 PRIN HOTARAREA R-185, SI TEXTUL ORIGINAL ESTE PASTRAT MAI
// JOS, NU STERS, dupa CLAUDE.md sectiunea 9c. Andre a masurat acelasi document
// LA NIVEL DE LINIE, pe patru treceri: UN PRET UNITAR SE MISCA, TREI LINII SUNT
// IDENTICE OCTET CU OCTET SI CORECTE LA FIECARE TRECERE, IAR UNA ESTE IDENTICA
// OCTET CU OCTET SI GRESITA LA FIECARE TRECERE. Un singur camp care se plimba
// produce patru sume diferite, deci totalurile s-au miscat iar citirea nu.
// ESECUL ESTE O CITIRE GRESITA DETERMINISTA, NU VARIANTA.
//
// CONSECINTA, PERMANENTA PRIN R-185: COMPARAREA MAI MULTOR TRECERI SI VOTUL
// MAJORITAR SUNT EXCLUSE. Trei treceri peste linia gresita identica intorc
// aceeasi valoare gresita de trei ori si un vot o raporteaza ca unanima. Nu doar
// ca nu prinde linia: o CERTIFICA.
//
// Propozitia inlocuita, pastrata verbatim:
//
//   "Cele trei rulari difera INTRE ELE cu pana la 10606.00 pe aceeasi pagina
//    neschimbata, la o toleranta de 0.07. O citire care ar fi derapat s-ar fi
//    grupat; trei care se contrazic atat de mult sunt trei fabricatii separate."
//
// Cifrele erau si raman corecte. Ce s-a schimbat este ce se poate deduce din
// imprastierea lor.
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

// ===========================================================================
// EXT-18. AUTOCONSISTENTA ANTETULUI, PE ACEEASI TOLERANTA.
//
// DOUA INTREBARI DESPRE CIFRELE PE CARE DOCUMENTUL LE TIPARESTE DESPRE SINE:
//
//   A.  subtotal + vat_amount  fata de  document_total
//   B.  subtotal * vat_rate    fata de  vat_amount
//
// CE NU FACE, SI ESTE SCRIS AICI FIINDCA VA FI CITAT GRESIT. NU INCHIDE GAURA
// FABRICATIEI. Andre a confirmat asimetria cu dovada: pe scanarea Matnord CU
// PATRU LINII FABRICATE, subtotal plus TVA da document_total la banut si TVA da
// subtotal ori cota la banut, amandoua aterizand la EXACT ZERO. Documentul cu
// linii inventate TRECE amandoua verificarile de aici.
//
// CE FACE. Ridica PRETUL unei fabricatii care supravietuieste, obligand-o sa fie
// coordonata intre antet SI tabelul de linii in loc sa fie doar in tabel. Este un
// castig real si este alta afirmatie.
//
// ULTIMUL CONTROL RAMANE MIHAI UITANDU-SE LA SCANARE. Nici acest card, nici
// EXT-16, nici EXT-17 nu il inlocuiesc, si niciunul nu reduce riscul la zero.
// ===========================================================================

/** Ce s-a intamplat cu una dintre cele doua verificari de antet.
 *
 *  `not_run` NU ESTE `passed`, si distinctia este toata grija de aici. Cele
 *  patru cifre sunt nullable prin contract, iar o verificare careia ii lipseste
 *  intrarea NU A RULAT. A o raporta ca trecuta ar fi exact forma de tacere pe
 *  care o interzice EXT-16: "nu am putut sa ma uit" si "nu este nimic in
 *  neregula" nu au voie sa se randeze la fel. */
export type HeaderCheckOutcome = "passed" | "failed" | "not_run";

export type HeaderInput = {
  subtotal: number | null;
  vatAmount: number | null;
  documentTotal: number | null;
  /** Cota, in procente, exact cum o poarta contractul: 20 inseamna 20%. */
  vatRate: number | null;
  /** Numarul de linii AL DOCUMENTULUI, fiindca el intra in toleranta.
   *
   *  Pe un payload numai-antet este zero si castiga pragul de 0.05. Nu este un
   *  caz special: o verificare de antet nu devine mai stricta fiindca liniile
   *  lipsesc. */
  lineCount: number;
};

export type HeaderVerdict = {
  /** false EXACT cand una dintre cele doua a esuat. `not_run` nu respinge. */
  ok: boolean;
  tolerance: number;
  sum: { outcome: HeaderCheckOutcome; diff: number | null };
  vat: { outcome: HeaderCheckOutcome; diff: number | null };
};

/**
 * Se potrivesc cifrele antetului INTRE ELE?
 *
 * TOLERANTA ESTE toleranceFor, CHEMATA, NU RESCRISA. Cardul o spune in terms:
 * expresia EXT-16 se EXTINDE, nu se dubleaza. Doua formule care nu sunt de acord
 * la granita sunt mai rele decat una singura, iar granita este singurul loc unde
 * o toleranta este vreodata consultata.
 *
 * ROTUNJIREA SE FACE INAINTE DE SCADERE, la fel ca la reconcile(), si din
 * acelasi motiv: a rotunji dupa da alt raspuns exact la granita.
 */
export function headerConsistency(input: HeaderInput): HeaderVerdict {
  const tolerance = toleranceFor(input.lineCount);
  const has = (v: number | null): v is number => v !== null && Number.isFinite(v);

  const sum =
    has(input.subtotal) && has(input.vatAmount) && has(input.documentTotal)
      ? (() => {
          const diff = round2(
            Math.abs(round2(input.subtotal! + input.vatAmount!) - round2(input.documentTotal!)),
          );
          return { outcome: (diff <= tolerance ? "passed" : "failed") as HeaderCheckOutcome, diff };
        })()
      : { outcome: "not_run" as HeaderCheckOutcome, diff: null };

  const vat =
    has(input.subtotal) && has(input.vatAmount) && has(input.vatRate)
      ? (() => {
          const diff = round2(
            Math.abs(round2((input.subtotal! * input.vatRate!) / 100) - round2(input.vatAmount!)),
          );
          return { outcome: (diff <= tolerance ? "passed" : "failed") as HeaderCheckOutcome, diff };
        })()
      : { outcome: "not_run" as HeaderCheckOutcome, diff: null };

  return { ok: sum.outcome !== "failed" && vat.outcome !== "failed", tolerance, sum, vat };
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


// ===========================================================================
// EXT-23. CARE DINTRE CELE DOUA CODURI POARTA REFUZUL.
//
// PANA LA ACEST CARD RASPUNSUL ERA MEREU `reconciliation_failed`, PENTRU ORICE
// INTRARE. Hotararea R-187 a derivat impartirea brat cu brat din sursa si a
// gasit ca PATRU din cele cinci brate hotarate erau gresite. Fisierul de ruta
// isi argumenta comportamentul in scris, sub R-098: un cod NOU trebuie comunicat
// celeilalte parti inainte sa poata fi emis. Argumentul este corect si NU se
// aplica: `unreadable_document` nu este un cod nou. Este in multimea sectiunii
// 5.2 de cand contractul v2 a fost inghetat prin R-014, are propozitia lui
// romaneasca, si Make il emite astazi.
//
// IMPARTIREA HOTARATA, in cuvintele proprietarului:
//
//   unreadable_document    cand NU EXISTA NICIUN REPER DE INCREDERE
//   reconciliation_failed  cand verificarea A RULAT fata de totaluri tiparite
//                          sanatoase intre ele SI suma liniilor a ratat
//
// DE CE ESTE ACEASTA DIFERENTA SI NU O ALTA. Cele doua coduri il trimit pe om sa
// faca lucruri diferite, si aceea este intreaga miza a lui EXT-19. Un refuz care
// spune "cifrele nu se aduna" il pune sa bata documentul de mana fata de un
// total cunoscut. Daca nu exista niciun total cunoscut, sau daca documentul se
// contrazice pe el insusi, nu are fata de ce sa il bata: nu suma a ratat, ci
// reperul lipseste.
//
// ORDINEA BRATELOR ESTE O DECIZIE SI ESTE SINGURA PARTE OBSERVABILA. Antetul se
// evalueaza PRIMUL si domina: un antet care nu se aduna cu el insusi face
// `unreadable_document` chiar daca suma liniilor ar fi ratat si ea. Fara acea
// ordine, acelasi document ar primi coduri diferite dupa cum se intampla sa cada
// a doua verificare.
//
// `not_run` NU ESTE UN REFUZ, SI NU ESTE INVENTAT AICI. Cardul EXT-18 o spune in
// terms: o cifra absenta nu respinge singura, iar "regula tintei nule a lui
// EXT-16 este cea care respinge un document care nu poate fi reconciliat deloc".
// Un antet ale carui intrari lipsesc cade prin acest brat si ajunge la testul de
// reper, exact ca inainte de acest card.
// ===========================================================================

/** Cele doua coduri pe care validatorul NOSTRU le poate emite. */
export type RefusalCode = "unreadable_document" | "reconciliation_failed";

/** Bratul care a decis, numit, fiindca un cod fara bratul lui nu se poate
 *  proba: doua brate care duc la acelasi cod sunt cazuri diferite si o proba
 *  trebuie sa poata cere fiecare brat pe nume. */
export type ScanArm =
  /** Antetul nu se aduna cu el insusi. Domina, si vezi antetul de mai sus. */
  | "header_inconsistent"
  /** Zero linii intoarse. Include cazul in care totalul ales este chiar 0:
   *  suma a nimic care este de acord cu zero nu este dovada pentru nimic. */
  | "no_lines"
  /** O linie fara `line_total`. Suma este incompleta prin constructie. */
  | "line_total_missing"
  /** Steagul alege un total si acel total lipseste, sau nu exista niciun total
   *  tiparit deloc. */
  | "target_missing"
  /** `prices_include_vat` lipseste SI niciunul dintre cele doua totaluri nu se
   *  potriveste, deci nu s-a stabilit niciun reper fata de care sa fi ratat. */
  | "anchor_unknown"
  /** Reper cunoscut, antet sanatos, linii complete, si suma a ratat. SINGURUL
   *  brat care poarta `reconciliation_failed`. */
  | "line_sum_missed";

export type ScanClassification =
  | { refuse: false }
  | { refuse: true; code: RefusalCode; arm: ScanArm };

export type ScanInput = ReconcileInput & {
  /** Verdictul EXT-18 pentru ACELASI payload. Se primeste gata calculat, nu se
   *  calculeaza aici, ca ruta sa aiba un singur loc unde cheama fiecare
   *  verificare si ca aceasta functie sa fie pura fata de amandoua. */
  header: HeaderVerdict;
};

/**
 * Ce cod poarta refuzul unei scanari, sau niciunul.
 *
 * FIECARE INTRARE CADE PE EXACT UN BRAT SI FIECARE BRAT SE INTOARCE. Nu exista
 * cale implicita: ultimul `switch` de mai jos este exhaustiv peste
 * `ReconcileVerdict["reason"]` si `never` il dovedeste la compilare. Acesta este
 * lucrul pe care acceptanta cardului cere sa fie probat.
 */
export function classifyScan(input: ScanInput): ScanClassification {
  // 1. ANTETUL, PRIMUL SI DOMINANT. `not_run` nu este `failed` si nu respinge.
  if (!input.header.ok) {
    return { refuse: true, code: "unreadable_document", arm: "header_inconsistent" };
  }

  // 2. ZERO LINII. Se pune INAINTEA reconcilierii fiindca reconcilierea nu are
  //    ce sa raspunda aici: suma unei liste goale este 0, iar 0 se potriveste cu
  //    un total tiparit de 0 la o toleranta de 0.05 si intoarce `matched`.
  //    R-187 a masurat exact acel caz trecand pe productie.
  if (input.lineTotals.length === 0) {
    return { refuse: true, code: "unreadable_document", arm: "no_lines" };
  }

  const verdict = reconcile(input);
  if (verdict.ok) return { refuse: false };

  switch (verdict.reason) {
    case "line_total_missing":
      // O linie fara total nu poate fi reconciliata, si actiunea este o copie
      // mai buna. Clasificat de proprietar in EXT-23; R-187 l-a gasit neacoperit
      // de impartirea hotarata.
      return { refuse: true, code: "unreadable_document", arm: "line_total_missing" };
    case "target_missing":
      return { refuse: true, code: "unreadable_document", arm: "target_missing" };
    case "out_of_tolerance":
      // AICI ESTE SINGURA BIFURCATIE CARE DECIDE INTRE CELE DOUA CODURI.
      //
      // Cu steagul absent, `reconcile` a incercat AMANDOUA totalurile si niciunul
      // nu s-a potrivit. Nu se stie care dintre ele era reperul, deci nu se poate
      // spune ca suma a ratat un reper: nu s-a stabilit niciun reper.
      //
      // Cu steagul prezent, reperul este cunoscut, totalul lui exista, antetul se
      // aduna cu el insusi si liniile sunt complete. Verificarea a rulat si suma
      // a ratat. Acesta este exact `reconciliation_failed`.
      return input.pricesIncludeVat === null
        ? { refuse: true, code: "unreadable_document", arm: "anchor_unknown" }
        : { refuse: true, code: "reconciliation_failed", arm: "line_sum_missed" };
    default: {
      // NICIO INTRARE NU AJUNGE AICI SI COMPILATORUL O DOVEDESTE. In aceasta
      // ramura `verdict` este `never`, adica typescript a epuizat uniunea. Daca
      // `ReconcileVerdict` capata un al patrulea motiv, `verdict` inceteaza sa
      // fie `never`, atribuirea de mai jos nu mai compileaza, si cardul care a
      // adaugat motivul trebuie sa spuna ce cod poarta. Aceasta este forma
      // verificabila a clauzei de acceptanta "nicio intrare nu ajunge la cazul
      // implicit": nu este un test care ruleaza, este un test care refuza sa
      // compileze.
      const unreachable: never = verdict;
      throw new Error(`motiv de reconciliere neclasificat: ${JSON.stringify(unreachable)}`);
    }
  }
}
