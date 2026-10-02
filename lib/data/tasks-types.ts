// Tipurile, tokenurile si etichetele sarcinilor, fara nimic de server.
//
// Cardul P3-130, goal G73, Item 4 al lui Ivan de pe 2026-09-30. Migratia 0068
// creeaza cele trei enumerari; aici stau uniunile lor si cuvintele romanesti.
//
// DE CE UN MODUL DE TIPURI SEPARAT. Acelasi motiv ca la outbound-types si
// inbound-types: un component de client care ia de aici o eticheta nu trebuie sa
// traga in bundle un modul marcat "server-only", iar un fisier "use server" nu
// are voie sa exporte decat functii async. Cardurile P3-131, P3-132 si P3-133
// construiesc ecrane, deci ele vor importa de aici si nu din lib/data/tasks.ts.
//
// FISIERUL NU NUMESTE NICIO TABELA SI NU FACE NICIO CITIRE, deliberat.
// check:pending-schema-reads cere o poarta de capabilitate in orice fisier din
// lib/, app/ sau components/ care ajunge la o tabela aflata in registrul de
// asteptare, iar un modul fara nicio citire nu are ce sa apere cu o poarta. Numele
// tabelei se scrie la locul citirii, in lib/data/tasks.ts si in
// lib/data/tasks-actions.ts, si amandoua trec pe langa poarta cardului.
//
// CUVANTUL `description` ESTE O PERECHE TOLERATA PENTRU ACEST FISIER, inregistrata
// in scripts/poc-free/check-pending-schema-reads.mjs cu motivul scris. Coloana in
// asteptare care poarta acest nume este extraction_draft_lines.description, din
// migratia 0053, iar verificarea o cauta ORIUNDE in fisier, deliberat. Aici este
// campul unei sarcini, tipul lui, si nicio tabela nu este chemata. Exact tiparul
// si exact motivul pe care le-au inregistrat deja lib/data/facturare-create-types.ts
// si lib/data/facturare-detail-types.ts, care nici ele nu numesc vreo poarta.

/** Cele patru stari, cardul P3-130 clauza 3. TOKENURI ENGLEZESTI, P2-01: o
 *  valoare de enum nu este text de interfata, exact cum spune defaults-ul acelui
 *  card si cum face deja unit_code din 0001.
 *
 *  `cancelled` ESTE O STARE SI NU O STERGERE, propozitia lui Ivan si regula de
 *  fond a acestui proiect: datele de test se anuleaza, nu se sterg niciodata.
 *  Migratia 0068 nu da tabelei nicio politica de stergere si niciun drept de
 *  stergere, deci o sarcina anulata ramane citibila si numarabila. */
export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";

/** Cele trei urgente, cardul P3-130 clauza 3. Tokenuri englezesti, acelasi motiv. */
export type TaskPriority = "low" | "medium" | "high";

/** Felul inregistrarii de care este legata sarcina, cand este legata de una.
 *
 *  DOUA VALORI SI NU TREI, SI ASTA ESTE O DECIZIE SCRISA. Cardul spune "a lead, a
 *  client or a project". In aceasta platforma un LEAD NU ESTE UN LUCRU SEPARAT:
 *  este un rand din public.clients care poarta o etapa, din migratia 0039, iar
 *  decizia este pe lista celor care nu se redeschid ("A lead is a client row with
 *  a stage. No leads table, no second detail page."). Nu exista nicio tabela
 *  public.leads in niciuna din cele saizeci si opt de migratii, si ecranele
 *  Leaduri citesc public.clients.
 *
 *  Un al treilea token ar fi deci o valoare pe care NIMIC nu ar putea-o referi
 *  vreodata, iar o eticheta de enum nu se mai scoate odata ce un rand o poarta.
 *
 *  ASTA NU SLABESTE P3-132, care vrea un panou pe fisa unui lead, a unui client si
 *  a unui proiect: fisa leadului citeste un rand de client, deci intreaba pe
 *  acelasi token. */
export type TaskEntityType = "client" | "project";

/** Cele patru cuvinte romanesti ale starilor, cu diacriticele lor.
 *
 *  UN `Record` PE UNIUNE SI NU UN `Partial`, din acelasi motiv pe care il scrie
 *  OUTBOUND_MODE_LABEL: `npx tsc --noEmit` refuza un token adaugat mai tarziu
 *  careia cineva uita sa ii dea eticheta. O lista de etichete care poate fi
 *  incompleta este o lista care va fi incompleta.
 *
 *  AICI SI NU IN COMPONENT, fiindca trei carduri vor arata aceleasi cuvinte:
 *  lista din P3-131, panoul din P3-132 si sectiunea Azi din P3-133. Trei copii ale
 *  aceluiasi cuvant sunt trei locuri de tinut la zi. */
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "De făcut",
  in_progress: "În lucru",
  done: "Finalizată",
  cancelled: "Anulată",
};

/** Cele trei cuvinte romanesti ale urgentelor, cu diacriticele lor. */
export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Scăzută",
  medium: "Medie",
  high: "Ridicată",
};

// CUVINTELE ROMANESTI ALE CELOR DOUA FELURI DE INREGISTRARE NU SE SCRIU AICI, SI
// GOLUL ESTE LASAT ANUME. Ele apar intai ca valori ale filtrului "felul
// inregistrarii legate", care este clauza 3 a cardului P3-131, iar acel card este
// cel care decide cum se numesc pe ecran. Exact tiparul pe care l-a urmat P3-118:
// a lasat OUTBOUND_MODE_LABEL necompletat fiindca "Cuvintele romanesti Proiect si
// Client direct sunt ale cardurilor P3-119 si P3-120", si P3-119 l-a scris, in
// acest acelasi fel de fisier. Cardul de acum nu atinge niciun ecran, clauza 7,
// deci nu are de unde sa stie ce cuvant citeste operatorul.

/** O sarcina, asa cum o citeste aplicatia. Numele coloanelor nu apar aici: ele
 *  se citesc in lib/data/tasks.ts, care este aparat de poarta. */
export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  /** Ziua scadentei, yyyy-mm-dd, exact sirul pe care il da si il primeste
   *  components/ui/DateField.tsx. Null cand sarcina nu are termen, ceea ce este o
   *  stare adevarata si nu o lipsa de date. */
  dueDate: string | null;
  /** Profilul responsabil, si numele lui pentru ecran. Amandoua null cand sarcina
   *  nu este inca atribuita. */
  assigneeId: string | null;
  assigneeName: string | null;
  /** Inregistrarea legata, SAU AMANDOUA NULL. Migratia 0068 le tine in pereche
   *  printr-o restrictie: un tip fara id arata spre nimic, iar un id fara tip este
   *  un id pe care nimeni nu il poate duce la o tabela. */
  entityType: TaskEntityType | null;
  entityId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Ce trimite un apelant care scrie o sarcina noua. Sirurile vin asa cum le da un
 *  formular, iar validarea lor este in lib/data/tasks-shape.ts. */
export type NewTaskInput = {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  /** yyyy-mm-dd, sau gol pentru "fara termen". SINGURA AUTORITATE ASUPRA FAPTULUI
   *  CA ZIUA EXISTA IN CALENDAR ESTE COLOANA `date` DIN PostgreSQL, exact ca la
   *  data ridicarii din P3-118: o a doua verificare de calendar scrisa in
   *  TypeScript ar fi doua rutine care trebuie sa fie de acord pentru totdeauna. */
  dueDate?: string;
  assigneeId?: string;
  entityType?: string;
  entityId?: string;
};

/** Ce se poate schimba pe o sarcina care exista. Un camp absent nu se atinge, iar
 *  un camp trimis gol se goleste: cele doua sunt lucruri diferite si formularul
 *  are nevoie de amandoua. */
export type TaskPatch = {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  assigneeId?: string;
  entityType?: string;
  entityId?: string;
};
