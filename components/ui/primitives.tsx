import * as React from "react";

// Primitivele comune ale sistemului de design RC-01.
// Suprafata este alba, fundalul este negru, accentul este portocaliu.

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------- suprafata -- */

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cx(
        "bg-rc-white text-rc-black rounded-[14px] border border-rc-line shadow-[0_1px_2px_rgba(0,0,0,.28)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  hint,
  right,
}: {
  title: string;
  hint?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-rc-line">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {hint ? <p className="text-[12.5px] text-rc-muted mt-0.5">{hint}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- butoane -- */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold transition-colors disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap";
  const sizes = {
    sm: "text-[13px] px-3 py-1.5",
    md: "text-[14px] px-4 py-2.5",
  };
  const variants = {
    primary: "bg-rc-orange text-white hover:bg-rc-orange-dark",
    secondary:
      "bg-rc-white text-rc-black border border-rc-line-strong hover:bg-rc-paper",
    ghost: "text-rc-black hover:bg-rc-paper",
    danger: "bg-rc-danger text-white hover:brightness-110",
  };
  return <button className={cx(base, sizes[size], variants[variant], className)} {...rest} />;
}

/* ------------------------------------------------------------------ chip -- */

export type ChipTone = "neutral" | "ok" | "warn" | "danger" | "info" | "orange";

const CHIP_TONES: Record<ChipTone, string> = {
  neutral: "bg-rc-paper text-rc-muted border-rc-line-strong",
  ok: "bg-rc-ok-soft text-rc-ok border-rc-ok/25",
  warn: "bg-rc-warn-soft text-rc-warn border-rc-warn/25",
  danger: "bg-rc-danger-soft text-rc-danger border-rc-danger/25",
  info: "bg-rc-info-soft text-rc-info border-rc-info/25",
  orange: "bg-rc-orange-soft text-rc-orange-deep border-rc-orange/30",
};

export function Chip({
  tone = "neutral",
  children,
  className,
}: {
  tone?: ChipTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold leading-none whitespace-nowrap",
        CHIP_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- campuri -- */

export function Field({
  label,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="block text-[12.5px] font-semibold text-rc-black mb-1.5">
        {label}
        {required ? <span className="text-rc-orange"> *</span> : null}
        {!required && hint === undefined ? (
          <span className="ml-1.5 font-normal text-rc-muted-2">(opțional)</span>
        ) : null}
      </span>
      {children}
      {hint ? <span className="block text-[12px] text-rc-muted mt-1">{hint}</span> : null}
    </label>
  );
}

const CONTROL =
  "w-full rounded-[10px] border border-rc-line-strong bg-white px-3 py-2 text-[14px] text-rc-black placeholder:text-rc-muted-2 focus:border-rc-orange focus:ring-2 focus:ring-rc-orange/25 outline-none transition";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return <input className={cx(CONTROL, className)} {...rest} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, children, ...rest } = props;
  return (
    <select className={cx(CONTROL, "appearance-none pr-8", className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return <textarea className={cx(CONTROL, "min-h-[80px]", className)} {...rest} />;
}

/* ---------------------------------------------------------------- tabele -- */

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13.5px]">{children}</table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
  className,
  ...rest
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
} & React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...rest}
      className={cx(
        "sticky top-0 bg-rc-paper text-rc-muted font-semibold text-[11.5px] uppercase tracking-wide px-4 py-2.5 border-b border-rc-line",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

/* ATRIBUTELE NECUNOSCUTE AJUNG PE ELEMENT, ca la Button mai sus.
 *
 * Fara `...rest` un `data-testid` sau un `data-value-mdl` scris pe <Td> era
 * inghitit tacut: celula se randa cu textul corect si fara niciun atribut, deci
 * ecranul parea in regula si locatorul nu gasea nimic. TypeScript nu prinde
 * asta, pentru ca un nume de atribut JSX care contine o cratima nu este
 * verificat fata de tipul propurilor. */
export function Td({
  children,
  align = "left",
  className,
  ...rest
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
} & React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      {...rest}
      className={cx(
        "px-4 py-2.5 border-b border-rc-line align-middle",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </td>
  );
}

/* ------------------------------------------------------------ stari goale -- */

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-[14px] font-semibold text-rc-black">{title}</p>
      {hint ? <p className="text-[13px] text-rc-muted mt-1.5">{hint}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------- antet ecran -- */

export function PageHeader({
  title,
  lead,
  actions,
}: {
  title: string;
  lead?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-6 mb-6">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight text-white">{title}</h1>
        {lead ? <p className="text-[13.5px] text-rc-muted-2 mt-1.5 max-w-[68ch]">{lead}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2.5 shrink-0">{actions}</div> : null}
    </div>
  );
}
