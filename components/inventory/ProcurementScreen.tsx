"use client";

// P3-18. Necesar de materiale.
//
// TREI COLOANE DE CANTITATE, SI ATAT: Necesar, In stoc, Deficit. Vocabularul
// este fixat de addendum si nu se traduce.
//
// DEFICITUL ESTE PODIT LA ZERO SI UN SURPLUS NU SE ARATA CA DEFICIT NEGATIV. Un
// produs cu stoc suficient are deficit zero, si randul spune asta cu o liniuta in
// loc de un numar care ar invita la scadere in cap.
//
// DEFALCAREA PE STARE ESTE PE RAND, NEPONDERATA. Cardul interzice ponderarea
// dupa probabilitate: un prospect si un contract semnat cantaresc la fel aici, si
// cititorul vede cat din necesar este doar un prospect si decide singur.
//
// PROIECTELE FARA DEVIZ ACCEPTAT SE NUMARA CU VOCE TARE. Un numar orientat spre
// viitor care omite in tacere santierele neestimate este un numar care produce o
// comanda prea mica. Doctrina densitatii: cel mult cinci in rezumat, restul in
// spatele unei legaturi.
//
// DOCTRINA DENSITATII PE TABEL: 25 de randuri si restul la cerere.

import * as React from "react";
import Link from "next/link";
import { Card, CardHeader, Chip, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { formatNumber, formatQty } from "@/lib/data/format";
import { PROJECT_STATUS_LABEL } from "@/lib/data/projects-types";
import type { ProjectStatus } from "@/lib/data/projects-types";
import type { UnitCode } from "@/lib/data/units";
import type { ProcurementNeed, ProcurementRow } from "@/lib/reporting/procurement";

const PAGE = 25;
const NEED_STATUSES: ProjectStatus[] = ["lead", "offer", "contract", "active"];

function qty(value: number, unit: UnitCode | null): string {
  return unit ? formatQty(value, unit) : formatNumber(value);
}

function NeedRow({ row }: { row: ProcurementRow }) {
  const key = row.sku;
  return (
    <tr data-testid={`need-row-${key}`} data-has-shortfall={row.shortfallQty > 0 ? "true" : "false"}>
      <Td>
        <div className="font-medium text-rc-black">{row.productName}</div>
        <div className="text-[12px] text-rc-muted">{key}</div>
        {/* PROIECTELE CARE CER RANDUL, ca un numar agregat sa poata fi explicat
            fara sa fie deschis altceva. */}
        <div className="mt-1 flex flex-wrap gap-1" data-testid={`need-projects-${key}`} data-count={row.projects.length}>
          {row.projects.map((p) => (
            <Link
              key={p.projectId}
              href={`/proiecte/${p.projectId}?fila=comparatie`}
              data-testid={`need-project-${key}-${p.projectId}`}
              className="text-[12px] text-rc-muted hover:text-rc-black underline decoration-dotted"
            >
              {p.projectName} ({PROJECT_STATUS_LABEL[p.status]})
            </Link>
          ))}
        </div>
      </Td>

      <Td align="right">
        <span data-testid={`need-necesar-${key}`} data-qty={row.requiredQty}>
          {qty(row.requiredQty, row.unit)}
        </span>
      </Td>
      <Td align="right">
        <span data-testid={`need-stoc-${key}`} data-qty={row.stockQty}>
          {qty(row.stockQty, row.unit)}
        </span>
      </Td>
      <Td align="right">
        <span
          data-testid={`need-deficit-${key}`}
          data-qty={row.shortfallQty}
          className={row.shortfallQty > 0 ? "text-rc-danger font-semibold" : "text-rc-muted"}
        >
          {/* UN SURPLUS NU ESTE UN DEFICIT NEGATIV. */}
          {row.shortfallQty > 0 ? qty(row.shortfallQty, row.unit) : "-"}
        </span>
      </Td>

      {NEED_STATUSES.map((s) => (
        <Td key={s} align="right">
          <span
            data-testid={`need-stare-${key}-${s}`}
            data-qty={row.byStatus[s]}
            className={row.byStatus[s] > 0 ? "text-rc-black" : "text-rc-muted"}
          >
            {row.byStatus[s] > 0 ? qty(row.byStatus[s], row.unit) : "-"}
          </span>
        </Td>
      ))}
    </tr>
  );
}

export function ProcurementScreen({ need }: { need: ProcurementNeed }) {
  const [shown, setShown] = React.useState(PAGE);
  const { rows, includedProjects, excluded } = need;
  const visible = rows.slice(0, shown);

  return (
    <>
      <PageHeader
        title="Necesar de materiale"
        lead="Ce mai trebuie cumpărat pentru șantierele cu deviz acceptat, după ce s-a scăzut ce a plecat deja."
      />

      {/* PROIECTELE NEREPREZENTATE, INTOTDEAUNA, INCLUSIV ZERO. */}
      <div className="mb-4">
        <Card>
          <div
            className="px-5 py-3 text-[13px] text-rc-black"
            data-testid="need-excluse"
            data-count={excluded.length}
            data-included={includedProjects}
            /* FIECARE PROIECT EXCLUS ESTE RAPORTAT, chiar daca doar cinci se
               afiseaza. Doctrina densitatii limiteaza ce se ARATA, nu ce se
               spune: un raport care numara 40 si nu poate spune care sunt ele
               este un raport pe care nu il poti verifica. */
            data-ids={excluded.map((p) => p.id).join(",")}
          >
            {excluded.length === 0 ? (
              <>
                Toate cele {formatNumber(includedProjects)} șantiere vii au deviz acceptat și sunt
                cuprinse în cifrele de mai jos.
              </>
            ) : (
              <>
                <span className="font-semibold">
                  {formatNumber(excluded.length)}{" "}
                  {excluded.length === 1 ? "proiect fără deviz acceptat" : "proiecte fără deviz acceptat"}
                </span>{" "}
                nu sunt cuprinse în cifrele de mai jos, iar {formatNumber(includedProjects)} sunt.
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {/* Cel mult cinci in rezumat, restul in spatele legaturii. */}
                  {excluded.slice(0, 5).map((p) => (
                    <Link
                      key={p.id}
                      href={`/proiecte/${p.id}?fila=deviz`}
                      data-testid={`need-exclus-${p.id}`}
                      className="text-[12.5px] text-rc-muted hover:text-rc-black underline decoration-dotted"
                    >
                      {p.name} ({PROJECT_STATUS_LABEL[p.status]}): {p.reason}
                    </Link>
                  ))}
                </div>
                <Link
                  href="/proiecte"
                  data-testid="need-excluse-link"
                  className="mt-2 inline-block text-[12.5px] font-semibold text-rc-orange-deep hover:underline"
                >
                  Vezi toate șantierele
                </Link>
              </>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Necesar pe produs"
          hint="Cantitatea din devizul acceptat, minus ce s-a emis deja, față de stocul curent"
        />

        {rows.length === 0 ? (
          <EmptyState
            title="Niciun necesar de acoperit"
            hint="Nu există șantiere cu deviz acceptat care să mai aștepte material."
          />
        ) : (
          <div className="px-5 py-4">
            <Table>
              <thead>
                <tr>
                  <Th>Produs</Th>
                  <Th align="right">Necesar</Th>
                  <Th align="right">În stoc</Th>
                  <Th align="right">Deficit</Th>
                  {NEED_STATUSES.map((s) => (
                    <Th key={s} align="right">
                      {PROJECT_STATUS_LABEL[s]}
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody data-testid="need-rows" data-count={rows.length}>
                {visible.map((r) => (
                  <NeedRow key={r.productId} row={r} />
                ))}
              </tbody>
            </Table>

            {rows.length > shown ? (
              <button
                type="button"
                data-testid="need-more"
                onClick={() => setShown((n) => n + PAGE)}
                className="mt-3 text-[12.5px] font-semibold text-rc-orange-deep hover:underline"
              >
                Arată încă {Math.min(PAGE, rows.length - shown)} din {rows.length - shown} rămase
              </button>
            ) : null}

            <div className="mt-3 flex items-center gap-2 flex-wrap text-[12.5px] text-rc-muted">
              <Chip tone="neutral">Neponderat</Chip>
              <span>
                Un prospect și un contract semnat cântăresc la fel. Coloanele pe stare arată cât din
                necesar vine din fiecare, ca decizia să rămână a cititorului.
              </span>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
