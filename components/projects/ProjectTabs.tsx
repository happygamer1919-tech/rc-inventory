"use client";

// Cele patru file de pe fisa proiectului. Cardul P3-09.
//
// BANDA ESTE AUTORATA COMPLETA, la fel ca la client: Consum, Deviz, Documente,
// Istoric. Deviz si Documente randeaza stari goale romanesti pana cand cardurile
// lor le umplu.
//
// FILA ACTIVA ESTE UN PARAMETRU DE URL, acelasi motiv si acelasi nume de
// parametru ca pe fisa clientului: doua ecrane care fac acelasi lucru cu URL-ul
// nu au voie sa foloseasca doua chei diferite.

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Card, CardHeader, Chip, EmptyState, Table, Td, Th } from "@/components/ui/primitives";
import { formatDate, formatMoney, formatNumber } from "@/lib/data/format";
import { OUTBOUND_STATUS_LABEL, type OutboundStatus } from "@/lib/data/outbound-types";
import { PROJECT_STATUS_LABEL } from "@/lib/data/projects-types";
import type { ProjectMaterials } from "@/lib/data/projects-list";
import type { StatusEvent } from "@/lib/data/projects-list-types";

const TABS = [
  { id: "consum", label: "Consum" },
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

export function ProjectTabs({
  materials,
  history,
}: {
  materials: ProjectMaterials;
  history: StatusEvent[];
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
                  <Link
                    href="/comenzi"
                    className="text-[12.5px] text-rc-orange-deep hover:underline"
                    data-testid="issue-full-history"
                  >
                    Vezi istoricul complet al ieșirilor
                  </Link>
                </div>
              </>
            )}
          </Card>
        ) : null}

        {active === "deviz" ? (
          <Card>
            <CardHeader title="Deviz" />
            <EmptyState
              title="Niciun deviz"
              hint="Estimările pe acest șantier ajung aici odată cu cardul care le aduce."
            />
          </Card>
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
