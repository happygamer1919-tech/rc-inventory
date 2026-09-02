// EXT-08. Contractul de esec, ca ESM simplu.
//
// DE CE ESTE .mjs SI NU .ts. scripts/poc-free/check-document-url-contract.mjs
// trebuie sa importe exact aceste functii, si el ruleaza sub `node` in pasul
// `quality`, unde node-ul este versiunea 20. Node 20 nu stie sa dezbrace
// adnotarile de tip: un import de .ts cade acolo cu
// "ERR_UNKNOWN_FILE_EXTENSION", si a cazut, la prima rulare a acestui card.
//
// Alternativa ar fi fost sa urc versiunea de node din workflow ca sa fac un
// import sa mearga. Aceea este o schimbare de mediu pentru toti cei douazeci si
// doi de pasi ai jobului, facuta dintr-un motiv care nu are nimic de a face cu
// niciunul dintre ei. Fisierul acesta este alegerea mai mica.
//
// TIPURILE sunt in document-url-contract.d.mts, langa el, deci partea de
// TypeScript nu pierde nimic.
//
// NU IMPORTA NIMIC si nu atinge nici reteaua, nici mediul.

/** Codurile pe care le vede cealalta parte. Se schimba numai printr-un card. */
export const DOCUMENT_ERROR = {
  expired: "EXPIRED_TOKEN",
  invalid: "INVALID_TOKEN",
  notFound: "OBJECT_NOT_FOUND",
  upstream: "UPSTREAM_UNAVAILABLE",
  method: "METHOD_NOT_ALLOWED",
};

/** Statusul HTTP al fiecarui cod. PERECHEA este contractul, nu codul singur. */
export const DOCUMENT_STATUS = {
  [DOCUMENT_ERROR.expired]: 400,
  [DOCUMENT_ERROR.invalid]: 401,
  [DOCUMENT_ERROR.notFound]: 404,
  [DOCUMENT_ERROR.upstream]: 502,
  [DOCUMENT_ERROR.method]: 405,
};

/**
 * Decodeaza claim-ul `exp` FARA sa verifice semnatura.
 *
 * DE CE FARA VERIFICARE. Verificarea este treaba lui Supabase si el a facut-o
 * deja: cand ajungem aici, el a refuzat jetonul. Singura intrebare ramasa este
 * DE CE l-a refuzat, iar raspunsul "pentru ca a expirat" se citeste din payload,
 * care nu este secret. Un jeton cu semnatura stricata dar cu `exp` in viitor
 * ramane INVALID, fiindca decizia valid/invalid nu se ia aici.
 */
export function tokenExpiry(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload = JSON.parse(json);
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
 * Prima versiune comuta pe `code`. Proiectul gazduit il trimite; serverul de
 * stocare din stiva locala, care este cel din CI, NU il trimite deloc:
 *
 *   gazduit  {"statusCode":"400","error":"InvalidJWT","message":"...","code":"InvalidJWT"}
 *   local    {"statusCode":"400","error":"InvalidJWT","message":"..."}
 *
 * Comutand pe `code`, ambele cazuri de jeton cadeau in ramura necunoscuta si
 * raspundeau 502 in loc de 400 si 401. `error` si `statusCode` sunt in amandoua
 * versiunile, deci pe ele se decide, iar `code` se accepta in plus acolo unde
 * exista, fiindca este mai specific.
 */
export function classifyStorageFailure(status, body, token, nowSeconds) {
  // 5xx la ei nu este niciunul dintre cele trei cazuri ale contractului.
  if (status >= 500) return DOCUMENT_ERROR.upstream;

  const shape = body ?? {};
  const code = typeof shape.code === "string" ? shape.code : "";
  const error = typeof shape.error === "string" ? shape.error : "";
  const inner = typeof shape.statusCode === "string" ? shape.statusCode : "";

  // Obiectul lipseste. Statusul HTTP este 400 la ei; adevarul este in corp.
  if (code === "NoSuchKey" || error === "not_found" || inner === "404") {
    return DOCUMENT_ERROR.notFound;
  }

  // Jetonul a fost refuzat. Ramane de spus DE CE, si asta se citeste din jetonul
  // insusi, nu din textul liber al bibliotecii jose, care se schimba cand se
  // schimba biblioteca.
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
