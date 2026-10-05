"use client";

// P3-142. Comenzile de pagina de sub o lista lunga: "Pagina 2 din 7", "Înapoi", "Înainte" si
// "Afișate 51-100 din 340". Numarul paginii traieste in adresa (?pagina=2), deci reincarcarea
// si butonul inapoi al browserului pastreaza pagina; ecranul doar spune ce pagina vrea.
//
// NU APARE sub o singura pagina: o lista scurta arata ca inainte, fara nimic in plus.

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/primitives";
import { LIST_PAGE_SIZE, pageCount, pageLabel, rangeLabel } from "@/lib/data/list-paging";

/**
 * Schimba parametrii listei din adresa. Orice schimbare de filtru intoarce lista la pagina 1
 * (se sterge `pagina`); numai o schimbare de pagina o pastreaza. Un filtru nou inlocuieste
 * intrarea din istoric (replace), o pagina noua se adauga (push), ca "inapoi" sa o poata
 * parasi.
 */
export function useListUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const go = React.useCallback(
    (patch: Record<string, string | null>, mode: "replace" | "push") => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      const href = query ? `${pathname}?${query}` : pathname;
      if (mode === "push") router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    [params, pathname, router],
  );

  /** Un filtru s-a schimbat: noua valoare, inapoi la pagina 1. */
  const setFilter = React.useCallback(
    (patch: Record<string, string | null>) => go({ ...patch, pagina: null }, "replace"),
    [go],
  );
  /** O alta pagina a aceleiasi liste. Pagina 1 nu se scrie in adresa. */
  const setPage = React.useCallback(
    (page: number) => go({ pagina: page > 1 ? String(page) : null }, "push"),
    [go],
  );

  return { params, setFilter, setPage };
}

export function Pager({
  page,
  total,
  size = LIST_PAGE_SIZE,
  onPage,
}: {
  page: number;
  total: number;
  size?: number;
  onPage: (page: number) => void;
}) {
  const pages = pageCount(total, size);
  if (pages <= 1) return null;

  return (
    <div
      className="flex items-center justify-between gap-3 px-5 py-3 border-t border-rc-line max-md:flex-col max-md:items-stretch"
      data-testid="list-pager"
    >
      <div className="text-[12.5px] text-rc-muted">
        <span data-testid="pager-label" className="font-semibold text-rc-black">
          {pageLabel(page, total, size)}
        </span>
        <span className="mx-2">·</span>
        <span data-testid="pager-range">{rangeLabel(page, total, size)}</span>
      </div>
      <div className="flex items-center gap-2 max-md:justify-between">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          data-testid="pager-prev"
        >
          Înapoi
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          data-testid="pager-next"
        >
          Înainte
        </Button>
      </div>
    </div>
  );
}
