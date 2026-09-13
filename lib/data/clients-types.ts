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

/** Cele cinci etape din enum-ul public.client_stage, migratia 0039, IN ORDINEA
 *  DECLARATA. Ordinea este a datelor, nu a ecranului: baza sorteaza enum-ul dupa
 *  declaratie, iar lista aceasta este aceeasi ordine scrisa o singura data, ca
 *  selectorul sa nu poata sa se abata de la ea. Nici tokenurile nici etichetele
 *  nu sunt in ordine alfabetica. */
export const CLIENT_STAGES = ["cold", "nurture", "follow_up", "quoted", "client"] as const;

export type ClientStage = (typeof CLIENT_STAGES)[number];

/** Etichetele romanesti, din predarea proprietarului, partea 4.2. "În cultivare"
 *  poarta diacritica pe care predarea nu o scrie: regulile depozitului castiga. */
export const CLIENT_STAGE_LABEL: Record<ClientStage, string> = {
  cold: "Lead rece",
  nurture: "În cultivare",
  follow_up: "De reluat",
  quoted: "Ofertat",
  client: "Client",
};

/** Culoarea fiecarei etape, ALATURI de eticheta si niciodata in locul ei.
 *  `name` este culoarea din predare, pe care o citeste testul; `className` este
 *  cum se deseneaza. Violetul nu are un ton rc-, deci vine din paleta Tailwind. */
export const CLIENT_STAGE_COLOUR: Record<ClientStage, { name: string; className: string }> = {
  cold: { name: "red", className: "bg-rc-danger" },
  nurture: { name: "blue", className: "bg-rc-info" },
  follow_up: { name: "amber", className: "bg-rc-warn" },
  quoted: { name: "purple", className: "bg-purple-600" },
  client: { name: "green", className: "bg-rc-ok" },
};

export function isClientStage(value: unknown): value is ClientStage {
  return (CLIENT_STAGES as readonly unknown[]).includes(value);
}

/** Propozitia pentru De reluat fara data. Aceeasi pe calea formularului si pe
 *  calea constrangerii, ca operatorul sa nu vada niciodata eroarea bruta. */
export const FOLLOW_UP_DATE_REQUIRED =
  "Pentru etapa De reluat trebuie completată data de reluare.";

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
  /** P3-43. NULL NUMAI CAND COLOANA NU EXISTA INCA pe baza catre care arata
   *  aplicatia, adica hasClientStage a raspuns nu. Coloana este NOT NULL, deci pe
   *  o baza care o are nu exista client fara etapa. Ecranul citeste null ca "nu
   *  arata etapa", nu ca o etapa. */
  stage: ClientStage | null;
  /** Data de reluare, `YYYY-MM-DD`. Nu se sterge cand etapa trece mai departe. */
  followUpDate: string | null;
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
