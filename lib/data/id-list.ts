// Loturi de id-uri pentru filtrele PostgREST.
//
// DE CE EXISTA ACEST FISIER. Un filtru `.in("coloana", ids)` ajunge in ADRESA
// cererii, nu in corpul ei: `?coloana=in.(uuid,uuid,...)`. Un uuid plus virgula
// costa 37 de octeti, deci o lista care creste cu datele clientului creste
// lungimea adresei, si portarul din fata lui PostgREST refuza cererea cu
// 414 URI Too Long cand trece de bugetul lui.
//
// MASURAT, NU PRESUPUS, si masurat de doua ori. Pe stiva locala din 2026-09-04
// bisectia a dat 208 de id-uri acceptate si 209 refuzate pe interogarea liniilor
// (circa 7.7 KB de linie de cerere). Pe stiva ridicata pentru P3-38, la
// 2026-09-05, aceeasi forma a raspuns 200 la 128 de id-uri (4819 octeti de
// adresa) si 414 la 256 (9555 octeti). Forma este a unei limite de 8 KB.
//
// PRAGUL ESTE AL MEDIULUI, DECI NUMARUL DE MAI JOS NU ESTE PRAGUL. Proiectul
// gazduit sta in spatele altei infrastructuri si limita lui poate fi alta.
// Lotul este ales mult sub cel mai mic prag observat, ca sa ramana corect si pe
// un portar mai strans, si este UN SINGUR NUMAR intr-un singur loc: un al
// doilea, scris la alt apel, ar fi exact felul de prag pe care cineva il
// intalneste din nou peste un an.
//
// CAND SE POATE, LOTUL NU ESTE RASPUNSUL. O relatie reala intre tabele se cere
// prin resursa imbricata a lui PostgREST, intr-o singura cerere, si atunci nu
// mai exista nicio lista de id-uri de taiat. Vezi listReviewDrafts: liniile vin
// asa, iar loturile raman numai pentru comenzile existente, intre care si
// ciorne NU EXISTA cheie straina, deliberat (antetul migratiei 0008).

/** Cate id-uri intra intr-o singura cerere. Vezi antetul pentru masuratori. */
export const ID_LIST_BATCH_SIZE = 100;

/** Taie o lista in loturi de cel mult `size`. O lista goala da zero loturi. */
export function inBatches<T>(items: readonly T[], size: number = ID_LIST_BATCH_SIZE): T[][] {
  if (size < 1) throw new Error(`marimea lotului trebuie sa fie cel putin 1, a fost ${size}`);
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

/** Un lot in forma lui supabase-js: randurile sau eroarea. */
export type BatchResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

/**
 * P3-205. Citeste randurile pentru o lista de id-uri, in loturi de ID_LIST_BATCH_SIZE,
 * si le uneste in ordinea loturilor.
 *
 * `fetchBatch(ids)` face o singura cerere cu `.in(coloana, ids)`. O eroare la ORICE lot
 * arunca, cu numele a ceea ce se citea: o lista scurta pentru ca un lot a picat este
 * exact tacerea pe care antetul de mai sus o interzice. O lista goala nu face nicio cerere.
 */
export async function readInBatches<T>(
  what: string,
  ids: readonly string[],
  fetchBatch: (batch: string[]) => PromiseLike<BatchResult<T>>,
): Promise<T[]> {
  const results = await Promise.all(inBatches(ids).map((batch) => fetchBatch(batch)));
  const rows: T[] = [];
  for (const result of results) {
    if (result.error) throw new Error(`Nu s-au putut citi ${what}: ${result.error.message}`);
    for (const row of result.data ?? []) rows.push(row);
  }
  return rows;
}

// P3-39. PAGINI DE RANDURI, CITITE PANA LA CAPAT SI NUMARATE.
//
// AL DOILEA PRAG AL ACELEIASI CITIRI, si el nu este in adresa, ci in raspuns.
// PostgREST taie orice lista la `max_rows` randuri si NU SPUNE: raspunsul taiat
// arata exact ca unul intreg. supabase/config.toml pune 1000 pe stiva locala;
// proiectul gazduit are setarea lui, care din acest repozitoriu nu se poate nici
// citi, nici schimba. De aceea nimic de mai jos nu depinde de valoarea ei.
//
// DE CE PAGINI SI NU O CITIRE CARE NU POATE TRECE DE LIMITA. Multimea ciornelor
// in asteptare nu are pe server o margine care sa nu fie ea insasi o taietura:
// creste cu documentele neverificate, iar a arata numai o parte din ea este
// chiar defectul. Singura forma intr-un singur raspuns ar fi o functie care
// intoarce totul ca un singur rand JSON, adica o migratie, si limita s-ar muta
// din numarul de randuri in marimea raspunsului.
//
// MARIMEA PAGINII NU ESTE UN PRAG, si asta o deosebeste de lotul de mai sus.
// Pagina urmatoare incepe dupa randurile care AU VENIT, nu dupa cele cerute,
// deci un server care taie sub marimea ceruta produce mai multe cereri, nu
// randuri pierdute. Numarul decide numai cate cereri pleaca.
//
// TACEREA SE INCHIDE PRIN NUMARARE. Fiecare pagina cere si totalul, in aceeasi
// cerere. Randurile adunate trebuie sa fie exact acel total; o pagina goala
// inainte de el, un total lipsa sau un total care se schimba intre pagini sunt
// un ESEC VIZIBIL, nu o lista mai scurta.

/** Cate randuri se cer intr-o pagina. Vezi antetul P3-39: corectitudinea nu
 *  depinde de el, deci nu este un prag de intalnit. */
export const ROW_PAGE_SIZE = 500;

/** O pagina in forma lui supabase-js, cu totalul cerut in aceeasi cerere. */
export type CountedPage<T> = {
  data: T[] | null;
  count: number | null;
  error: { message: string } | null;
};

/**
 * Citeste pagina dupa pagina pana cand randurile adunate sunt cat totalul.
 *
 * `fetchPage(from, to)` cere randurile de la `from` la `to` inclusiv, cu totalul
 * in aceeasi cerere, adica `.select(..., { count: "exact" }).range(from, to)`.
 * Ordinea cererii trebuie sa fie stabila, altfel paginile nu se leaga. `what`
 * numeste in mesajul de eroare ce se citeste.
 */
export async function readAllPages<T>(
  what: string,
  fetchPage: (from: number, to: number) => PromiseLike<CountedPage<T>>,
  size: number = ROW_PAGE_SIZE,
): Promise<T[]> {
  if (size < 1) throw new Error(`marimea paginii trebuie sa fie cel putin 1, a fost ${size}`);
  // P3-193. Un coleg care adauga sau scoate un rand intre doua pagini schimba totalul.
  // Citirea se reia de la prima pagina, de cel mult READ_ATTEMPTS ori; numai dupa
  // ultima incercare lista schimbata devine o eroare, in cuvinte pe care le citeste
  // operatorul. Niciodata o lista scurta sau cu dubluri, tacut.
  for (let attempt = 1; ; attempt++) {
    try {
      return await readPagesOnce(what, fetchPage, size);
    } catch (err) {
      if (!(err instanceof ListChangedError)) throw err;
      if (attempt >= READ_ATTEMPTS) throw new Error(LIST_CHANGED_MESSAGE);
    }
  }
}

/** Cate citiri complete se incearca cand totalul se schimba intre pagini. */
export const READ_ATTEMPTS = 3;

/** Mesajul vazut de operator cand lista se schimba la fiecare incercare. */
export const LIST_CHANGED_MESSAGE = "Lista s-a schimbat în timpul citirii. Încercați din nou.";

class ListChangedError extends Error {}

async function readPagesOnce<T>(
  what: string,
  fetchPage: (from: number, to: number) => PromiseLike<CountedPage<T>>,
  size: number,
): Promise<T[]> {
  const rows: T[] = [];
  let total: number | null = null;

  for (;;) {
    const page = await fetchPage(rows.length, rows.length + size - 1);
    if (page.error) {
      throw new Error(`Nu s-au putut citi ${what}: ${page.error.message}`);
    }
    if (page.count === null) {
      throw new Error(
        `${what}: raspunsul nu a adus numarul total, deci nu se poate spune daca lista este intreaga.`,
      );
    }
    if (total === null) {
      total = page.count;
    } else if (page.count !== total) {
      throw new ListChangedError(
        `${what}: totalul s-a schimbat intre pagini, din ${total} in ${page.count}, deci paginile nu descriu aceeasi lista.`,
      );
    }

    const got = page.data ?? [];
    for (const row of got) rows.push(row);
    if (rows.length >= total) break;
    if (got.length === 0) {
      throw new Error(
        `${what}: au venit ${rows.length} din ${total} randuri, apoi o pagina goala. Lista nu se arata taiata.`,
      );
    }
  }

  if (rows.length !== total) {
    throw new Error(`${what}: au venit ${rows.length} randuri, mai multe decat totalul de ${total}.`);
  }
  return rows;
}

/**
 * P3-178. Pastreaza prima aparitie a fiecarui id, in ordinea citirii.
 *
 * DE CE ESTE NEVOIE, CU O ORDINE STABILA. Paginile se cer dupa pozitie
 * (`.range`), iar id-urile sunt uuid aleatoare. Daca un coleg salveaza un rand nou
 * intre doua pagini si randul lui cade inaintea pozitiei la care s-a ajuns, ultimul
 * rand al paginii trecute revine la inceputul paginii urmatoare. Un total schimbat
 * face din asta o eroare vizibila (readAllPages, mai sus), dar un rand adaugat si
 * unul sters in aceeasi fereastra lasa totalul neschimbat. Dublura se scoate aici;
 * un rand sarit in acel caz nu se poate recupera dintr-o citire pe pozitii.
 */
export function dedupeById<T extends { id: string }>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}
