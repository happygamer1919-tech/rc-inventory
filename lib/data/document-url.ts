// EXT-08. CONTRACTUL DE ESEC AL LEGATURII CATRE DOCUMENT.
//
// Make raporteaza un raspuns care nu este un document ca eroare de date si
// captureaza corpul. Daca acel corp este HTML, Andre nu poate deosebi o legatura
// EXPIRATA de una STRICATA: amandoua ajung la el ca "nu am primit un PDF".
//
// CE INTOARCE SUPABASE STORAGE ASTAZI, masurat pe proiectul real la 2026-09-02,
// nu citit din documentatie (capturile verbatim, cu antete, sunt in
// docs/reports/2026-09-02-executor-ext-08-sample-documents.md):
//
//   jeton expirat          400  {"error":"InvalidJWT","code":"InvalidJWT"}
//   jeton falsificat       400  {"error":"InvalidJWT","code":"InvalidJWT"}
//   semnatura pe alta cale 400  {"error":"InvalidSignature","code":"InvalidSignature"}
//   obiect inexistent      400  {"statusCode":"404","error":"not_found","code":"NoSuchKey"}
//
// Doua lucruri sunt gresite acolo. Statusul HTTP este 400 pentru toate patru,
// deci un obiect lipsa nu se vede ca 404. Si codul citibil de masina este
// ACELASI, "InvalidJWT", pentru expirat si pentru falsificat, care este exact
// intrebarea lui Andre. Mesajul le deosebeste, dar mesajul este textul liber al
// bibliotecii jose si se schimba cand se schimba biblioteca.
//
// De aceea exista ruta noastra. Ea traduce, o singura data, intr-un contract fix,
// scris in docs/contracts/document-url.md.
//
// TABELUL SI CLASIFICATORUL SUNT IN document-url-contract.mjs, nu aici, fiindca
// verificarea din `quality` trebuie sa le importe sub node 20, care nu stie sa
// dezbrace adnotarile de tip. Motivul intreg este in capul acelui fisier.

export {
  DOCUMENT_ERROR,
  DOCUMENT_STATUS,
  classifyStorageFailure,
  tokenExpiry,
} from "./document-url-contract.mjs";
export type { DocumentErrorCode } from "./document-url-contract.mjs";

/** Prefixul rutei noastre. Aceeasi forma ca a lui Supabase, alta origine. */
export const DOCUMENT_ROUTE_PREFIX = "/api/documents";

/** Prefixul caii semnate la Supabase, din care se decupeaza bucket-ul si calea. */
const STORAGE_SIGN_PREFIX = "/storage/v1/object/sign/";

/**
 * Rescrie o legatura semnata de Supabase in legatura rutei noastre.
 *
 * FORMA RAMANE IDENTICA. `/storage/v1/object/sign/<bucket>/<cale>?token=<jwt>`
 * devine `<origine>/api/documents/<bucket>/<cale>?token=<jwt>`: acelasi bucket,
 * aceeasi cale, acelasi jeton, acelasi TTL, fiindca TTL-ul este claim-ul `exp`
 * din jeton si nu il atinge nimeni aici.
 *
 * Intoarce null cand legatura primita nu are forma asteptata, si atunci
 * apelantul spune ce lipseste in loc sa trimita mai departe ceva pe jumatate.
 */
export function toDocumentUrl(signedUrl: string, origin: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(signedUrl);
  } catch {
    return null;
  }
  if (!parsed.pathname.startsWith(STORAGE_SIGN_PREFIX)) return null;
  const rest = parsed.pathname.slice(STORAGE_SIGN_PREFIX.length);
  if (rest.length === 0) return null;
  const token = parsed.searchParams.get("token");
  if (token === null || token.length === 0) return null;

  const base = origin.replace(/\/+$/, "");
  return `${base}${DOCUMENT_ROUTE_PREFIX}/${rest}?token=${encodeURIComponent(token)}`;
}
