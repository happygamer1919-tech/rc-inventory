// P3-74, constatarea F2 a lui Ivan. O VALOARE NUMERICA A CONTRACTULUI, CITITA
// DINTR-UN PAYLOAD JSON, SI NIMIC ALTCEVA CITIT CA NUMAR.
//
// SIRUL GOL SI BOOLEANUL NU SUNT NUMERE, IAR Number() SPUNE CA SUNT. Number("")
// este 0 si Number.isFinite(0) este true. Number(true) este 1, Number(false)
// este 0, amandoua finite. Number([]) este 0 si Number([5]) este 5. Deci un camp
// pe care extractorul l-a trimis GOL se stoca drept ZERO, adica drept o citire,
// si un boolean ajuns in dreptul unui camp numeric se stoca drept 1 sau 0.
//
// DE CE CONTEAZA, SI NU ESTE O CHESTIUNE DE CURATENIE. Un zero stocat nu se
// deosebeste pe ecranul de revizuire de un zero citit din document. Cineva ar
// confirma un subtotal de 0 lei, sau o cantitate de 0, crezand ca asa spune
// hartia. Mai rau, reconcilierea compara sumele: un subtotal fals 0 schimba
// verdictul intern al platformei pe un document pe care nimeni nu l-a citit
// gresit. ABSENTA SE STOCHEAZA CA null, SI NUMAI CA null, exact ca la `str()`.
//
// CE RAMANE NESCHIMBAT. numeric() peste PostgREST vine ca string, deci un sir
// NEGOL care se parseaza la un numar finit este in continuare un numar. NaN,
// Infinity si -Infinity raman refuzate, de aceeasi paza Number.isFinite care le
// refuza si pana acum.
//
// DE CE .mjs SI NU .ts: acelasi motiv ca page-count.mjs si
// document-url-contract.mjs. scripts/poc-free/check-numeric-field.mjs il importa
// sub node 20 in `quality`, iar node 20 nu dezbraca adnotarile de tip. Asta este
// si motivul pentru care regula sta intr-un fisier propriu si nu mai sta in
// corpul rutei: o functie din app/api/extraction/callback/route.ts nu poate fi
// dovedita fara baza de date si fara browser, iar aceasta poate.
//
// NU ARUNCA NICIODATA, NU CITESTE RETEAUA SI NU CITESTE MEDIUL.

/**
 * Valoarea numerica a campului, sau null cand ce a sosit nu este un numar.
 *
 * null, undefined, true, false, sirul gol, un sir numai din spatii, un sir care
 * nu se parseaza, un tablou si un obiect: toate sunt null. Un numar finit si un
 * sir negol care se parseaza la un numar finit trec.
 */
export function numericField(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  // UN TEST DE TIP SI NU O CONVERSIE. Tot ce nu este numar si nu este sir nu are
  // voie sa ajunga la Number(): boolean, tablou si obiect sunt exact valorile pe
  // care Number() le trece in zero-uri si unu-uri tacute.
  if (typeof v !== "string") return null;
  const t = v.trim();
  // Un sir prezent si gol NU este o valoare. Contract, regula globala 2.1,
  // aceeasi propozitie pe care `str()` o aplica sirurilor.
  if (t.length === 0) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
