import "server-only";

// P2-11. Verificarea prezentei variabilelor de mediu, la pornirea serverului.
//
// DE CE LA PORNIRE SI NU LA PRIMA CERERE. O variabila lipsa descoperita la
// prima cerere se vede ca un ecran care nu merge, la un moment ales de primul
// om care deschide aplicatia. Descoperita la pornire, se vede ca un server care
// refuza sa porneasca, in jurnalul deployului, inainte ca cineva sa apuce sa
// intre. Al doilea esec este acelasi defect, semnalat cu ore mai devreme si
// catre persoana potrivita.
//
// NUMELE, NICIODATA VALOAREA. Mesajul numeste VARIABILA care lipseste si nimic
// altceva: nu valoarea, nu o valoare partiala, nu lungimea ei si nu prefixul ei.
// O lungime spune ce fel de cheie este si cat de departe a ajuns cine a copiat-o,
// iar sectiunea 7 din CLAUDE.md nu face exceptii.
//
// DOUA CLASE, SI GRANITA DINTRE ELE ESTE "POATE SERVI O PAGINA".
//
// OBLIGATORII sunt variabilele fara de care aplicatia nu poate servi NIMIC:
// fara ele fiecare ecran este o eroare, deci a porni este o minciuna. Lipsa lor
// arunca si serverul nu porneste.
//
// ASTEPTATE IN PRODUCTIE sunt cele fara de care o FUNCTIE anume nu merge, iar
// restul aplicatiei merge complet: fara RESEND_API_KEY nu pleaca mementouri si
// stocul se misca in continuare corect; fara MAKE_WEBHOOK_URL nu se citeste
// automat un document si comanda se poate introduce manual. Lipsa lor scrie un
// avertisment care NUMESTE variabila, si nu opreste serverul.
//
// A pune a doua clasa in prima ar fi mai "strict" si mai prost: ar transforma
// un depozit fara email intr-un depozit fara aplicatie, si ar face imposibila
// rularea suitei si a oricarui mediu de dezvoltare partial configurat.

/** Fara astea nu se poate servi niciun ecran. */
const REQUIRED = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;

/** Lipsa lor scoate din functiune o singura functie, nu aplicatia. */
const EXPECTED_IN_PRODUCTION = [
  // Callback-ul extragerii scrie fara sesiune, deci are nevoie de service_role.
  // Ruling R-029: precoditie a lui P2-08b.
  "SUPABASE_SERVICE_ROLE_KEY",
  // Trimiterea documentului catre scenariul Make (P2-08a).
  "MAKE_WEBHOOK_URL",
  // Antetul X-RC-Secret cu care scenariul Make autentifica cererea NOASTRA.
  // Perechea lui MAKE_CALLBACK_SECRET, si in directia cealalta.
  "MAKE_WEBHOOK_SECRET",
  // Antetul cu care se verifica un callback venit de la Make.
  "MAKE_CALLBACK_SECRET",
  // Mementourile de stoc (P2-10).
  "RESEND_API_KEY",
  // Adresa canonica pe care aterizeaza redirectarile de autentificare (P2-12).
  "NEXT_PUBLIC_SITE_URL",
] as const;

function missingFrom(names: readonly string[]): string[] {
  // Citire calculata, si aici este in regula: acest fisier ruleaza NUMAI pe
  // server, unde process.env este un obiect real. Inlocuirea la compilare de
  // care depinde lib/supabase/env.ts este necesara doar pentru variabilele
  // NEXT_PUBLIC_ care ajung in pachetul trimis browserului.
  return names.filter((name) => {
    const value = process.env[name];
    return typeof value !== "string" || value.trim().length === 0;
  });
}

/**
 * Arunca daca lipseste ceva obligatoriu. Avertizeaza, numind variabila, daca
 * lipseste ceva asteptat in productie.
 */
export function assertRequiredEnv(): void {
  const missing = missingFrom(REQUIRED);
  if (missing.length > 0) {
    throw new Error(
      `Pornire oprită: lipsesc variabile de mediu obligatorii: ${missing.join(", ")}. ` +
        "Verifică .env.local în dezvoltare sau variabilele proiectului în producție. " +
        "Nicio valoare nu este afișată, doar numele.",
    );
  }

  if (process.env.NODE_ENV !== "production") return;

  const expected = missingFrom(EXPECTED_IN_PRODUCTION);
  if (expected.length > 0) {
    console.warn(
      `[mediu] Variabile așteptate în producție care lipsesc: ${expected.join(", ")}. ` +
        "Funcțiile care depind de ele nu vor rula. Restul aplicației funcționează.",
    );
  }
}
