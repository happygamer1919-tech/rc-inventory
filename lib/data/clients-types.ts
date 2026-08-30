// Tipurile clientilor, fara nimic de server.
//
// Acelasi motiv ca la projects-types si suppliers-types: un component de client
// care ia de aici o valoare nu trebuie sa traga in bundle un modul marcat
// "server-only".

/** Cele doua valori din enum-ul public.client_type, migratia 0013. */
export type ClientType = "company" | "individual";

/** Etichetele romanesti. Valorile stocate raman tokenuri englezesti (P2-01). */
export const CLIENT_TYPE_LABEL: Record<ClientType, string> = {
  company: "Companie",
  individual: "Persoană fizică",
};

export function isClientType(value: unknown): value is ClientType {
  return value === "company" || value === "individual";
}

/** Un rand din lista de clienti.
 *
 *  CINCI CAMPURI, PENTRU CINCI COLOANE. P3-06 fixeaza lista la Denumire, Tip,
 *  Telefon, Proiecte active si Stare, si spune ca adresa, emailul, IDNO-ul si
 *  notele sunt detaliu si nu lista. Tipul acesta este regula aceea scrisa in
 *  TypeScript: un ecran nu poate afisa o coloana pe care nu o poate citi. */
export type ClientRow = {
  id: string;
  name: string;
  type: ClientType;
  phone: string | null;
  activeProjects: number;
  active: boolean;
};

/** Un client cu tot ce stie sistemul despre el, pentru ruta de detaliu. */
export type ClientDetail = {
  id: string;
  name: string;
  type: ClientType;
  fiscalCode: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
};

/** Filtrele listei, toate in sirul de interogare din URL.
 *
 *  P3-06: fiecare filtru este in URL, ca o lista filtrata sa poata fi trimisa
 *  cuiva ca legatura si ca butonul de inapoi sa o refaca. Un filtru care
 *  traieste numai in starea componentului este un ecran pe care nu il poti
 *  arata nimanui. */
export type ClientListQuery = {
  q: string;
  type: ClientType | "";
  status: "active" | "inactive" | "toate";
  page: number;
};

/** P3-06 fixeaza paginarea la 25 si spune ca lista nu randeaza niciodata un
 *  tabel nemarginit. Numarul este aici, o singura data, ca ecranul si testul sa
 *  nu tina fiecare propria copie. */
export const CLIENTS_PAGE_SIZE = 25;
