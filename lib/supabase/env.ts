// Citirea variabilelor de mediu Supabase, intr-un singur loc.
//
// ACCES STATIC, OBLIGATORIU. Next inlocuieste la compilare numai referintele
// SCRISE LITERAL, de forma process.env.NEXT_PUBLIC_X. O citire calculata,
// process.env[nume], nu este inlocuita, iar in browser ramane o cautare intr-un
// obiect gol care intoarce undefined. Codul pare corect, se compileaza curat,
// merge pe server si esueaza numai in browser. De aceea cele doua variabile sunt
// scrise mai jos litera cu litera si nu printr-o functie parametrizata.
//
// DE CE EXISTA NORMALIZAREA: valoarea stocata pentru NEXT_PUBLIC_SUPABASE_URL nu
// este intotdeauna originea proiectului. In seiful proiectului ea poarta un sufix
// "/rest/v1/", iar supabase-js construieste singur caile catre /auth/v1 si
// /rest/v1 pornind de la origine. Cu sufix, cererile devin
// ".../rest/v1/auth/v1/token" si serverul raspunde "Invalid path specified in
// request URL". Esecul apare ca "autentificarea nu merge", nu ca eroare de
// configurare, deci taierea se face o singura data, aici.
//
// Nicio valoare nu ajunge in jurnal. Cand lipseste ceva, mesajul numeste
// VARIABILA, niciodata continutul ei.

const RAW_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const RAW_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function present(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Originea proiectului Supabase, fara cale si fara slash final. */
export function supabaseUrl(): string {
  if (!present(RAW_URL)) {
    throw new Error(
      "Variabila de mediu NEXT_PUBLIC_SUPABASE_URL lipseste. Verifica .env.local in dezvoltare sau variabilele proiectului in productie.",
    );
  }
  let url: URL;
  try {
    url = new URL(RAW_URL.trim());
  } catch {
    throw new Error("Variabila de mediu NEXT_PUBLIC_SUPABASE_URL nu este un URL valid.");
  }
  // Doar originea. Orice cale (/rest/v1/, /auth/v1/) este ignorata deliberat.
  return url.origin;
}

export function supabaseAnonKey(): string {
  if (!present(RAW_ANON_KEY)) {
    throw new Error(
      "Variabila de mediu NEXT_PUBLIC_SUPABASE_ANON_KEY lipseste. Verifica .env.local in dezvoltare sau variabilele proiectului in productie.",
    );
  }
  return RAW_ANON_KEY.trim();
}

/**
 * Verificarea de pornire: numeste variabilele lipsa si nimic altceva.
 * P2-11 o extinde; aici acopera doar ce are nevoie autentificarea.
 */
export function missingAuthEnvVars(): string[] {
  const missing: string[] = [];
  if (!present(RAW_URL)) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!present(RAW_ANON_KEY)) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return missing;
}
