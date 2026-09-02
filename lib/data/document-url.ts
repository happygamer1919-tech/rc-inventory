// EXT-08. CONTRACTUL DE ESEC AL LEGATURII CATRE DOCUMENT.
//
// Make raporteaza un raspuns care nu este un document ca eroare de date si
// captureaza corpul. Daca acel corp este HTML, Andre nu poate deosebi o legatura
// EXPIRATA de una STRICATA: amandoua ajung la el ca "nu am primit un PDF".
//
// CE INTOARCE SUPABASE STORAGE ASTAZI, masurat pe proiectul real la 2026-09-02,
// nu citit din documentatie (capturile verbatim sunt in
// docs/reports/2026-09-02-executor-ext-08-sample-documents-and-failure-contract.md):
//
//   jeton expirat        400  {"error":"InvalidJWT","code":"InvalidJWT"}
//   jeton falsificat     400  {"error":"InvalidJWT","code":"InvalidJWT"}
//   semnatura pe alta cale 400 {"error":"InvalidSignature","code":"InvalidSignature"}
//   obiect inexistent    400  {"statusCode":"404","error":"not_found","code":"NoSuchKey"}
//
// Doua lucruri sunt gresite acolo. Statusul HTTP este 400 pentru toate patru,
// deci un obiect lipsa nu se vede ca 404. Si codul citibil de masina este
// ACELASI, "InvalidJWT", pentru expirat si pentru falsificat, care este exact
// intrebarea lui Andre. Mesajul le deosebeste, dar mesajul este textul liber al
// bibliotecii jose si se schimba cand se schimba biblioteca.
//
// De aceea exista ruta noastra. Ea traduce, o singura data, intr-un contract
// fix.

/** Codurile pe care le vede cealalta parte. Se schimba numai printr-un card. */
export const DOCUMENT_ERROR = {
  expired: "EXPIRED_TOKEN",
  invalid: "INVALID_TOKEN",
  notFound: "OBJECT_NOT_FOUND",
  upstream: "UPSTREAM_UNAVAILABLE",
  method: "METHOD_NOT_ALLOWED",
} as const;

export type DocumentErrorCode = (typeof DOCUMENT_ERROR)[keyof typeof DOCUMENT_ERROR];

/** Statusul HTTP al fiecarui cod. Perechea este contractul. */
export const DOCUMENT_STATUS: Record<DocumentErrorCode, number> = {
  [DOCUMENT_ERROR.expired]: 400,
  [DOCUMENT_ERROR.invalid]: 401,
  [DOCUMENT_ERROR.notFound]: 404,
  [DOCUMENT_ERROR.upstream]: 502,
  [DOCUMENT_ERROR.method]: 405,
};

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

/**
 * Decodeaza claim-ul `exp` FARA sa verifice semnatura.
 *
 * DE CE FARA VERIFICARE. Verificarea este treaba lui Supabase si el a facut-o
 * deja: cand ajungem aici el a refuzat jetonul. Singura intrebare ramasa este
 * DE CE l-a refuzat, iar raspunsul "pentru ca a expirat" se citeste din payload,
 * care nu este secret. Un jeton cu semnatura stricata dar cu `exp` in viitor
 * ramane INVALID, fiindca decizia de valid/invalid nu se ia aici.
 *
 * Intoarce null cand payload-ul nu se poate citi sau nu poarta `exp` numeric.
 */
export function tokenExpiry(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload = JSON.parse(json) as { exp?: unknown };
    return typeof payload.exp === "number" && Number.isFinite(payload.exp) ? payload.exp : null;
  } catch {
    return null;
  }
}

/**
 * Traduce raspunsul lui Supabase Storage in codul nostru.
 *
 * ORDINEA CONTEAZA. Supabase verifica jetonul INAINTE de obiect, deci un jeton
 * refuzat nu spune nimic despre existenta obiectului, si invers: cand el
 * raspunde not_found, jetonul era bun.
 *
 * SE CITESTE `error`, NU `code`, SI ASTA ESTE O CORECTIE MASURATA.
 * Prima versiune a acestui fisier comuta pe `code`. Proiectul gazduit il trimite;
 * serverul de stocare din stiva locala, care este cel din CI, NU il trimite deloc:
 *
 *   gazduit  {"statusCode":"400","error":"InvalidJWT","message":"...","code":"InvalidJWT"}
 *   local    {"statusCode":"400","error":"InvalidJWT","message":"..."}
 *
 * Comutand pe `code`, ambele cazuri de jeton cadeau in ramura "necunoscut" si
 * raspundeau 502 in loc de 400 si 401. Testul le-a prins pe amandoua. `error` si
 * `statusCode` sunt in amandoua versiunile, deci pe ele se decide, iar `code` se
 * accepta in plus fiindca este mai specific acolo unde exista.
 */
export function classifyStorageFailure(
  status: number,
  body: unknown,
  token: string,
  nowSeconds: number,
): DocumentErrorCode {
  // 5xx la ei nu este niciunul dintre cele trei cazuri ale contractului.
  if (status >= 500) return DOCUMENT_ERROR.upstream;

  const shape = (body ?? {}) as { code?: unknown; error?: unknown; statusCode?: unknown };
  const code = typeof shape.code === "string" ? shape.code : "";
  const error = typeof shape.error === "string" ? shape.error : "";
  const inner = typeof shape.statusCode === "string" ? shape.statusCode : "";

  // Obiectul lipseste. Statusul HTTP este 400 la ei; adevarul este in corp.
  if (code === "NoSuchKey" || error === "not_found" || inner === "404") {
    return DOCUMENT_ERROR.notFound;
  }

  // Jetonul a fost refuzat. Ramane de spus DE CE, si asta se citeste din
  // jetonul insusi, nu din textul liber al bibliotecii jose, care se schimba
  // cand se schimba biblioteca.
  const tokenRejected =
    error === "InvalidJWT" ||
    error === "InvalidSignature" ||
    code === "InvalidJWT" ||
    code === "InvalidSignature" ||
    code === "InvalidRequest" ||
    status === 401 ||
    status === 403;

  if (tokenRejected) {
    const exp = tokenExpiry(token);
    if (exp !== null && exp <= nowSeconds) return DOCUMENT_ERROR.expired;
    return DOCUMENT_ERROR.invalid;
  }

  // Un corp pe care nu il recunoastem NU se ghiceste ca fiind unul dintre cele
  // trei. Un cod nou la ei trebuie sa se vada ca fiind nou, si 502 se vede.
  return DOCUMENT_ERROR.upstream;
}
