// EXT-12. Bugetele de timp ale caii de extragere, intr-un singur loc.
//
// DE CE ESTE .mjs SI NU .ts, EXACT CA LA document-url-contract.mjs SI PENTRU
// ACELASI MOTIV. scripts/poc-free/prove-extraction-budget.mjs trebuie sa importe
// exact aceste valori si ruleaza sub `node` in pasul `quality`, unde node-ul este
// versiunea 20. Node 20 nu stie sa dezbrace adnotarile de tip: un import de .ts
// cade acolo cu "ERR_UNKNOWN_FILE_EXTENSION", si a cazut, la prima rulare a
// acestui card, exact cum a cazut la EXT-08.
//
// Alternativa ar fi fost sa urc versiunea de node din workflow ca sa fac un
// import sa mearga. Aceea este o schimbare de mediu pentru toti pasii jobului,
// facuta dintr-un motiv care nu are nimic de a face cu niciunul dintre ei.
// Fisierul acesta este alegerea mai mica, si este alegerea pe care acest
// repository a facut-o deja o data.
//
// TIPURILE sunt in extraction-budget.d.mts, langa el.
//
// ============================================================================
// TREI CEASURI DIFERITE, SI CARDUL CERE SA SE STABILEASCA CARE ESTE CARE
// ============================================================================
//
// Nota cardului spune: "valoarea curenta este 15 secunde, in
// lib/data/extraction-fire.ts ca TIMEOUT_MS, si acela este timpul de TRIMITERE
// si nu bugetul extragerii. Daca sunt acelasi ceas este primul lucru pe care
// acest card il stabileste, pentru ca ridicarea unui timp de trimitere la 120
// de secunde ar tine ecranul operatorului doua minute degeaba."
//
// NU SUNT ACELASI CEAS, si se citeste din cod:
//
//   1. CEASUL DE CONFIRMARE, aici ACK_TIMEOUT_MS. extraction-fire.ts face POST
//      catre Make cu un `callback_url` IN CORP si se intoarce de indata ce Make
//      raspunde 2xx. Ce se asteapta este confirmarea ca Make a PRIMIT lucrarea,
//      nu rezultatul ei. Ecranul operatorului sta pe acest ceas, deci el ramane
//      scurt.
//
//   2. BUGETUL EXTRAGERII, aici EXTRACTION_BUDGET_*. Rezultatul soseste mai
//      tarziu, prin callback. Bugetul acela este AL LUI MAKE: contractul
//      docs/contracts/extraction-v2.md spune despre codul `timeout` ca
//      "extragerea a depasit limita PROPRIE a lui Make". Codul nostru nu are
//      unde sa il impuna; il declara, iar scenariul lui Andre il respecta.
//
//   3. CEASUL DE SERVIRE A DOCUMENTULUI, in app/api/documents/[...path]/route.ts
//      ca UPSTREAM_TIMEOUT_MS. Cat asteptam NOI stocarea cand Make ne cere
//      fisierul. Al treilea ceas si a treia intrebare; nu se muta aici pentru ca
//      nu este un buget de extragere.
//
// ============================================================================
// PRAGUL ESTE PE LINII SI NU STIM NUMARUL DE LINII INAINTE DE EXTRAGERE
// ============================================================================
//
// Corpul trimis catre Make poarta exact sase campuri, si niciunul nu este un
// numar de linii: order_id, document_url, document_filename, mime_type,
// size_bytes, callback_url. Numarul de linii este REZULTATUL extragerii.
//
// Cardul a prevazut asta si a decis dinainte: "daca numarul nu se poate sti la
// momentul trimiterii, bugetul cel lung se aplica fiecarui document, iar pull
// request-ul o spune pe fata in loc sa inventeze un surogat".
//
// De aceea `extractionBudgetMs(null)` intoarce bugetul LUNG. Nu se foloseste
// size_bytes ca surogat pentru numarul de linii: un PDF scanat de o pagina poate
// fi mai greu decat un PDF digital de trei, iar un surogat inventat aici ar
// deveni peste sase luni "pragul", fara ca nimeni sa fi decis asta.

/** Peste cate linii se aplica bugetul lung. Numarul proprietarului. */
export const EXTRACTION_LINE_THRESHOLD = 20;

/** Bugetul extragerii peste prag. Numarul proprietarului, nu un interval de acordat. */
export const EXTRACTION_BUDGET_ABOVE_MS = 120_000;

/** Bugetul extragerii sub prag. */
export const EXTRACTION_BUDGET_BELOW_MS = 60_000;

/**
 * Cat timp are extragerea pentru un document cu `lineCount` linii.
 *
 * `null` inseamna "nu se stie", ceea ce este cazul la trimitere, si atunci se
 * intoarce bugetul LUNG. Aceasta este decizia scrisa in defaults, nu o alegere
 * facuta aici.
 */
export function extractionBudgetMs(lineCount) {
  if (lineCount === null || !Number.isFinite(lineCount)) return EXTRACTION_BUDGET_ABOVE_MS;
  return lineCount > EXTRACTION_LINE_THRESHOLD
    ? EXTRACTION_BUDGET_ABOVE_MS
    : EXTRACTION_BUDGET_BELOW_MS;
}

/**
 * Cat asteptam confirmarea lui Make ca a primit lucrarea.
 *
 * RAMANE SCURT, SI ASTA ESTE O DECIZIE, NU O SCAPARE. Ecranul operatorului sta
 * pe acest ceas. Nota cardului spune in terminii aceia ca ridicarea lui la 120
 * de secunde ar tine ecranul doua minute degeaba, iar el nu masoara extragerea:
 * masoara daca Make a raspuns la webhook.
 */
export const ACK_TIMEOUT_MS = 15_000;
