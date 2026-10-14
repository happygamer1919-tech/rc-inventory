// Cum se citeste raspunsul unei sonde de schema (P3-276). Fisier fara server-only, ca
// un test sa-l poata rula; portile care il folosesc stau in schema-capability.ts.
//
// DEFECTUL: portile cacheau "nu" un minut pe ORICE eroare, deci un timeout sau o
// cadere de retea inchidea sarcinile (si celelalte functii din acel fisier) timp de
// 60 de secunde, desi tabela exista. O sonda intreaba "exista tabela sau coloana?";
// un raspuns care nu spune nimic despre asta nu are voie sa fie tinut minte ca "nu".
//
// REGULA: se tine minte "nu" numai cand baza spune hotarat ca obiectul lipseste.
// Orice alta eroare nu se tine minte si functia se trateaza ca pornita: citirea
// adevarata esueaza apoi singura, la vedere, iar sonda se repeta la urmatorul apel.

/** Codurile prin care PostgreSQL si PostgREST spun ca un obiect de schema lipseste:
 *  42P01 tabela, 42703 coloana, PGRST205 si PGRST204 tabela si coloana lipsa din
 *  schema PostgREST, 22P02 eticheta de enumerare inexistenta (sondele de etichete). */
const MISSING_CODES = new Set(["42P01", "42703", "PGRST205", "PGRST204", "22P02"]);

/** Plasa pentru o eroare fara cod: textul PostgreSQL "relation ... does not exist". */
const MISSING_TEXT = /does not exist|could not find the .* in the schema cache/i;

export function isMissingSchemaError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code === "string" && MISSING_CODES.has(code)) return true;
  return typeof message === "string" && MISSING_TEXT.test(message);
}

export type ProbeSlot = { value: boolean; at: number };

/** Raspunsul unei sonde ca intrare de cache.
 *
 *  - fara eroare: "da", tinut minte;
 *  - eroare care spune ca obiectul lipseste: "nu", tinut minte;
 *  - orice alta eroare (timeout, retea, RLS): "da", NETINUT MINTE (`at` este 0, deci
 *    verificarea TTL din poarta o socoteste expirata la urmatorul apel).
 *
 *  Cu mai multe erori (portile cu doua sonde) o eroare de lipsa bate oricare alta. */
export function settleProbe(now: number, ...errors: unknown[]): ProbeSlot {
  const failed = errors.filter((e) => e !== null && e !== undefined && e !== false);
  if (failed.length === 0) return { value: true, at: now };
  if (failed.some(isMissingSchemaError)) return { value: false, at: now };
  return { value: true, at: 0 };
}
