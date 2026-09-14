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

/** P3-45. Etapele de lead: toate in afara de `client`, in ordinea declarata. Sunt
 *  cipurile vederii Leaduri; `client` se atinge prin vederea Clienți. */
export const LEADURI_STAGES = CLIENT_STAGES.filter(
  (s): s is Exclude<ClientStage, "client"> => s !== "client",
);

/** P3-45. Cele cinci valori din enum-ul public.client_source, migratia 0040, in
 *  ordinea din predarea proprietarului, partea 4.4. */
export const CLIENT_SOURCES = ["recomandare", "telefon", "site", "vizita", "altul"] as const;

export type ClientSource = (typeof CLIENT_SOURCES)[number];

/** Cu diacritice, dupa CLAUDE.md sectiunea 11: predarea scrie "vizita". */
export const CLIENT_SOURCE_LABEL: Record<ClientSource, string> = {
  recomandare: "Recomandare",
  telefon: "Telefon",
  site: "Site",
  vizita: "Vizită",
  altul: "Altul",
};

export function isClientSource(value: unknown): value is ClientSource {
  return (CLIENT_SOURCES as readonly unknown[]).includes(value);
}

/** P3-45. Cele doua vederi ale aceleiasi liste. Sirul vid este lista nefiltrata,
 *  care arata fiecare client, exact ca inainte de card. */
export type ClientView = "leaduri" | "clienti";

export function isClientView(value: unknown): value is ClientView {
  return value === "leaduri" || value === "clienti";
}

/** Numarul de clienti pe fiecare etapa, sub aceeasi cautare si aceeasi stare. */
export type ClientStageCounts = Record<ClientStage, number>;

/** Un membru al echipei care poate primi un lead, din profilurile active. */
export type ClientOwnerChoice = { id: string; fullName: string };

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
  /** P3-45. Pentru coloanele vederii Leaduri, Etapă si Data de reluare. NULL cand
   *  lista merge pe calea de dinainte de 0040, care nu le citeste. */
  stage: ClientStage | null;
  followUpDate: string | null;
  /** Data de reluare este inainte de azi IN CHISINAU. Calculat in baza, nu aici. */
  overdue: boolean;
  /** P3-48. Pentru coloana Interes a vederii Leaduri. Se citeste numai in vederea
   *  Leaduri; NULL in celelalte, cand nu l-a scris nimeni, sau pe calea de dinainte
   *  de 0040. */
  interest: string | null;
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
  /** P3-48. Adevarat numai cand hasClientLeaduri a raspuns da. Fals inseamna "nu
   *  arata randurile si nu oferi campurile", nu "necompletate". */
  leaduriAvailable: boolean;
  source: ClientSource | null;
  interest: string | null;
  ownerId: string | null;
  /** Numele responsabilului, dupa aceeasi regula ca lista de responsabili. NULL
   *  cand nu are responsabil, sau cand profilul lui nu se poate citi de cine se
   *  uita: profiles_select din 0001 arata altcuiva decat administratorului doar
   *  profilul propriu. Niciodata id-ul in locul numelui. */
  ownerName: string | null;
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
  /** P3-45, `vedere`. NU `stare`, care inseamna activ sau inactiv. */
  view: ClientView | "";
  /** P3-45, `etapa`. O etapa de lead implica vederea Leaduri, `client` vederea Clienți. */
  stage: ClientStage | "";
};

/** P3-06 fixeaza paginarea la 25 si spune ca lista nu randeaza niciodata un
 *  tabel nemarginit. Numarul este aici, o singura data, ca ecranul si testul sa
 *  nu tina fiecare propria copie. */
export const CLIENTS_PAGE_SIZE = 25;
