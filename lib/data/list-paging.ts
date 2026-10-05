// P3-142. LISTELE LUNGI SE CITESC SI SE ARATA PE PAGINI, o pagina de randuri o data.
//
// FISIER FARA "server-only" SI FARA createClient, ca si stock-read.ts: ecranele de
// client iau de aici cifrele si textele paginii, iar un test ii da un client fals ca
// sa dovedeasca, fara baza de date, ca o pagina costa o singura cerere.
//
// P3-136 a citit pagina dupa pagina PANA LA CAPAT si a aratat tot (readAllPages, in
// id-list.ts): asta ocoleste limita de 1000 de randuri a serverului, dar nu scurteaza
// nicio lista pe ecran. Aici se cere O SINGURA pagina, cu totalul in aceeasi cerere.

import type { CountedPage } from "./id-list";

/** Cate randuri are o pagina pe ecran. Un singur numar, intr-un singur loc. */
export const LIST_PAGE_SIZE = 50;

/** Numarul paginii din adresa (`?pagina=2`). Orice altceva decat un intreg >= 1 este pagina 1. */
export function parsePage(raw: string | undefined | null): number {
  if (!raw || !/^[0-9]{1,6}$/.test(raw)) return 1;
  const n = Number(raw);
  return n >= 1 ? n : 1;
}

/** Cate pagini are o lista de `total` randuri. O lista goala are tot o pagina, goala. */
export function pageCount(total: number, size: number = LIST_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

/** Pagina adusa in intervalul 1..ultima. */
export function clampPage(page: number, total: number, size: number = LIST_PAGE_SIZE): number {
  return Math.min(Math.max(1, page), pageCount(total, size));
}

/** Intervalul `.range(from, to)` al unei pagini, ambele capete incluse. */
export function pageRange(page: number, size: number = LIST_PAGE_SIZE): { from: number; to: number } {
  return { from: (page - 1) * size, to: page * size - 1 };
}

/** "Pagina 2 din 7". */
export function pageLabel(page: number, total: number, size: number = LIST_PAGE_SIZE): string {
  return `Pagina ${page} din ${pageCount(total, size)}`;
}

/** "Afișate 51-100 din 340", cu cratima simpla. Lista goala nu are interval de aratat. */
export function rangeLabel(page: number, total: number, size: number = LIST_PAGE_SIZE): string {
  if (total === 0) return "Afișate 0 din 0";
  const first = (page - 1) * size + 1;
  const last = Math.min(page * size, total);
  return `Afișate ${first}-${last} din ${total}`;
}

type PageResult<T> = Omit<CountedPage<T>, "error"> & {
  error: { message: string; code?: string } | null;
};

/** PostgREST raspunde 416 / PGRST103 cand `from` este dincolo de ultimul rand. */
function isOutOfRange(error: { code?: string } | null): boolean {
  return error?.code === "PGRST103";
}

export type PageRead<T> = {
  rows: T[];
  /** Totalul listei cu filtrele date, nu al paginii. */
  total: number;
  /** Pagina adusa de fapt: cea ceruta, sau ultima, daca cea ceruta este dincolo de capat. */
  page: number;
};

/**
 * Citeste O pagina, cu totalul in aceeasi cerere.
 *
 * `fetchPage(from, to)` este `.select(..., { count: "exact" }).order(...).range(from, to)`,
 * cu o ordine stabila (cu id ca departajare), ca paginile sa se lege.
 *
 * O pagina ceruta dincolo de capat (adresa veche, sau un filtru care a ingustat lista)
 * nu este o eroare pentru operator: se aduce ultima pagina. Tacerea se inchide prin
 * numarare, ca la readAllPages: un raspuns fara total este un esec vizibil.
 */
export async function readPage<T>(
  what: string,
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  page: number,
  size: number = LIST_PAGE_SIZE,
): Promise<PageRead<T>> {
  if (size < 1) throw new Error(`marimea paginii trebuie sa fie cel putin 1, a fost ${size}`);

  const ask = async (p: number) => {
    const { from, to } = pageRange(p, size);
    return fetchPage(from, to);
  };
  const check = (result: PageResult<T>): number => {
    if (result.error) throw new Error(`Nu s-au putut citi ${what}: ${result.error.message}`);
    if (result.count === null) {
      throw new Error(
        `${what}: raspunsul nu a adus numarul total, deci nu se poate spune cate pagini are lista.`,
      );
    }
    return result.count;
  };

  let current = Math.max(1, page);
  let result = await ask(current);

  if (isOutOfRange(result.error)) {
    // Dincolo de capat. O cerere de o singura linie aduce totalul, apoi se cere ultima pagina.
    const probe = await fetchPage(0, 0);
    current = clampPage(current, check(probe), size);
    result = await ask(current);
  }

  let total = check(result);
  let data = result.data ?? [];
  if (data.length === 0 && total > 0 && current > 1) {
    current = clampPage(current, total, size);
    result = await ask(current);
    total = check(result);
    data = result.data ?? [];
  }
  return { rows: data, total, page: current };
}
