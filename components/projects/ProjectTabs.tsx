"use client";

// Filele de pe fisa proiectului. Cardul P3-09 le-a adus pe primele patru, iar
// P3-11 adauga Cost.
//
// BANDA ESTE AUTORATA COMPLETA, la fel ca la client: Consum, Deviz, Documente,
// Istoric. P3-13b a umplut Deviz. Documente randeaza in continuare o stare goala
// romaneasca pana cand cardul ei o umple.
//
// FILA ACTIVA ESTE UN PARAMETRU DE URL, acelasi motiv si acelasi nume de
// parametru ca pe fisa clientului: doua ecrane care fac acelasi lucru cu URL-ul
// nu au voie sa foloseasca doua chei diferite.

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Card, CardHeader, Chip, EmptyState, Table, Td, Th } from "@/components/ui/primitives";
import { formatDate, formatMoney, formatNumber, formatQty } from "@/lib/data/format";
import { OUTBOUND_STATUS_LABEL, type OutboundStatus } from "@/lib/data/outbound-types";
import { PROJECT_STATUS_LABEL } from "@/lib/data/projects-types";
import type { ProjectMaterials } from "@/lib/data/projects-list";
import type { StatusEvent } from "@/lib/data/projects-list-types";
import type { UnitCode } from "@/lib/data/units";
import type { ProjectMaterialCost } from "@/lib/reporting/material-cost";
import type { CatalogProduct } from "@/lib/data/products";
import type { Deviz, DevizSummary } from "@/lib/data/deviz";
import { DevizPanel } from "./DevizPanel";

const TABS = [
  { id: "consum", label: "Consum" },
  { id: "cost", label: "Cost" },
  { id: "deviz", label: "Deviz" },
  { id: "documente", label: "Documente" },
  { id: "istoric", label: "Istoric" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function isTab(v: string): v is TabId {
  return TABS.some((t) => t.id === v);
}

function statusLabel(token: string): string {
  return (PROJECT_STATUS_LABEL as Record<string, string>)[token] ?? token;
}

function qtyLabel(quantity: number, unit: string | null): string {
  return unit ? formatQty(quantity, unit as UnitCode) : formatNumber(quantity);
}

export function ProjectTabs({
  projectId,
  materials,
  cost,
  history,
  deviz,
  products,
  canWrite,
}: {
  projectId: string;
  materials: ProjectMaterials;
  cost: ProjectMaterialCost;
  history: StatusEvent[];
  deviz: { list: DevizSummary[]; open: Deviz | null };
  products: CatalogProduct[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const raw = params.get("fila") ?? "";
  const active: TabId = isTab(raw) ? raw : "consum";

  function goTo(tab: TabId) {
    const next = new URLSearchParams(params.toString());
    next.set("fila", tab);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <>
      <div className="flex gap-1 border-b border-rc-line mb-4" data-testid="project-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => goTo(t.id)}
            data-testid={`tab-${t.id}`}
            data-active={active === t.id ? "true" : "false"}
            className={
              active === t.id
                ? "px-4 py-2.5 text-[13.5px] font-semibold text-rc-black border-b-2 border-rc-orange -mb-px"
                : "px-4 py-2.5 text-[13.5px] text-rc-muted hover:text-rc-black"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <div data-testid={`panel-${active}`}>
        {active === "consum" ? (
          <Card>
            <CardHeader
              title="Consum"
              hint="Ultimele ieșiri către acest șantier, cele mai noi primele"
            />
            {materials.rows.length === 0 ? (
              <EmptyState
                title="Niciun consum înregistrat"
                hint="Materialul eliberat către acest șantier apare aici."
              />
            ) : (
              <>
                <Table>
                  <thead>
                    <tr>
                      <Th>Bon</Th>
                      <Th>Data</Th>
                      <Th>Stare</Th>
                      <Th align="right">Poziții</Th>
                      <Th align="right">Cantitate</Th>
                      <Th align="right">Valoare</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {materials.rows.map((r) => (
                      <tr key={r.issueId ?? r.reference} data-testid="issue-row" data-reference={r.reference}>
                        <Td>
                          <span className="font-semibold text-rc-black">{r.reference}</span>
                        </Td>
                        <Td>{r.issuedAt ? formatDate(r.issuedAt) : "-"}</Td>
                        <Td>
                          <Chip tone={r.status === "shipped" ? "ok" : "neutral"}>
                            {r.status
                              ? OUTBOUND_STATUS_LABEL[r.status as OutboundStatus] ?? r.status
                              : "-"}
                          </Chip>
                        </Td>
                        <Td align="right">{r.lineCount}</Td>
                        <Td align="right">{formatNumber(r.quantity)}</Td>
                        <Td align="right">{formatMoney(r.valueMdl)}</Td>
                      </tr>
                    ))}
                    {materials.total ? (
                      <tr data-testid="issue-total" className="font-semibold">
                        <Td>Total, toate ieșirile</Td>
                        <Td></Td>
                        <Td></Td>
                        <Td align="right">{materials.total.lineCount}</Td>
                        <Td align="right">{formatNumber(materials.total.quantity)}</Td>
                        <Td align="right">{formatMoney(materials.total.valueMdl)}</Td>
                      </tr>
                    ) : null}
                  </tbody>
                </Table>
                <div className="px-5 py-4 border-t border-rc-line">
                  {/* P3-10: catre lista completa FILTRATA la acest proiect,
                      folosind filtrul din URL pe care ecranul de comenzi il
                      cunoaste. Nu se inventeaza un mecanism nou de filtrare. */}
                  <Link
                    href={`/comenzi?proiect=${projectId}`}
                    className="text-[12.5px] text-rc-orange-deep hover:underline"
                    data-testid="issue-full-history"
                  >
                    Vezi toate ieșirile către acest șantier
                  </Link>
                </div>
              </>
            )}
          </Card>
        ) : null}

        {active === "cost" ? (
          <Card>
            <CardHeader
              title="Cost material"
              hint="Cantitatea eliberată înmulțită cu valoarea din catalog"
            />

            {/* FILTRUL TRAIESTE IN URL, pentru ca numarul se recalculeaza pe
                server. Implicit sunt toate iesirile: materialul a plecat din
                depozit cand a fost eliberat. */}
            <div className="px-5 pt-4 flex items-center gap-2" data-testid="cost-filter">
              <Link
                href={`${pathname}?fila=cost`}
                data-testid="cost-filter-toate"
                data-active={cost.shippedOnly ? "false" : "true"}
                className={
                  cost.shippedOnly
                    ? "px-3 py-1.5 text-[12.5px] text-rc-muted hover:text-rc-black"
                    : "px-3 py-1.5 text-[12.5px] font-semibold text-rc-black border-b-2 border-rc-orange"
                }
              >
                Toate ieșirile
              </Link>
              <Link
                href={`${pathname}?fila=cost&doar-expediate=1`}
                data-testid="cost-filter-expediate"
                data-active={cost.shippedOnly ? "true" : "false"}
                className={
                  cost.shippedOnly
                    ? "px-3 py-1.5 text-[12.5px] font-semibold text-rc-black border-b-2 border-rc-orange"
                    : "px-3 py-1.5 text-[12.5px] text-rc-muted hover:text-rc-black"
                }
              >
                Doar expediate
              </Link>
            </div>

            <div className="px-5 py-4">
              <div className="text-[12.5px] text-rc-muted">Total material consumat</div>
              <div
                className="text-[26px] font-semibold text-rc-black leading-tight"
                data-testid="cost-total"
                data-value-mdl={cost.totalValueMdl}
              >
                {formatMoney(cost.totalValueMdl)}
              </div>
              <div className="text-[12.5px] text-rc-muted" data-testid="cost-total-quantity">
                {formatNumber(cost.totalQuantity)} unități eliberate
              </div>
            </div>

            {/* IESIRILE FARA PROIECT SE SPUN INTOTDEAUNA, inclusiv zero. Un
                total partial care nu spune ca este partial este mai rau decat
                lipsa lui. */}
            <div
              className="px-5 pb-4 text-[12.5px] text-rc-muted"
              data-testid="cost-unassigned"
              data-count={cost.unassignedIssues}
            >
              {cost.unassignedIssues === 0
                ? "Toate ieșirile au un proiect asociat."
                : `${cost.unassignedIssues === 1 ? "O ieșire" : `${cost.unassignedIssues} ieșiri`} fără proiect asociat, exclusă din acest total.`}
            </div>

            {cost.byProduct.length === 0 ? (
              <EmptyState
                title="Niciun cost înregistrat"
                hint="Costul apare aici după prima ieșire de material către acest șantier."
              />
            ) : (
              <>
                <div className="px-5 pt-2 pb-1 text-[12.5px] font-semibold text-rc-black">
                  Pe produs
                </div>
                <Table>
                  <thead>
                    <tr>
                      <Th>Produs</Th>
                      <Th>Cod</Th>
                      <Th align="right">Cantitate</Th>
                      <Th align="right">Valoare</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {cost.byProduct.map((r) => (
                      <tr
                        key={r.productId ?? r.label}
                        data-testid="cost-product-row"
                        data-sku={r.sku ?? ""}
                        data-value-mdl={r.valueMdl}
                      >
                        <Td>
                          <span className="font-semibold text-rc-black">{r.label}</span>
                        </Td>
                        <Td>{r.sku ?? "-"}</Td>
                        <Td align="right">{qtyLabel(r.quantity, r.unit)}</Td>
                        <Td align="right">{formatMoney(r.valueMdl)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>

                <div className="px-5 pt-4 pb-1 text-[12.5px] font-semibold text-rc-black">
                  Pe lună
                </div>
                <Table>
                  <thead>
                    <tr>
                      <Th>Luna</Th>
                      <Th align="right">Cantitate</Th>
                      <Th align="right">Valoare</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {cost.byMonth.map((r) => (
                      <tr
                        key={r.monthStart ?? r.label}
                        data-testid="cost-month-row"
                        data-month={r.monthStart ?? ""}
                        data-value-mdl={r.valueMdl}
                      >
                        <Td>
                          <span className="font-semibold text-rc-black">{r.label}</span>
                        </Td>
                        <Td align="right">{formatNumber(r.quantity)}</Td>
                        <Td align="right">{formatMoney(r.valueMdl)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>

                <div className="px-5 py-4 border-t border-rc-line">
                  <Link
                    href={`/comenzi?proiect=${projectId}`}
                    className="text-[12.5px] text-rc-orange-deep hover:underline"
                    data-testid="cost-full-history"
                  >
                    Vezi toate ieșirile către acest șantier
                  </Link>
                </div>
              </>
            )}

            {/* LIMITAREA SE SCRIE PE ECRAN, nu se ascunde intr-un raport. */}
            <div
              className="px-5 pb-4 text-[12px] text-rc-muted border-t border-rc-line pt-3"
              data-testid="cost-footnote"
            >
              Valorile sunt calculate la prețul curent din catalog, nu la prețul de la momentul
              ieșirii.
            </div>
          </Card>
        ) : null}

        {active === "deviz" ? (
          <DevizPanel
            projectId={projectId}
            list={deviz.list}
            open={deviz.open}
            products={products}
            canWrite={canWrite}
          />
        ) : null}

        {active === "documente" ? (
          <Card>
            <CardHeader title="Documente" />
            <EmptyState
              title="Niciun document"
              hint="Contractele, actele și fotografiile de pe șantier ajung aici odată cu cardul care le aduce."
            />
          </Card>
        ) : null}

        {active === "istoric" ? (
          <Card>
            <CardHeader title="Istoric stări" hint="Cele mai noi primele" />
            {history.length === 0 ? (
              <EmptyState
                title="Nicio schimbare de stare"
                hint="Fiecare mutare pe conductă apare aici, cu momentul ei."
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Din</Th>
                    <Th>În</Th>
                    <Th>Notă</Th>
                    <Th>Când</Th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={`${h.createdAt}-${i}`} data-testid="history-row">
                      <Td>{h.fromStatus ? statusLabel(h.fromStatus) : "-"}</Td>
                      <Td>
                        <span className="font-semibold text-rc-black">
                          {statusLabel(h.toStatus)}
                        </span>
                      </Td>
                      <Td>{h.note ?? "-"}</Td>
                      <Td>{formatDate(h.createdAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        ) : null}
      </div>
    </>
  );
}
