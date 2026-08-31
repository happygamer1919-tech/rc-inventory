// Doua ajutoare marunte peste forma randurilor si a numelor de fisier.
//
// FISIERUL ACESTA NU IMPORTA NIMIC. Nici server-only, nici clientul Supabase,
// nici next. Este deliberat: `one` traia in lib/data/outbound.ts, care incepe cu
// import "server-only", si a-l exporta de acolo ar fi insemnat sa se adauge inca
// un export de VALOARE dintr-un modul de server, adica exact pericolul latent
// pentru care acest branch a sters cele patru randuri de re-export din
// inbound.ts si outbound.ts. Un component de client care ar fi importat `one` de
// acolo ar fi tras next/headers in pachetul de browser, si lantul acela este scris
// deja in docs/LEARNINGS.md. Aici nu poate.

/**
 * Randul incorporat, ca obiect, indiferent cum il trimite PostgREST.
 *
 * O relatie incorporata vine uneori ca obiect si uneori ca tablou cu un element,
 * dupa cum vede planificatorul relatia. Cine citeste `row.client.name` direct
 * primeste undefined pe varianta cealalta, tacut, si defectul iese la suprafata
 * mult mai tarziu, ca un camp gol pe ecran.
 */
export function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Numele de fisier redus la ce poate sta intr-o cale de storage.
 *
 * Diacriticele se descompun si se arunca accentele, orice altceva din afara lui
 * [A-Za-z0-9._-] devine cratima, cratimele de la capete cad, si lungimea se taie
 * la 120. Un nume care se reduce la sirul gol devine "document", pentru ca o cale
 * care se termina in slash nu este o cale catre un fisier.
 */
export function safeFileName(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "document"
  );
}
