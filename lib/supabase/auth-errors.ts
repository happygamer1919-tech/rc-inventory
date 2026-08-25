// Traducerea erorilor Supabase in romana.
//
// Supabase raspunde in engleza. Cardul P2-02 cere ca tot textul de pe ecranul
// de autentificare sa fie romanesc, inclusiv erorile, asa ca ele se mapeaza
// aici si nu se afiseaza niciodata brut.
//
// Mesajul implicit este deliberat vag: un ecran de autentificare care spune
// "utilizatorul nu exista" confirma unui strain ce adrese sunt inregistrate.

const MAP: Array<[RegExp, string]> = [
  [/invalid login credentials/i, "Email sau parolă incorectă."],
  [/email not confirmed/i, "Contul nu este confirmat. Contactează administratorul."],
  [/user not found/i, "Email sau parolă incorectă."],
  [/invalid email/i, "Adresa de email nu este validă."],
  [/email.*required|missing email/i, "Introdu adresa de email."],
  [/password.*required|missing password/i, "Introdu parola."],
  [/rate limit|too many requests/i, "Prea multe încercări. Așteaptă un minut și încearcă din nou."],
  [/network|fetch failed|failed to fetch/i, "Conexiune indisponibilă. Verifică rețeaua și încearcă din nou."],
  [/invalid path specified/i, "Configurare invalidă a adresei Supabase. Anunță administratorul."],
];

export function translateAuthError(message: string | undefined | null): string {
  if (!message) return "Autentificarea a eșuat. Încearcă din nou.";
  for (const [pattern, ro] of MAP) {
    if (pattern.test(message)) return ro;
  }
  return "Autentificarea a eșuat. Încearcă din nou.";
}
