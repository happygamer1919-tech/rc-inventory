import { Card } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/lib/nav";

// Bloc de cifra pentru tabloul de bord. Cifra este mare si citibila dintr-o
// privire, pentru ca acesta este primul ecran pe care il vede clientul.
export function StatCard({
  label,
  value,
  suffix,
  sub,
  icon,
  tone = "normal",
}: {
  label: string;
  value: string;
  /** Unitatea sau moneda, afisata mai mic langa cifra, ca sa nu rupa randul. */
  suffix?: string;
  sub: string;
  icon: IconName;
  tone?: "normal" | "alert";
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11.5px] font-semibold uppercase tracking-wide text-rc-muted">
          {label}
        </p>
        <span
          className={[
            "grid place-items-center w-8 h-8 rounded-[9px] shrink-0",
            tone === "alert" ? "bg-rc-danger-soft text-rc-danger" : "bg-rc-orange-soft text-rc-orange-deep",
          ].join(" ")}
        >
          <Icon name={icon} className="w-[17px] h-[17px]" />
        </span>
      </div>
      <p
        className={[
          "rc-num mt-3 text-[30px] font-bold leading-none tracking-tight whitespace-nowrap",
          tone === "alert" ? "text-rc-danger" : "text-rc-black",
        ].join(" ")}
      >
        {value}
        {suffix ? (
          <span className="ml-1.5 text-[15px] font-semibold text-rc-muted align-baseline">
            {suffix}
          </span>
        ) : null}
      </p>
      <p className="text-[12.5px] text-rc-muted mt-2">{sub}</p>
    </Card>
  );
}
