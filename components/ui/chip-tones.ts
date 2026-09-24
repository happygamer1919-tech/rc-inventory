// Clasele cipului, singure intr-un modul fara React.
//
// P3-98, constatarea F17. Pana la cardul acesta lista statea in primitives.tsx,
// iar spec-ul de contrast masura numai butonul principal: niciun cip nu era
// masurat, si asa a putut trece neobservata constatarea F13 (portocaliu 2.92:1,
// chihlimbar 3.44:1, amandoua sub pragul WCAG AA de 4.5:1).
//
// DE CE UN FISIER PROPRIU. tests/e2e/button-contrast.spec.ts randeaza cate un cip
// din fiecare ton in pagina adevarata si masoara ce a calculat browserul. Ca sa
// faca asta fara sa RESCRIE clasele in test, unde ar putea ramane in urma tacut,
// le importa de aici. Un modul de date simple se importa dintr-un test; un
// component .tsx cu React nu, si nici nu ar trebui.
//
// Chip din components/ui/primitives.tsx este singurul care le foloseste in
// aplicatie, si le pune in exact aceasta ordine: CHIP_BASE, apoi tonul.

export type ChipTone = "neutral" | "ok" | "warn" | "danger" | "info" | "orange";

/** Ordinea in care sunt scrise tonurile, pentru orice lista care le parcurge. */
export const CHIP_TONE_NAMES: readonly ChipTone[] = [
  "neutral",
  "ok",
  "warn",
  "danger",
  "info",
  "orange",
];

/** Forma cipului, aceeasi la toate tonurile. Textul este de 12px si gros, ceea
 *  ce NU este "text mare" dupa WCAG (acela incepe la 18.66px gros), deci pragul
 *  care se aplica este 4.5:1, nu 3:1. */
export const CHIP_BASE =
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold leading-none whitespace-nowrap";

export const CHIP_TONES: Record<ChipTone, string> = {
  neutral: "bg-rc-paper text-rc-muted border-rc-line-strong",
  ok: "bg-rc-ok-soft text-rc-ok border-rc-ok/25",
  // P3-98, constatarea F13. Numai TEXTUL celor doua tonuri de mai jos s-a mutat,
  // pe token-urile lui din app/globals.css: portocaliu de la 2.92:1 la 4.87:1 si
  // chihlimbar de la 3.44:1 la 4.98:1, pe aceleasi fundaluri palide. Fundalurile
  // si conturile sunt neatinse, ca si celelalte patru tonuri, care treceau deja.
  warn: "bg-rc-warn-soft text-rc-warn-chip border-rc-warn/25",
  danger: "bg-rc-danger-soft text-rc-danger border-rc-danger/25",
  info: "bg-rc-info-soft text-rc-info border-rc-info/25",
  orange: "bg-rc-orange-soft text-rc-orange-chip border-rc-orange/30",
};
