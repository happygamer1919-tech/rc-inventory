// Citirea pe pagini a sarcinilor, fara server-only si cu clientul dat ca argument,
// ca un test sa-i poata da unul fals si sa dovedeasca paginarea fara baza de date.
//
// DE CE EXISTA. PostgREST raspunde cu cel mult 1000 de randuri si nu spune ca a
// taiat. Sarcinile nu se sterg niciodata, deci cele terminate si cele anulate se
// aduna, iar ordinea implicita este termenul crescator, fara termen la sfarsit: peste
// o mie de sarcini randurile pastrate sunt cele MAI VECHI, iar cele de saptamana asta
// si cele fara termen cad de pe lista, cu un antet care arata un numar normal.
//
// Cele doua citiri trec prin readAllPages (lib/data/id-list.ts), care cere si totalul
// in aceeasi cerere si esueaza vizibil daca randurile adunate nu sunt cat totalul.
// Ordinea se termina mereu cu `id`, ca paginile sa nu sara si sa nu repete un rand.

import { readAllPages, type CountedPage } from "./id-list";
import type { TaskListQuery } from "./tasks-types";

/** Forma minima a interogarii pe care o folosesc citirile de mai jos. Clientul
 *  supabase-js o satisface; un test o satisface cu un obiect scris de mana. */
export type TaskReadQuery<T> = PromiseLike<CountedPage<T>> & {
  eq(column: string, value: string): TaskReadQuery<T>;
  gte(column: string, value: string): TaskReadQuery<T>;
  lte(column: string, value: string): TaskReadQuery<T>;
  order(column: string, options: { ascending: boolean; nullsFirst?: boolean }): TaskReadQuery<T>;
  range(from: number, to: number): TaskReadQuery<T>;
};

/** Cum se porneste o cerere noua: select cu totalul cerut, pe tabela sarcinilor.
 *  Numele tabelei il scrie tasks.ts, care trece poarta hasTasks, nu fisierul acesta. */
export type TaskReadStart<T> = () => TaskReadQuery<T>;

/**
 * Cele trei sortari ale clauzei 4, traduse in coloane.
 *
 * URGENTA SE SORTEAZA PE ENUMERARE SI NU PE CUVANT, si asta nu este o scurtatura:
 * PostgreSQL ordoneaza o enumerare dupa ORDINEA IN CARE ETICHETELE SUNT DECLARATE, iar
 * migratia 0068 le declara `low`, `medium`, `high`, adica de la cea mai mica la cea mai
 * mare. Deci crescator inseamna Scăzută intai, exact ce citeste operatorul. Sortata ca
 * text ar fi dat `high`, `low`, `medium`, adica o ordine care nu inseamna nimic.
 *
 * `id` LA FINAL, MEREU. Doua randuri cu acelasi termen, aceeasi urgenta sau aceeasi
 * clipa de creare pot sosi in orice ordine de la baza, si o ordine care se schimba
 * intre doua randari este o lista pe care un test nu o poate masura si un om nu o
 * poate urmari. La paginare este si mai mult: fara el o pagina poate sari sau repeta
 * un rand.
 */
export function orderBy(query?: TaskListQuery): { column: string; ascending: boolean }[] {
  const ascending = (query?.direction ?? "crescator") === "crescator";
  const column =
    query === undefined
      ? "created_at"
      : query.sort === "termen"
        ? "due_date"
        : query.sort === "urgenta"
          ? "priority"
          : "created_at";

  // Fara nicio sortare ceruta, raspunsul rămâne cel de dinainte de P3-131: cele mai
  // noi intai.
  if (query === undefined) {
    return [
      { column: "created_at", ascending: false },
      { column: "id", ascending: false },
    ];
  }

  return [
    { column, ascending },
    { column: "id", ascending },
  ];
}

/** Toate sarcinile care se potrivesc filtrelor, pe pagini, in ordinea ceruta. */
export function readTaskRows<T>(
  start: TaskReadStart<T>,
  query?: TaskListQuery,
  pageSize?: number,
): Promise<T[]> {
  return readAllPages<T>(
    "sarcinile",
    (from, to) => {
      let request = start();

      // CELE CINCI FILTRE SE APLICA PE SERVER, nu in memorie, ca pe fiecare alta lista
      // a acestei aplicatii: antetul lui components/clients/ClientsScreen.tsx scrie
      // regula ("FILTRAREA SE FACE PE SERVER... Componentul acesta nu filtreaza nimic in
      // memorie"), iar indexul tasks_status_due_date_idx din migratia 0068 este scris de
      // P3-130 chiar pentru ele.
      //
      // UN CAMP GOL NU SE TRIMITE, deci nu exista "filtrat pe sirul gol": aceea ar fi o
      // lista mereu goala pe o adresa scrisa de mana.
      if (query) {
        if (query.status !== "") request = request.eq("status", query.status);
        if (query.priority !== "") request = request.eq("priority", query.priority);
        if (query.assigneeId !== "") request = request.eq("assignee_id", query.assigneeId);
        if (query.entityType !== "") request = request.eq("entity_type", query.entityType);
        // INTERVALUL DE TERMEN SE COMPARA CA ZI DE CALENDAR, nu ca moment: `due_date`
        // este o coloana `date`, iar capetele sunt siruri `yyyy-mm-dd` curatate de
        // parseTaskQuery. Amandoua capetele sunt INCLUSE, fiindca un operator care scrie
        // acelasi termen in amandoua casutele cere ziua aceea si nu o lista goala.
        if (query.dueFrom !== "") request = request.gte("due_date", query.dueFrom);
        if (query.dueTo !== "") request = request.lte("due_date", query.dueTo);
      }

      for (const { column, ascending } of orderBy(query)) {
        // TERMENUL FARA VALOARE STA LA SFARSIT IN AMANDOUA DIRECTIILE, prin nullsFirst
        // false. O sarcina fara termen nu este nici cea mai apropiata, nici cea mai
        // indepartata: nu are zi, deci nu are loc in ordinea zilelor, iar lista o aseaza
        // sub capul ei de grup "Fără termen" oricum.
        request = request.order(column, { ascending, nullsFirst: false });
      }

      return request.range(from, to);
    },
    pageSize,
  );
}

/** Toate sarcinile unei inregistrari, pe pagini, cele mai noi intai. */
export function readEntityTaskRows<T>(
  start: TaskReadStart<T>,
  entityType: string,
  entityId: string,
  pageSize?: number,
): Promise<T[]> {
  return readAllPages<T>(
    "sarcinile înregistrării",
    (from, to) =>
      start()
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    pageSize,
  );
}
