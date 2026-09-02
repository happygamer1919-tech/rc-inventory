// P3-12. Cele trei numere ale unui proiect, pe fisa, neascunse.
//
// TREI, NU DOUA, si niciunul dupa un click. R-058 delta 12: bugetul, totalul
// devizului acceptat si costul real sunt trei intrebari diferite, iar oricare
// doua spun o poveste incompleta.
//
// UN GOL NU ESTE UN ZERO, SI ACEASTA ESTE REGULA CARE SE INCALCA CEL MAI USOR.
// Un proiect fara buget nu are buget zero, are un buget nedecis inca. Un proiect
// fara deviz acceptat nu a fost cotat la zero lei. Zero este un numar si o
// absenta nu este, deci fiecare absenta poarta un text romanesc si nu o cifra.
// Consumatul contra unui buget absent SAU zero este o liniuta, niciodata o
// impartire.
//
// COSTUL REAL ESTE INTOTDEAUNA UN NUMAR, si asta nu este o inconsecventa: zero
// iesiri chiar inseamna zero lei plecati din depozit, ceea ce este un fapt, nu o
// absenta.
//
// data-value-mdl PE FIECARE CIFRA. Ecranul rotunjeste la leu prin formatMoney,
// exact ca fila de deviz, dar acceptanta cere ca totalul de aici si cel de pe
// fila de deviz sa fie aceeasi valoare PANA LA BAN. Numarul brut calatoreste in
// atribut, unde un test il poate compara, si aceeasi conventie este deja
// folosita de DevizPanel.

import { Card, CardHeader } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/data/format";
import type { ProjectBudgetSummary } from "@/lib/reporting/project-budget";

/** O liniuta romaneasca. Nu un zero, nu un gol, nu "N/A". */
const DASH = "-";

function Figure({
  label,
  testid,
  valueMdl,
  empty,
  hint,
  tone = "normal",
}: {
  label: string;
  testid: string;
  valueMdl: number | null;
  /** Ce se scrie cand nu exista valoarea. Romaneste, si niciodata o cifra.
   *
   *  OPTIONAL FIINDCA O CIFRA NU ARE INTOTDEAUNA O ABSENTA. Costul real este
   *  mereu un numar: zero iesiri chiar inseamna zero lei plecati din depozit,
   *  ceea ce este un fapt si nu un gol. A-i da un text de gol ar fi cod pe care
   *  nimic nu il poate atinge. */
  empty?: string;
  hint?: string;
  tone?: "normal" | "over";
}) {
  const present = valueMdl !== null;
  return (
    <div className="flex-1 min-w-0 px-5 py-4" data-testid={testid} data-value-mdl={present ? valueMdl : ""}>
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-rc-muted">{label}</p>
      {present ? (
        <p
          className={[
            "rc-num mt-2 text-[24px] font-bold leading-none tracking-tight whitespace-nowrap",
            tone === "over" ? "text-rc-danger" : "text-rc-black",
          ].join(" ")}
        >
          {formatMoney(valueMdl as number)}
        </p>
      ) : (
        <p className="mt-2 text-[13.5px] text-rc-muted" data-testid={`${testid}-empty`}>
          {empty ?? DASH}
        </p>
      )}
      {hint ? <p className="mt-1.5 text-[12px] text-rc-muted">{hint}</p> : null}
    </div>
  );
}

export function ProjectBudgetPanel({ summary }: { summary: ProjectBudgetSummary }) {
  const {
    budgetMdl,
    acceptedDevizTotalMdl,
    acceptedDevizVersion,
    actualCostMdl,
    varianceMdl,
    consumedPercent,
  } = summary;

  // O abatere negativa inseamna peste buget. Se coloreaza, si se spune si in
  // cuvinte: culoarea singura nu este o informatie pentru cine nu o distinge.
  const overBudget = varianceMdl !== null && varianceMdl < 0;

  return (
    <Card>
      <CardHeader
        title="Buget, deviz și cost"
        hint="Abaterea și consumul sunt față de buget"
      />

      <div className="flex divide-x divide-rc-line" data-testid="project-budget-figures">
        <Figure
          label="Buget"
          testid="project-budget"
          valueMdl={budgetMdl}
          empty="Fără buget"
        />
        <Figure
          label="Total deviz acceptat"
          testid="project-deviz-total"
          valueMdl={acceptedDevizTotalMdl}
          empty="Fără deviz acceptat"
          hint={acceptedDevizVersion !== null ? `Versiunea ${acceptedDevizVersion}` : undefined}
        />
        {/* FARA TEXT DE GOL, si asta nu este o scapare. Costul real este
            intotdeauna un numar: zero iesiri inseamna zero lei plecati din
            depozit, care este un fapt. Bugetul si devizul pot lipsi; acesta nu
            poate. */}
        <Figure label="Cost real" testid="project-actual-cost" valueMdl={actualCostMdl} />
      </div>

      <div
        className="flex divide-x divide-rc-line border-t border-rc-line"
        data-testid="project-budget-derived"
      >
        <div className="flex-1 min-w-0 px-5 py-3.5" data-testid="project-variance" data-value-mdl={varianceMdl === null ? "" : varianceMdl}>
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-rc-muted">
            Abatere față de buget
          </p>
          {varianceMdl === null ? (
            <p className="mt-1.5 text-[13.5px] text-rc-muted" data-testid="project-variance-empty">
              Fără buget
            </p>
          ) : (
            <p
              className={[
                "rc-num mt-1.5 text-[17px] font-bold leading-none whitespace-nowrap",
                overBudget ? "text-rc-danger" : "text-rc-black",
              ].join(" ")}
            >
              {formatMoney(varianceMdl)}
              <span className="ml-2 text-[12.5px] font-semibold">
                {overBudget ? "peste buget" : "rămas"}
              </span>
            </p>
          )}
        </div>

        <div
          className="flex-1 min-w-0 px-5 py-3.5"
          data-testid="project-consumed"
          data-percent={consumedPercent === null ? "" : consumedPercent}
        >
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-rc-muted">
            Consumat din buget
          </p>
          {consumedPercent === null ? (
            <p className="mt-1.5 text-[17px] font-bold text-rc-muted" data-testid="project-consumed-dash">
              {DASH}
            </p>
          ) : (
            <p className="rc-num mt-1.5 text-[17px] font-bold leading-none text-rc-black whitespace-nowrap">
              {new Intl.NumberFormat("ro-MD", { maximumFractionDigits: 1 }).format(consumedPercent)}
              <span className="ml-1">%</span>
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
