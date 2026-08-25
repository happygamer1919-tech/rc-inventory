"use client";

// Lista derulanta cu cautare.
//
// Catalogul are zeci de pozitii, iar intr-o demonstratie scrisul bate derularea,
// deci fiecare alegere de produs, client sau proiect trece pe aici. Cautarea
// ignora diacriticele, pentru ca operatorul scrie "tigla", nu "țiglă".
//
// creatable=true permite si o valoare noua, tastata de la zero: clientii si
// proiectele nu sunt o lista inchisa, spre deosebire de catalogul de produse.

import * as React from "react";
import { createPortal } from "react-dom";
import { normalizeText } from "@/lib/mock";

export type ComboOption = {
  value: string;
  label: string;
  hint?: string;
};

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Caută...",
  creatable = false,
  emptyLabel = "Niciun rezultat",
}: {
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  creatable?: boolean;
  emptyLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const boxRef = React.useRef<HTMLDivElement>(null);
  // Lista se randeaza intr-un portal cu pozitie fixa, nu in fluxul normal.
  // Altfel o taie orice parinte cu overflow, iar tabelele au overflow-x-auto:
  // in interiorul lor lista se deschidea, dar se vedea doar o dunga din ea.
  const [rect, setRect] = React.useState<DOMRect | null>(null);

  const measure = React.useCallback(() => {
    if (boxRef.current) setRect(boxRef.current.getBoundingClientRect());
  }, []);

  React.useEffect(() => {
    if (!open) return;
    measure();
    // Repozitionare la derulare sau redimensionare, ca lista sa nu ramana in urma.
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, measure]);

  const selected = options.find((o) => o.value === value);
  // Cand e inchis afiseaza eticheta aleasa; cand e deschis, ce se tasteaza.
  const shown = open ? query : selected?.label ?? (creatable ? value : "");

  const filtered = React.useMemo(() => {
    const needle = normalizeText(query.trim());
    if (!needle) return options;
    return options.filter(
      (o) =>
        normalizeText(o.label).includes(needle) ||
        (o.hint ? normalizeText(o.hint).includes(needle) : false),
    );
  }, [options, query]);

  // Inchidere la clic in afara.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      const inBox = boxRef.current?.contains(t);
      // Lista traieste in document.body prin portal, deci un clic in ea nu este
      // "in afara" chiar daca nu se afla in interiorul containerului.
      const inList = (t as HTMLElement)?.closest?.("[data-rc-combo-list]");
      if (!inBox && !inList) commitAndClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  });

  function commitAndClose() {
    const typed = query.trim();
    if (typed) {
      // O potrivire EXACTA pe eticheta alege acea optiune.
      //
      // DEFECT REPARAT LA P2-05: varianta din faza 1 verifica exact aceasta
      // conditie si, cand era adevarata, NU facea nimic. Cu date demonstrative
      // fixe nu se vedea, pentru ca nimeni nu tasta un nume deja existent. Cu
      // date reale se vede imediat: operatorul scrie numele unui client pe care
      // l-a mai folosit, da clic in alta parte, iar campul se goleste singur si
      // formularul cere "Completează clientul". Un camp care se sterge singur
      // dupa ce a fost completat corect este cel mai rau fel de defect, pentru
      // ca operatorul crede ca a gresit el.
      const exact = options.find((o) => o.label === typed);
      if (exact) {
        onChange(exact.value);
      } else if (creatable) {
        // Text liber acceptat doar acolo unde lista nu este inchisa.
        onChange(typed);
      }
    }
    setOpen(false);
    setQuery("");
  }

  function pick(option: ComboOption) {
    onChange(option.value);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        value={shown}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setActive(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (open && filtered[active]) pick(filtered[active]);
            else commitAndClose();
          } else if (e.key === "Escape") {
            setOpen(false);
            setQuery("");
          }
        }}
        className="w-full rounded-[10px] border border-rc-line-strong bg-white px-3 py-2 text-[14px] text-rc-black placeholder:text-rc-muted-2 focus:border-rc-orange focus:ring-2 focus:ring-rc-orange/25 outline-none transition"
      />

      {open && rect
        ? createPortal(
            <ul
              style={{
                position: "fixed",
                top: rect.bottom + 4,
                left: rect.left,
                width: rect.width,
              }}
              data-rc-combo-list
              className="z-50 max-h-[260px] overflow-y-auto rounded-[10px] border border-rc-line-strong bg-white text-rc-black shadow-2xl py-1"
            >
          {filtered.map((o, i) => (
            <li key={o.value}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
                onMouseEnter={() => setActive(i)}
                className={[
                  "w-full text-left px-3 py-2 transition-colors",
                  i === active ? "bg-rc-orange-soft" : "hover:bg-rc-paper",
                ].join(" ")}
              >
                <span className="block text-[13.5px] font-medium leading-snug">{o.label}</span>
                {o.hint ? (
                  <span className="block text-[11.5px] text-rc-muted mt-0.5">{o.hint}</span>
                ) : null}
              </button>
            </li>
          ))}
              {filtered.length === 0 ? (
                <li className="px-3 py-3 text-[12.5px] text-rc-muted">
                  {creatable && query.trim()
                    ? `Se folosește denumirea nouă: "${query.trim()}"`
                    : emptyLabel}
                </li>
              ) : null}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
