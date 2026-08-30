// Tipurile furnizorilor, fara nimic de server.
//
// Acelasi motiv ca la projects-types: un component de client care ia de aici o
// valoare nu trebuie sa traga in bundle un modul marcat "server-only".

/** Un furnizor asa cum il vede un selector. */
export type SupplierOption = {
  id: string;
  name: string;
};

/** Un uuid, ca sa se poata distinge un ID de furnizor de un nume nou tastat.
 *
 *  P3-05 face din furnizor o inregistrare, dar lista NU este inchisa: un
 *  furnizor nou se scrie in acelasi combobox. Valoarea trimisa la server este
 *  deci fie un id, fie un nume, iar aceasta este linia care le separa. Nu este
 *  ambiguu: nimeni nu scrie un uuid in casuta de furnizor. */
export function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}
