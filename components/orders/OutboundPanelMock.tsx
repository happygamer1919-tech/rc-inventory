"use client";

// Panoul unei iesiri, INCA PE DATE DEMONSTRATIVE.
//
// Mutat aici neschimbat din ecranul fazei 1, ca sa nu se piarda in timp ce
// intrarile devin reale. P2-05 il inlocuieste cu varianta pe baza de date si
// P2-06 sterge stratul demonstrativ din tot depozitul de cod. Numele fisierului
// spune Mock tocmai ca stergerea lui sa fie evidenta atunci.

import * as React from "react";
import { Button, Chip, Table, Td, Th } from "@/components/ui/primitives";
import type { ChipTone } from "@/components/ui/primitives";
import { formatDate, formatMoney, formatNumber, unitLabel } from "@/lib/mock";
import type { OutboundIssue } from "@/lib/mock";
import { useStore } from "@/lib/store";
import { Panel } from "./Panel";

const outboundTone = (s: string): ChipTone => (s === "Expediată" ? "ok" : "warn");

export function OutboundPanelMock({
  issue,
  onClose,
}: {
  issue: OutboundIssue;
  onClose: () => void;
}) {
  const store = useStore();
  const shipped = issue.status === "Expediată";

  return (
    <Panel
      title={issue.reference}
      subtitle={`${issue.projectName} · ${issue.clientName} · emis ${formatDate(issue.issuedAt)}`}
      chip={<Chip tone={outboundTone(issue.status)}>{issue.status}</Chip>}
      onClose={onClose}
    >
      <div className="px-6 pt-5">
        <div className="rounded-[10px] border border-rc-line bg-rc-paper px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-[12.5px] font-semibold">
              {shipped ? "Marfa a plecat către șantier" : "Marfa este pregătită, dar nu a plecat"}
            </p>
            <p className="text-[12px] text-rc-muted mt-0.5">
              {shipped
                ? `Expediată pe ${formatDate(issue.shippedAt)}. Stocul a fost scăzut.`
                : "La expediere, stocul produselor scade cu cantitățile de mai jos."}
            </p>
          </div>
          {!shipped ? (
            <Button size="sm" onClick={() => store.shipOutbound(issue.id)}>
              Marchează expediată
            </Button>
          ) : null}
        </div>
      </div>

      <section className="px-6 pt-5">
        <h3 className="text-[13.5px] font-bold mb-2">Poziții</h3>
        <div className="rounded-[10px] border border-rc-line overflow-hidden">
          <Table>
            <thead>
              <tr>
                <Th>Produs</Th>
                <Th align="right">Cantitate</Th>
                <Th align="right">Preț vânzare</Th>
              </tr>
            </thead>
            <tbody>
              {issue.lines.map((l, i) => {
                const p = store.products.find((x) => x.id === l.productId);
                return (
                  <tr key={`${l.productId}-${i}`}>
                    <Td>
                      <span className="text-[12.5px] font-medium">{p?.name ?? l.productId}</span>
                      <span className="block rc-num text-[11.5px] text-rc-muted-2 mt-0.5">
                        {p?.sku}
                      </span>
                    </Td>
                    <Td align="right">
                      <span className="rc-num text-[12.5px] font-semibold whitespace-nowrap">
                        {formatNumber(l.quantity)} {p ? unitLabel(p.unit) : ""}
                      </span>
                    </Td>
                    <Td align="right">
                      {l.salePriceMdl === null ? (
                        <span className="text-[12px] text-rc-muted-2">fără preț</span>
                      ) : (
                        <span className="rc-num text-[12.5px] whitespace-nowrap">
                          {formatMoney(l.salePriceMdl)}
                        </span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      </section>

      <section className="px-6 py-5">
        <h3 className="text-[13.5px] font-bold mb-3">Istoricul stărilor</h3>
        <ol className="relative pl-5">
          <span className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-rc-line" />
          {issue.history.map((e, i) => (
            <li key={`${e.at}-${i}`} className="relative pb-4 last:pb-0">
              <span
                className={[
                  "absolute -left-5 top-1 w-[11px] h-[11px] rounded-full border-2 border-white",
                  i === issue.history.length - 1 ? "bg-rc-orange" : "bg-rc-muted-2",
                ].join(" ")}
              />
              <p className="text-[13px] font-semibold">{e.status}</p>
              <p className="rc-num text-[11.5px] text-rc-muted-2 mt-0.5">
                {e.at} · {e.by}
              </p>
              <p className="text-[12.5px] text-rc-muted mt-1 leading-relaxed">{e.note}</p>
            </li>
          ))}
        </ol>
      </section>
    </Panel>
  );
}
