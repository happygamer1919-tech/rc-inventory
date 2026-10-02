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

// CUVINTELE ROMANESTI ALE CELOR DOUA FELURI DE INREGISTRARE, SCRISE DE CARDUL
// P3-131, care este cel ce le arata intai. Golul de aici era lasat anume si
// cardul P3-130 a scris de ce: "Ele apar intai ca valori ale filtrului felul
// inregistrarii legate, care este clauza 3 a cardului P3-131, iar acel card este
// cel care decide cum se numesc pe ecran." Exact tiparul lui P3-118 si P3-119 cu
// OUTBOUND_MODE_LABEL.

/** Cele doua feluri de inregistrare, in cuvintele de pe ecran. Valorile filtrului
 *  "Fel înregistrare" al cardului P3-131, clauza 3.
 *
 *  UN LEAD NU ARE CUVANT PROPRIU AICI, si asta nu este o lipsa: un lead ESTE un
 *  rand din public.clients care poarta o etapa, deci o sarcina legata de un lead
 *  poarta tokenul `client` si se citeste "Client". Motivul intreg este la
 *  TaskEntityType mai sus. */
export const TASK_ENTITY_TYPE_LABEL: Record<TaskEntityType, string> = {
  client: "Client",
  project: "Proiect",
};

/** CELE TREI GALETI PE CARE LE-A NUMIT PROPRIETARUL, clauza 6 a cardului P3-131,
 *  si nici una a patra.
 *
 *  TOKENURILE NU SE STOCHEAZA NICIUNDE. Ele nu sunt valori de coloana: sunt felul
 *  in care un ecran grupeaza aceeasi lista, si apar numai in adresa paginii, unde
 *  restul acestei aplicatii scrie deja romanesc (`vedere=leaduri`, `etapa`,
 *  `stare`, `responsabil`). Cuvintele de pe ecran sunt in TASK_GROUP_LABEL. */
export type TaskBucket = "restante" | "azi" | "saptamana";

/** Capetele de grup pe care le deseneaza lista: CELE TREI GALETI PLUS DOUA
 *  RECIPIENTE DE AFISARE.
 *
 *  `altele` SI `fara_termen` NU SUNT GALETI, si distinctia este de fond.
 *  Clauza 6 spune ca galetile sunt "a way of grouping the same list, not three
 *  separate queries": deci fiecare sarcina din lista trebuie sa apara SUB UN CAP
 *  DE GRUP, altfel o sarcina ar exista si nu s-ar vedea NICAIERI, ceea ce este mai
 *  rau decat orice grupare. Doua feluri de sarcina nu intra in niciuna din cele
 *  trei galeti:
 *
 *    FARA TERMEN, care este o stare adevarata si nu o lipsa de date (vezi
 *    `dueDate` mai sus). Nu este niciodata intarziata si nu este in nicio galeata.
 *
 *    CU TERMEN, DAR IN AFARA CELOR TREI: fie mai departe de duminica aceasta, fie
 *    trecuta de termen SI deja finalizata sau anulata, pe care clauza 5 o scoate
 *    anume din Restante. Amandoua ajung in `altele`, si recipientul se numeste
 *    "Alte sarcini" si nu "Mai tarziu" tocmai ca sa nu spuna despre ziua lor ceva
 *    ce nu este adevarat pentru toate.
 *
 *  `taskGroup` din lib/data/tasks-shape.ts le DEDUCE pe amandoua din aceeasi
 *  singura functie `taskBucket`, fara nicio a doua comparatie de zi. Galetile
 *  proprietarului rămân exact trei. */
export type TaskGroup = TaskBucket | "altele" | "fara_termen";

/** Cuvintele romanesti ale capetelor de grup, cu diacriticele lor.
 *
 *  ORDINEA ESTE ORDINEA DE PE ECRAN, SI RESTANTE ESTE PRIMA. Clauza 5 spune ca o
 *  sarcina trecuta de termen "este chiar motivul pentru care cineva deschide acest
 *  ecran", iar ecranul Azi al cardului P3-91 aseaza deja dupa aceeasi regula ("cei
 *  întârziați primii"). Clauza 6 enumera galetile ca "Azi, Aceasta saptamana,
 *  Restante", care spune CARE sunt cele trei si nu in ce ordine se deseneaza. */
export const TASK_GROUP_LABEL: Record<TaskGroup, string> = {
  restante: "Restante",
  azi: "Azi",
  saptamana: "Această săptămână",
  altele: "Alte sarcini",
  fara_termen: "Fără termen",
};

/** Cele trei sortari pe care le-a numit proprietarul, clauza 4, si nici una a
 *  patra: termenul, urgenta si data la care sarcina a fost scrisa. */
export type TaskSortField = "termen" | "urgenta" | "creare";

/** Incotro, fiindca acceptanta (b) cere fiecare sortare in AMANDOUA directiile. */
export type TaskSortDirection = "crescator" | "descrescator";

export const TASK_SORT_LABEL: Record<TaskSortField, string> = {
  termen: "Termen",
  urgenta: "Urgență",
  creare: "Dată creare",
};

export const TASK_SORT_DIRECTION_LABEL: Record<TaskSortDirection, string> = {
  crescator: "Crescător",
  descrescator: "Descrescător",
};

/** Cele cinci filtre pe care le-a numit proprietarul, clauza 3, si nici unul al
 *  sasele. Un camp gol inseamna "fara acest filtru".
 *
 *  SIRURI SI NU UNIUNI, fiindca ele vin din adresa paginii, unde oricine poate
 *  scrie orice: `parseTaskQuery` din lib/data/tasks-query.ts este singurul loc care
 *  le curata, si o valoare pe care nu o recunoaste devine "fara filtru" si nu un
 *  ecran gol. */
export type TaskListFilter = {
  /** Una din cele patru stari, token englezesc. */
  status: string;
  /** Una din cele trei urgente, token englezesc. */
  priority: string;
  /** Id-ul profilului responsabil. Deviatia D4: se filtreaza pe profil, fiindca
   *  nu exista niciun model de organizatie in aceasta platforma si niciunul nu se
   *  inventeaza. */
  assigneeId: string;
  /** Capetele intervalului de termen, yyyy-mm-dd, oricare dintre ele poate lipsi. */
  dueFrom: string;
  dueTo: string;
  /** Felul inregistrarii legate: `client` sau `project`. */
  entityType: string;
};

/** Filtrele, sortarea si incotro: tot ce ecranul tine in adresa paginii. */
export type TaskListQuery = TaskListFilter & {
  sort: TaskSortField;
  direction: TaskSortDirection;
};

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
