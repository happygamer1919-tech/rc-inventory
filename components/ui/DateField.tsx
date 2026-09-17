"use client";

// P3-49. O DATA SE SCRIE ZIUA, LUNA, ANUL, PE ORICE CALCULATOR.
//
// Campul nativ <input type="date"> aseaza ziua si luna dupa LIMBA BROWSERULUI,
// nu dupa locale-ul paginii si nici dupa lang="ro". Masurat in Chromium cu
// locale ro-RO: tastele 01122027 pastreaza 2027-01-12 cand browserul este pe
// engleza si 2027-12-01 cand este lansat cu --lang=ro-RO. Un operator cu
// browserul pe engleza salveaza deci alta zi decat cea la care se gandeste,
// fara sa vada nimic. Cardul P3-41 a facut vizibila divergenta scriind data in
// cuvinte sub camp; acesta o scoate din radacina.
//
// CE SE SCHIMBA SI CE NU. Se schimba numai ce se vede: un camp de text cu
// indicatia zz.ll.aaaa, care primeste ziua, luna si anul cu sau fara puncte.
// Catre formular el da exact acelasi sir yyyy-mm-dd pe care il dadea campul
// nativ, deci nicio actiune de server si nicio valoare stocata nu se schimba.
//
// CALENDARUL RAMANE. Campul nativ ramane in pagina, ascuns cu display none, si
// butonul de langa camp deschide calendarul browserului prin showPicker().
// Masurat in Chromium: showPicker() functioneaza si pe un camp cu display none.
//
// DE CE display none SI NU ASCUNDEREA DE UN PIXEL. Un camp micsorat la un pixel
// si decupat ramane un camp cu dreptunghi nenul, adica ramane VIZIBIL pentru
// Playwright, iar acceptarea cardului cere sa nu existe niciun camp de data
// vizibil.
//
// SE PRIMESTE SI FORMA yyyy-mm-dd. Un sir scris deja in forma stocata este
// recunoscut si asezat romaneste. Operatorul nu scrie asa, dar o valoare lipita
// din alta parte, sau scrisa de un test care umple campul dintr-o data, nu are
// de ce sa fie refuzata: intelesul ei este neindoielnic.

import * as React from "react";

export const DATE_PLACEHOLDER = "zz.ll.aaaa";
export const DATE_INVALID_MESSAGE =
  "Data nu este validă. Scrie ziua, luna și anul, de exemplu 01.12.2026.";

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRealDate(year: number, month: number, day: number): boolean {
  if (year < 1000 || year > 9999) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
  );
}

/** yyyy-mm-dd catre zz.ll.aaaa. Un sir gol sau nerecunoscut da un sir gol. */
export function romanianFromIso(iso: string): string {
  const m = ISO.exec(iso.trim());
  if (!m) return "";
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/**
 * zz.ll.aaaa catre yyyy-mm-dd. Un sir gol da un sir gol; o data imposibila sau
 * inca neterminata da null, ca cel care cheama sa poata spune care este care.
 */
export function isoFromRomanian(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === "") return "";
  const iso = ISO.exec(trimmed);
  if (iso) {
    return isRealDate(Number(iso[1]), Number(iso[2]), Number(iso[3])) ? trimmed : null;
  }
  // Orice altceva decat cifre si despartitoare nu este o data scrisa gresit,
  // este altceva.
  if (/[^\d.\s/-]/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4));
  if (!isRealDate(year, month, day)) return null;
  return `${digits.slice(4)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
}

/**
 * Punctele se pun singure pe masura ce se tasteaza. La stergere NU se pun la
 * loc, altfel tasta de stergere nu ar mai avea niciun efect asupra punctului.
 */
function formatAsTyped(raw: string, previous: string): string {
  const trimmed = raw.trim();
  if (ISO.test(trimmed)) return romanianFromIso(trimmed);
  const cleaned = raw.replace(/[^\d.]/g, "");
  if (cleaned.length < previous.length) return cleaned;
  const digits = cleaned.replace(/\D/g, "").slice(0, 8);
  if (digits.length > 4) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
  }
  if (digits.length > 2) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return digits;
}

// P3-65. Pe telefon (sub 768px) campul are 44px si text de 16px, ca primitivele,
// iar butonul calendarului este o tinta de 44px. Peste 768px nimic nu se schimba.
const CONTROL =
  "w-full rounded-[10px] border border-rc-line-strong bg-white px-3 py-2 pr-11 text-[14px] text-rc-black placeholder:text-rc-muted-2 focus:border-rc-orange focus:ring-2 focus:ring-rc-orange/25 outline-none transition max-md:min-h-11 max-md:pr-12 max-md:text-base";

export function DateField({
  value,
  onChange,
  testId,
  disabled,
  className,
  id,
}: {
  /** Valoarea stocata, yyyy-mm-dd, sau sir gol. */
  value: string;
  /** Primeste tot yyyy-mm-dd, sau sir gol cat timp data nu este intreaga. */
  onChange: (value: string) => void;
  testId: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  const nativeRef = React.useRef<HTMLInputElement>(null);
  const [text, setText] = React.useState(() => romanianFromIso(value));
  const [touched, setTouched] = React.useState(false);

  // Cand valoarea vine din afara (formular incarcat, camp golit de parinte,
  // zi aleasa din calendar) scrisul din camp o urmeaza. Cand ea vine chiar din
  // scrisul de aici, nu se atinge, altfel o data pe jumatate tastata ar fi
  // stearsa la fiecare tasta.
  const seen = React.useRef(value);
  if (seen.current !== value) {
    seen.current = value;
    if ((isoFromRomanian(text) ?? "") !== value) setText(romanianFromIso(value));
  }

  function commit(next: string) {
    setText(next);
    const iso = isoFromRomanian(next);
    seen.current = iso ?? "";
    onChange(iso ?? "");
  }

  function openCalendar() {
    const native = nativeRef.current;
    if (!native) return;
    try {
      native.showPicker();
    } catch {
      // Un browser fara showPicker() deschide calendarul la clic pe camp.
      native.click();
    }
  }

  const parsed = isoFromRomanian(text);
  const digitCount = text.replace(/\D/g, "").length;
  const invalid = parsed === null && (touched || digitCount >= 8);

  return (
    <span className="block">
      <span className="relative block">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          id={id}
          value={text}
          placeholder={DATE_PLACEHOLDER}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          onChange={(e) => commit(formatAsTyped(e.target.value, text))}
          onBlur={() => setTouched(true)}
          data-testid={testId}
          className={[CONTROL, className].filter(Boolean).join(" ")}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={openCalendar}
          aria-label="Deschide calendarul"
          title="Deschide calendarul"
          data-testid={`${testId}-calendar`}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-rc-muted hover:bg-rc-paper hover:text-rc-black disabled:opacity-45 disabled:cursor-not-allowed max-md:right-0 max-md:h-11 max-md:w-11"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M8 3v4" />
            <path d="M16 3v4" />
            <path d="M3 10h18" />
          </svg>
        </button>
        <input
          ref={nativeRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          className="hidden"
          value={value}
          disabled={disabled}
          onChange={(e) => commit(romanianFromIso(e.target.value))}
          data-testid={`${testId}-native`}
        />
      </span>
      {invalid ? (
        <span
          role="alert"
          data-testid={`${testId}-error`}
          className="block text-[12px] text-rc-danger mt-1"
        >
          {DATE_INVALID_MESSAGE}
        </span>
      ) : null}
    </span>
  );
}
