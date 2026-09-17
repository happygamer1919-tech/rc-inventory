"use client";

// P3-49. ALEGEREA UNUI FISIER, IN ROMANA, PESTE TOT.
//
// Campul nativ <input type="file"> isi scrie singur butonul si mesajul gol, in
// LIMBA BROWSERULUI: pe un calculator pus pe engleza scrie "Choose File" si
// "No file chosen". Textul acela nu este in pagina, deci nici nu poate fi
// tradus si nici nu poate fi gasit cautand in textul ecranului; singura cale
// este sa nu se mai vada campul nativ deloc.
//
// De aceea campul nativ ramane in pagina, ascuns cu display none, iar alaturi
// stau un buton romanesc si numele fisierului ales. Campul ramane cel de
// dinainte: aceleasi actiuni de incarcare, acelasi onChange, acelasi
// data-testid, deci setInputFiles din teste si incarcarile existente merg
// neschimbate.
//
// DE CE display none SI NU ASCUNDEREA DE UN PIXEL. Un camp micsorat la un pixel
// si decupat ramane un camp cu dreptunghi nenul, adica ramane VIZIBIL pentru
// Playwright, iar acceptarea cardului cere sa nu existe niciun camp de fisier
// vizibil. Masurat in Chromium: setInputFiles functioneaza pe un camp cu
// display none si evenimentul change se produce la fel.
//
// DE CE UN BUTON SI NU O ETICHETA. Un <label> nu are rolul de buton, deci un
// ecran citit de o persoana sau de un test dupa rol nu il gaseste. Butonul
// deschide fereastra de fisiere cu click() pe campul ascuns, si fiind buton
// adevarat se ajunge la el si cu tastatura.

import * as React from "react";
import { Button } from "@/components/ui/primitives";

export const FILE_CHOOSE_LABEL = "Alege fișierul";
export const FILE_EMPTY_LABEL = "Niciun fișier ales";

export function FilePicker({
  inputRef,
  accept,
  disabled,
  onChange,
  fileName,
  inputTestId,
  chooseTestId,
  nameTestId,
  id,
  className,
  buttonClassName,
  ariaLabel,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  accept?: string;
  disabled?: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /** Numele fisierului ales, tinut de formular; null inseamna niciunul. */
  fileName: string | null;
  inputTestId?: string;
  chooseTestId?: string;
  nameTestId?: string;
  id?: string;
  className?: string;
  buttonClassName?: string;
  ariaLabel?: string;
}) {
  return (
    // P3-65. Pe telefon (sub 768px) numele fisierului se rupe pe randuri in loc sa
    // fie taiat: un telefon nu are titlu la trecerea mouse-ului.
    <div
      className={["flex items-center gap-3 min-h-[38px] max-md:min-w-0 max-md:flex-wrap", className]
        .filter(Boolean)
        .join(" ")}
    >
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        className="hidden"
        onChange={onChange}
        data-testid={inputTestId}
        aria-label={ariaLabel ?? FILE_CHOOSE_LABEL}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        data-testid={chooseTestId}
        className={["py-2", buttonClassName].filter(Boolean).join(" ")}
      >
        {FILE_CHOOSE_LABEL}
      </Button>
      <span
        className="max-w-[260px] truncate text-[13px] text-rc-muted max-md:min-w-0 max-md:max-w-full max-md:whitespace-normal max-md:[overflow-wrap:anywhere]"
        data-testid={nameTestId}
      >
        {fileName ?? FILE_EMPTY_LABEL}
      </span>
    </div>
  );
}
