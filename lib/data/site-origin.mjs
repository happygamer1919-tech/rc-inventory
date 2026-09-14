// EXT-30. Originea publica a aplicatiei, din NEXT_PUBLIC_SITE_URL, FARA NICIO
// ADRESA DE REZERVA.
//
// PANA LA ACEST CARD EXISTA UNA, SI ERA SITE-UL ALTCUIVA. `siteOrigin()` din
// lib/data/extraction-fire.ts citea:
//
//   return typeof site === "string" && site.trim().length > 0
//     ? site.trim().replace(/\/+$/, "")
//     : "https://www.rapidconstructmd.com";
//
// Gazda aceea serveste un site GitHub Pages si raspundea 404 cu o pagina HTML pe
// 2026-09-12, masurat. O variabila lipsa trimitea deci in tacere atat legatura
// catre document cat si adresa de callback catre site-ul de marketing, iar
// cealalta parte primea un document care nu se descarca, fara ca ceva la noi sa
// spuna de ce. Cardul GATE-07 mutase deja garda de commit de pe aceeasi gazda.
//
// ACUM O VALOARE LIPSA SAU STRICATA ESTE null, iar apelantul refuza trimiterea si
// scrie motivul pe ciorna. Aplicatia se serveste la https://app.rapidconstruct.md.
//
// DE CE .mjs. scripts/poc-free/check-document-url-contract.mjs il importa sub
// node 20 in `quality`. Tipurile stau in site-origin.d.mts.
//
// NU CITESTE MEDIUL SINGURA: primeste valoarea, ca verificarea sa o poata da.

/**
 * Originea din valoarea variabilei, sau null.
 *
 * null cand lipseste, este goala, nu este o adresa absoluta, nu este http sau
 * https, sau poarta o cale, o interogare ori un fragment: `app.rapidconstruct.md`
 * fara schema ar produce o legatura relativa, iar o cale ar fi lipita in fata lui
 * /api/documents. Ambele ar pleca stricate si ar arata ca merg.
 */
export function resolveSiteOrigin(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") return null;
  if (url.username !== "" || url.password !== "") return null;
  return url.origin;
}
