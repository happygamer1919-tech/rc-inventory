// Ce citeste ecranul Sarcini din adresa paginii: cele cinci filtre, sortarea si
// incotro. Cardul P3-131, goal G73, Item 4 al lui Ivan, partea a doua.
//
// NIMIC DE SERVER IN ACEST FISIER, ca si tasks-types.ts si tasks-shape.ts, si
// pentru acelasi motiv: pagina de server il cheama ca sa afle ce sa ceara bazei, iar
// componentul de client il cheama ca sa scrie inapoi in adresa. Un modul curat poate
// fi chemat de amandoua si poate fi citit direct de un test.
//
// FILTRELE SI SORTAREA STAU IN ADRESA PAGINII, NU IN STAREA COMPONENTULUI, si asta
// este o constatare reparata si nu o preferinta. Antetul lui
// components/clients/ClientsScreen.tsx o scrie: "FIECARE FILTRU ESTE IN URL, deci o
// lista filtrata se poate trimite cuiva ca legatura si butonul de inapoi o reface
// intocmai. Un filtru care traieste numai in starea componentului este un ecran pe
// care nu il poti arata nimanui." Constatarea F7, cardul P3-96, a reparat chiar
// divergenta dintre o stare locala si adresa: "CASUTA DE CAUTARE URMEAZA URL-UL,
// care este adevarul."
//
// NUMELE PARAMETRILOR SUNT ROMANESTI, ca in tot restul acestei aplicatii: /clienti
// are `vedere`, `etapa`, `stare`, `tip` si `pagina`, iar /azi are `responsabil`.
// Adresa unui ecran romanesc este citita de operator cand o trimite cuiva.
//
// GRUPAREA PE GALETI NU ESTE UN PARAMETRU, SI GOLUL ESTE EXPLICAT. Clauza 6 cere ca
// galetile sa fie "a way of grouping the same list": lista este MEREU grupata, deci
// gruparea nu are nicio stare de tinut nicaieri, nici in component, nici in adresa.
// Un parametru care ar arata o singura galeata ar fi un AL SASELEA FILTRU, iar
// clauza 3 numeste cinci si spune "Do not add a sixth filter because it seemed
// useful; that is a new card."
//
// O VALOARE NERECUNOSCUTA DIN ADRESA ESTE "FARA FILTRU" SI NU O EROARE. Oricine
// poate scrie orice in adresa, si o legatura veche trebuie sa arate tot, nu gol:
// acelasi tipar pe care il scrie app/(app)/azi/page.tsx, "un id care nu este in
// lista de responsabili nu filtreaza nimic".

import { isDayString, isTaskEntityType, isTaskPriority, isTaskStatus } from "./tasks-shape";
import type {
  TaskListFilter,
  TaskListQuery,
  TaskSortDirection,
  TaskSortField,
} from "./tasks-types";

/** Numele parametrilor, O SINGURA COPIE. Pagina de server ii citeste, componentul
 *  de client ii scrie, si un nume scris de doua ori este un filtru care intr-o zi
 *  se pierde la jumatatea drumului. */
export const TASK_PARAM = {
  status: "stare",
  priority: "urgenta",
  assignee: "responsabil",
  dueFrom: "de_la",
  dueTo: "pana_la",
  entityType: "fel",
  sort: "sortare",
  direction: "ordine",
} as const;

/** Sortarea implicita: termenul, cel mai apropiat intai.
 *
 *  ASTA ESTE INTREBAREA CU CARE SE DESCHIDE ECRANUL, "ce urmeaza", deci este si
 *  raspunsul pe care il da fara sa fie intrebat. */
export const TASK_SORT_DEFAULT: TaskSortField = "termen";
export const TASK_DIRECTION_DEFAULT: TaskSortDirection = "crescator";

const SORT_FIELDS: TaskSortField[] = ["termen", "urgenta", "creare"];
const DIRECTIONS: TaskSortDirection[] = ["crescator", "descrescator"];

export const ALL_TASK_SORT_FIELDS: TaskSortField[] = SORT_FIELDS;
export const ALL_TASK_SORT_DIRECTIONS: TaskSortDirection[] = DIRECTIONS;

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

/**
 * Adresa paginii, curatata in cele cinci filtre plus sortarea.
 *
 * SINGURUL LOC CARE CURATA, deci singurul in care o valoare scrisa de mana devine
 * "fara filtru". Asta ii lasa componentului dreptul sa randeze orice primeste si
 * paginii dreptul sa ceara bazei orice primeste.
 *
 * ID-UL RESPONSABILULUI NU SE VERIFICA AICI contra listei de profiluri: lista se
 * citeste din baza si acest fisier nu are server. Pagina il compara cu lista pe care
 * o are oricum, ca sa nu faca un drum in plus, exact ca /azi.
 */
export function parseTaskQuery(params: Record<string, string | undefined>): TaskListQuery {
  const status = clean(params[TASK_PARAM.status]);
  const priority = clean(params[TASK_PARAM.priority]);
  const entityType = clean(params[TASK_PARAM.entityType]);
  const dueFrom = clean(params[TASK_PARAM.dueFrom]);
  const dueTo = clean(params[TASK_PARAM.dueTo]);
  const sort = clean(params[TASK_PARAM.sort]) as TaskSortField;
  const direction = clean(params[TASK_PARAM.direction]) as TaskSortDirection;

  return {
    status: isTaskStatus(status) ? status : "",
    priority: isTaskPriority(priority) ? priority : "",
    assigneeId: clean(params[TASK_PARAM.assignee]),
    // NUMAI FORMA ZILEI, nu existenta ei in calendar, care este regula scrisa in
    // antetul lui lib/data/tasks-shape.ts: singura autoritate asupra unei zile este
    // coloana `date` din PostgreSQL. Un capat de interval scris pe jumatate nu
    // filtreaza nimic, in loc sa goleasca lista.
    dueFrom: isDayString(dueFrom) ? dueFrom : "",
    dueTo: isDayString(dueTo) ? dueTo : "",
    entityType: isTaskEntityType(entityType) ? entityType : "",
    sort: SORT_FIELDS.includes(sort) ? sort : TASK_SORT_DEFAULT,
    direction: DIRECTIONS.includes(direction) ? direction : TASK_DIRECTION_DEFAULT,
  };
}

/**
 * Este vreun filtru pus?
 *
 * BUTONUL "Șterge filtrele" SE ARATA NUMAI PE ASTA, ca pe /clienti si pe /facturare:
 * un buton care nu are ce sa stearga este un buton care invata operatorul sa nu se
 * uite la butoane.
 *
 * SORTAREA NU ESTE UN FILTRU si nu intra in socoteala: ea nu ascunde niciun rand,
 * deci "Șterge filtrele" nu o atinge. Un buton care ar arunca si ordinea ar muta
 * operatorul dintr-o lista in alta fara sa o spuna, care este chiar constatarea F6
 * reparata de cardul P3-96 pe /clienti.
 */
export function taskFilterActive(filter: TaskListFilter): boolean {
  return (
    filter.status !== "" ||
    filter.priority !== "" ||
    filter.assigneeId !== "" ||
    filter.dueFrom !== "" ||
    filter.dueTo !== "" ||
    filter.entityType !== ""
  );
}

/** Cele cinci campuri de filtru golite, pentru butonul de mai sus. Scrise aici o
 *  singura data, ca `taskFilterActive` si stergerea sa nu poata ajunge sa citeasca
 *  doua liste diferite de campuri: aceea este jumatatea de defect pe care a avut-o
 *  /clienti inainte de P3-96. */
export const TASK_FILTER_CLEARED: Record<string, string> = {
  [TASK_PARAM.status]: "",
  [TASK_PARAM.priority]: "",
  [TASK_PARAM.assignee]: "",
  [TASK_PARAM.dueFrom]: "",
  [TASK_PARAM.dueTo]: "",
  [TASK_PARAM.entityType]: "",
};
